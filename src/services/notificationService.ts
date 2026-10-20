// Recordatorios de tareas en la app. Las reglas (qué tareas, a quién, con cuánta anticipación)
// están en reminderRules.ts y son las mismas que usa el servicio push.
//
// El historial y los tiempos de aviso se guardan en este teléfono (localStorage), por servidor y
// usuario.

import type { GLPISession } from '../types/glpi';
import { GLPIService } from './glpiService';
import { ProjectTaskService } from './projectTaskService';
import {
  DEFAULT_OFFSETS, cleanOffsets, candidateReminders, remindersForUser, reminderTime,
  type AppNotification, type TaskReminder
} from './reminderRules';

export {
  LATE_MS, DEFAULT_OFFSETS, PRESET_OFFSETS, formatOffset, offsetOf, reminderTitle, reminderTime
} from './reminderRules';
export type { AppNotification, TaskReminder, ReminderKind } from './reminderRules';

const MAX_HISTORY = 100;
export const OFFSETS_CHANGED_EVENT = 'itpocket:reminder-offsets';

/** "hoy 15:30", "mañana 09:00" o "lun 27 oct, 09:00". */
export const formatReminderTime = (start: string): string => {
  const date = new Date(reminderTime(start));
  if (isNaN(date.getTime())) return start;
  const time = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return `hoy ${time}`;
  if (sameDay(date, tomorrow)) return `mañana ${time}`;
  return `${date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
};

export class NotificationService {
  private static offsetsKey(session: GLPISession): string {
    return `itpocket_reminder_offsets:${session.baseUrl}:${session.userId || session.username || 'demo'}`;
  }

  private static storageKey(session: GLPISession): string {
    return `itpocket_notifications:${session.baseUrl}:${session.userId || session.username || 'demo'}`;
  }

  /** Tiempos de aviso del usuario, de mayor a menor anticipación. */
  static getOffsets(session: GLPISession): number[] {
    try {
      const raw = localStorage.getItem(this.offsetsKey(session));
      const list = raw ? JSON.parse(raw) : null;
      if (Array.isArray(list)) return cleanOffsets(list);
    } catch { /* sin localStorage: los de siempre */ }
    return [...DEFAULT_OFFSETS];
  }

  static setOffsets(session: GLPISession, offsets: number[]): void {
    const clean = cleanOffsets(offsets);
    try {
      localStorage.setItem(this.offsetsKey(session), JSON.stringify(clean));
    } catch { /* sin localStorage: dura mientras la app esté abierta */ }
    window.dispatchEvent(new CustomEvent(OFFSETS_CHANGED_EVENT, { detail: clean }));
  }

  static loadHistory(session: GLPISession): AppNotification[] {
    try {
      const raw = localStorage.getItem(this.storageKey(session));
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  static saveHistory(session: GLPISession, list: AppNotification[]): void {
    try {
      localStorage.setItem(this.storageKey(session), JSON.stringify(list.slice(0, MAX_HISTORY)));
    } catch { /* sin localStorage: el historial dura mientras la app esté abierta */ }
  }

  private static groupsCache = new Map<string, Promise<number[]>>();

  /** Grupos de GLPI a los que pertenece el usuario de la sesión. */
  private static getMyGroups(session: GLPISession): Promise<number[]> {
    if (session.isMock) return Promise.resolve([]);
    if (!this.groupsCache.has(session.sessionToken)) {
      const promise = fetch(`${session.baseUrl}/apirest.php/getFullSession`, {
        headers: { 'App-Token': session.appToken, 'Session-Token': session.sessionToken }
      })
        .then(res => (res.ok ? res.json() : null))
        .then(data => (Array.isArray(data?.session?.glpigroups) ? data.session.glpigroups.map(Number) : []));
      promise.catch(() => this.groupsCache.delete(session.sessionToken));
      this.groupsCache.set(session.sessionToken, promise);
    }
    return this.groupsCache.get(session.sessionToken)!;
  }

  /** Avisos próximos del usuario de la sesión (ver reminderRules), ordenados por inicio. */
  static async getUpcomingTasks(session: GLPISession, horizonDays = 7): Promise<TaskReminder[]> {
    const ids = await ProjectTaskService.getStateIds(session);
    const [projects, tasksByProject] = await Promise.all([
      session.isMock
        ? GLPIService.getProjects(session).then(list => list.map(p => ({ id: p.id, name: p.name, projectstates_id: 0, is_deleted: 0, users_id: session.userId })))
        : GLPIService.fetchAllPages(session, 'Project'),
      GLPIService.getAllProjectTasks(session)
    ]);
    const { reminders, adminOf } = candidateReminders({
      projects, tasksByProject, closedStateId: ids.closedId, now: Date.now(), horizonDays,
      plainText: html => GLPIService.htmlToPlainText(html)
    });
    if (reminders.length === 0) return [];

    const taskIds = reminders.map(r => r.taskId);
    const [teamRows, groups] = await Promise.all([
      session.isMock
        ? GLPIService.getTaskParticipants(session, taskIds).then(map =>
          Object.entries(map).flatMap(([taskId, list]) => list.map(p => ({ projecttasks_id: Number(taskId), itemtype: p.itemtype, items_id: p.id }))))
        : GLPIService.fetchAllPages(session, 'ProjectTaskTeam'),
      this.getMyGroups(session)
    ]);
    return remindersForUser(reminders, adminOf, teamRows, session.userId || 0, groups);
  }
}
