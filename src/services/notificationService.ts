// Recordatorios de tareas: avisan con la anticipación que elige cada usuario (por defecto 1 minuto
// antes y al comenzar) de cada tarea con inicio previsto de un proyecto abierto, solo a sus responsables: los usuarios asignados
// a la tarea (pestaña "Equipo" de GLPI) o los miembros de un grupo asignado. Si la tarea no tiene
// responsables, el aviso le llega al administrador del proyecto. Se avisa de los hitos (tareas y subtareas
// del último nivel), que son los que se ejecutan; una tarea con subtareas empieza con su primer
// hito, así que avisar de ambos duplicaría el aviso.
//
// El historial y los tiempos de aviso se guardan en este teléfono (localStorage), por servidor y
// usuario.

import type { GLPISession, GLPIProjectTask } from '../types/glpi';
import { GLPIService } from './glpiService';
import { ProjectTaskService } from './projectTaskService';

export interface TaskReminder {
  taskId: number;
  taskName: string;
  parentName?: string;  // tarea a la que pertenece (si es subtarea)
  projectId: number;
  projectName: string;
  start: string;        // inicio previsto ("YYYY-MM-DD HH:MM:SS", hora local)
  asAdmin?: boolean;    // la tarea no tiene responsables: se avisa al administrador del proyecto
}

export type ReminderKind = 'soon' | 'now'; // antes de comenzar / al comenzar

export interface AppNotification extends TaskReminder {
  id: string;           // `${taskId}:${offsetMin}:${start}`: cada aviso se dispara una sola vez
  kind: ReminderKind;
  offsetMin?: number;   // minutos que faltaban al avisar (0 = al comenzar). Avisos viejos: según kind
  firedAt: number;
  read: boolean;
}

const MAX_HISTORY = 100;
export const LATE_MS = 5 * 60_000; // si la app se abre tarde, el aviso "comienza ahora" vale 5 min

// Tiempos de aviso (minutos antes del inicio previsto)
export const DEFAULT_OFFSETS = [1, 0];
export const PRESET_OFFSETS = [0, 1, 5, 15, 30, 60, 120, 1440];
export const OFFSETS_CHANGED_EVENT = 'itpocket:reminder-offsets';

