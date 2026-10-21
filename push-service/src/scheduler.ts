// Revisa las tareas de GLPI y manda los avisos por Web Push. Solo consulta GLPI si hay teléfonos
// suscritos. Los datos de GLPI se recargan cada minuto (y al instante cuando la app avisa que
// cambiaron tareas); los avisos se revisan cada 20 segundos.

import webpush from 'web-push';
import type { PushConfig } from './config';
import { GLPIService, ProjectTaskService, getServiceSession, getUserGroups } from './glpi';
import { getSubscriptions, wasSent, markSent, removeSubscription } from './store';
import {
  candidateReminders, remindersForUser, dueReminder, notificationText, type TaskReminder
} from '../../src/services/reminderRules';

const DATA_REFRESH_MS = 60_000;
const TICK_MS = 20_000;
const GROUPS_TTL_MS = 10 * 60_000;
const PUSH_TTL_S = 10 * 60; // si el teléfono está sin red, el aviso espera hasta 10 min

interface Snapshot {
  candidates: TaskReminder[];
  adminOf: Map<number, number>;
  teamRows: { projecttasks_id: number; itemtype: string; items_id: number }[];
  loadedAt: number;
}

let snapshot: Snapshot | null = null;
let loading: Promise<void> | null = null;
const groupsCache = new Map<number, { groups: number[]; at: number }>();

const horizonDays = () => Math.max(7, Math.ceil(Math.max(0, ...getSubscriptions().flatMap(s => s.offsets)) / 1440) + 1);

const loadSnapshot = async (config: PushConfig, retry = true): Promise<void> => {
  try {
    const session = await getServiceSession(config);
    const quiet = console.log;
    console.log = () => {}; // el cliente de la app escribe mucho en consola
    try {
      const ids = await ProjectTaskService.getStateIds(session);
      const [projects, tasksByProject, teamRows] = await Promise.all([
        GLPIService.fetchAllPages(session, 'Project'),
        GLPIService.getAllProjectTasks(session),
        GLPIService.fetchAllPages(session, 'ProjectTaskTeam')
      ]);
      const { reminders, adminOf } = candidateReminders({
        projects, tasksByProject, closedStateId: ids.closedId, now: Date.now(), horizonDays: horizonDays(),
        plainText: html => GLPIService.htmlToPlainText(html)
      });
      snapshot = { candidates: reminders, adminOf, teamRows, loadedAt: Date.now() };
    } finally {
      console.log = quiet;
    }
  } catch (err: any) {
    // La sesión del usuario de servicio pudo caducar: se renueva una vez
    if (retry) {
      await getServiceSession(config, true).catch(() => {});
      return loadSnapshot(config, false);
    }
    console.error('[push] No se pudieron leer las tareas de GLPI:', err.message || err);
  }
};

const groupsOf = async (config: PushConfig, userId: number): Promise<number[]> => {
  const cached = groupsCache.get(userId);
  if (cached && Date.now() - cached.at < GROUPS_TTL_MS) return cached.groups;
  const groups = await getUserGroups(config, userId).catch(() => cached?.groups || []);
  groupsCache.set(userId, { groups, at: Date.now() });
  return groups;
};

/** Pide recargar las tareas en la siguiente revisión (p. ej. al suscribirse un teléfono). */
export const invalidateSnapshot = () => {
  if (snapshot) snapshot.loadedAt = 0;
  runNow?.();
};

let runNow: (() => void) | null = null;

const tick = async (config: PushConfig) => {
  const subs = getSubscriptions();
  if (subs.length === 0) return;
  if (!snapshot || Date.now() - snapshot.loadedAt > DATA_REFRESH_MS) {
    loading ??= loadSnapshot(config).finally(() => { loading = null; });
    await loading;
  }
  if (!snapshot) return;
  const now = Date.now();
  for (const sub of subs) {
    const groups = await groupsOf(config, sub.userId);
    const mine = remindersForUser(snapshot.candidates, snapshot.adminOf, snapshot.teamRows, sub.userId, groups);
    for (const task of mine) {
      const due = dueReminder(task, sub.offsets, now);
      if (!due || wasSent(sub.endpoint, due.notification.id)) continue;
      markSent(sub.endpoint, due.dueIds);
      const n = due.notification;
      const { title, body } = notificationText(n);
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ title, body, tag: n.id, data: { id: n.id, taskId: n.taskId, projectId: n.projectId, projectName: n.projectName } }),
          { TTL: PUSH_TTL_S, urgency: 'high' }
        );
        console.log(`[push] Aviso enviado al usuario ${sub.userId}: ${title}`);
      } catch (err: any) {
        // 404/410: el teléfono canceló la suscripción (desinstaló, borró datos, etc.)
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          removeSubscription(sub.endpoint);
          console.log(`[push] Suscripción vencida eliminada (usuario ${sub.userId})`);
        } else {
          console.error('[push] No se pudo enviar el aviso:', err?.statusCode || '', err?.body || err?.message || err);
        }
      }
    }
  }
};

export const startScheduler = (config: PushConfig) => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await tick(config); } finally { running = false; }
  };
  runNow = run;
  run();
  setInterval(run, TICK_MS);
};