/** "1 minuto", "15 minutos", "1 hora", "1 h 30 min", "1 día", "2 días 3 h". */
export const formatOffset = (minutes: number): string => {
  if (minutes < 60) return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} hora${h === 1 ? '' : 's'}`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.round((minutes % 1440) / 60);
  return h ? `${d} día${d === 1 ? '' : 's'} ${h} h` : `${d} día${d === 1 ? '' : 's'}`;
};

export const offsetOf = (n: AppNotification): number => n.offsetMin ?? (n.kind === 'now' ? 0 : 1);

/** Título del aviso: "Comienza ahora" / "Comienza en 1 hora" (o en pasado para el historial). */
export const reminderTitle = (n: AppNotification, past = false): string => {
  const offset = offsetOf(n);
  if (offset === 0) return past ? 'Comenzó' : 'Comienza ahora';
  return `${past ? 'Comenzaba' : 'Comienza'} en ${formatOffset(offset)}`;
};

export const reminderTime = (start: string): number => new Date(start.replace(' ', 'T')).getTime();

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

  /** Tiempos de aviso del usuario, de mayor a menor anticipación. */
  static getOffsets(session: GLPISession): number[] {
    try {
      const raw = localStorage.getItem(this.offsetsKey(session));
      const list = raw ? JSON.parse(raw) : null;
      if (Array.isArray(list)) return [...new Set(list.map(Number).filter(n => n >= 0))].sort((a, b) => b - a);
    } catch { /* sin localStorage: los de siempre */ }
    return [...DEFAULT_OFFSETS];
  }

  static setOffsets(session: GLPISession, offsets: number[]): void {
    const clean = [...new Set(offsets.filter(n => Number.isFinite(n) && n >= 0).map(Math.round))].sort((a, b) => b - a);
    try {
      localStorage.setItem(this.offsetsKey(session), JSON.stringify(clean));
    } catch { /* sin localStorage: dura mientras la app esté abierta */ }
    window.dispatchEvent(new CustomEvent(OFFSETS_CHANGED_EVENT, { detail: clean }));
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

  /**
   * De las tareas indicadas: en cuáles el usuario de la sesión es responsable (mine) y cuáles no
   * tienen ningún responsable (unassigned).
   */
  private static async taskAssignments(session: GLPISession, taskIds: number[]): Promise<{ mine: Set<number>; unassigned: Set<number> }> {
    if (taskIds.length === 0) return { mine: new Set(), unassigned: new Set() };
    const wanted = new Set(taskIds);
    const [rows, groups] = await Promise.all([
      session.isMock
        ? GLPIService.getTaskParticipants(session, taskIds).then(map =>
          Object.entries(map).flatMap(([taskId, list]) => list.map(p => ({ projecttasks_id: Number(taskId), itemtype: p.itemtype, items_id: p.id }))))
        : GLPIService.fetchAllPages(session, 'ProjectTaskTeam'),
      this.getMyGroups(session)
    ]);
    const mine = new Set<number>();
    const withTeam = new Set<number>();
    rows.forEach((row: any) => {
      const taskId = Number(row.projecttasks_id);
      const id = Number(row.items_id);
      if (!wanted.has(taskId)) return;
      withTeam.add(taskId);
      if ((row.itemtype === 'User' && id === session.userId) || (row.itemtype === 'Group' && groups.includes(id))) mine.add(taskId);
    });
    return { mine, unassigned: new Set(taskIds.filter(id => !withTeam.has(id))) };
  }

  private static storageKey(session: GLPISession): string {
    return `itpocket_notifications:${session.baseUrl}:${session.userId || session.username || 'demo'}`;
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

  /**
   * Hitos con inicio previsto desde hace 5 minutos hasta `horizonDays` días, sin concluir, de
   * proyectos que no están cerrados, donde el usuario es responsable (o, si la tarea no tiene
   * responsables, donde es el administrador del proyecto). Ordenados por inicio.
   */
  static async getUpcomingTasks(session: GLPISession, horizonDays = 7): Promise<TaskReminder[]> {
    const ids = await ProjectTaskService.getStateIds(session);
    const [projects, tasksByProject] = await Promise.all([
      session.isMock
        ? GLPIService.getProjects(session).then(list => list.map(p => ({ id: p.id, name: p.name, projectstates_id: 0, is_deleted: 0, users_id: session.userId })))
        : GLPIService.fetchAllPages(session, 'Project'),
      GLPIService.getAllProjectTasks(session)
    ]);

    const now = Date.now();
    const until = now + horizonDays * 24 * 3600_000;
    const result: TaskReminder[] = [];
    const adminOf = new Map<number, number>(); // proyecto → administrador
    projects
      .filter((p: any) => !Number(p.is_deleted) && !Number(p.is_template) && Number(p.projectstates_id) !== ids.closedId)
      .forEach((p: any) => {
        adminOf.set(Number(p.id), Number(p.users_id) || 0);
        const tasks: GLPIProjectTask[] = tasksByProject.get(Number(p.id)) || [];
        const byId = new Map(tasks.map(t => [t.id, t]));
        const parents = new Set(tasks.map(t => t.projecttasks_id));
        tasks
          .filter(t => !parents.has(t.id) && t.plan_start_date && t.percent_done < 100 && t.projectstates_id !== ids.closedId)
          .forEach(t => {
            const time = reminderTime(t.plan_start_date!);
            if (isNaN(time) || time < now - LATE_MS || time > until) return;
            result.push({
              taskId: t.id,
              taskName: t.name,
              parentName: byId.get(t.projecttasks_id)?.name,
              projectId: Number(p.id),
              projectName: GLPIService.htmlToPlainText(String(p.name || `Proyecto #${p.id}`)),
              start: t.plan_start_date!
            });
          });
      });
    const { mine, unassigned } = await this.taskAssignments(session, result.map(r => r.taskId));
    return result
      .filter(r => mine.has(r.taskId) || (unassigned.has(r.taskId) && adminOf.get(r.projectId) === session.userId))
      .map(r => (mine.has(r.taskId) ? r : { ...r, asAdmin: true }))
      .sort((a, b) => a.start.localeCompare(b.start));
  }
}
