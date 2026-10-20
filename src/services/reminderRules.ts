// Reglas de los avisos de tareas, sin dependencias del navegador: las usan la app
// (notificationService / useTaskReminders) y el servicio push (push-service), para que ambos
// avisen exactamente igual.
//
// - Se avisa de los hitos (tareas y subtareas del último nivel) con inicio previsto, sin concluir,
//   de proyectos abiertos. Una tarea con subtareas empieza con su primer hito.
// - El aviso es para los responsables de la tarea (usuarios o miembros de un grupo asignado); si la
//   tarea no tiene responsables, para el administrador del proyecto.
// - Cada usuario elige con cuánta anticipación (offsets, en minutos; 0 = al comenzar). Si se avisa
//   tarde, solo se muestra el aviso más reciente y dice el tiempo que de verdad falta.

import type { GLPIProjectTask } from '../types/glpi';

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
  id: string;           // `${taskId}:${offset}:${start}`: cada aviso se dispara una sola vez
  kind: ReminderKind;
  offsetMin?: number;   // minutos que faltaban al avisar (0 = al comenzar). Avisos viejos: según kind
  firedAt: number;
  read: boolean;
}

export const LATE_MS = 5 * 60_000; // si se revisa tarde, el aviso "comienza ahora" vale 5 min
export const DEFAULT_OFFSETS = [1, 0];
export const PRESET_OFFSETS = [0, 1, 5, 15, 30, 60, 120, 1440];

export const reminderTime = (start: string): number => new Date(start.replace(' ', 'T')).getTime();

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

/** Texto de la notificación del sistema (igual en la app y en el push). */
export const notificationText = (n: AppNotification): { title: string; body: string } => ({
  title: `${reminderTitle(n)} · ${n.taskName}`,
  body: `${n.parentName ? `${n.parentName} · ` : ''}${n.projectName}${n.asAdmin ? '\nSin responsable: te avisamos como administrador' : ''}`
});

export const cleanOffsets = (offsets: number[]): number[] =>
  [...new Set(offsets.map(Number).filter(n => Number.isFinite(n) && n >= 0).map(Math.round))].sort((a, b) => b - a);

/**
 * Aviso que toca ahora para una tarea: el de menor anticipación ya vencido. Devuelve también los
 * IDs de todos los avisos vencidos de la tarea (los anteriores ya no tiene caso mostrarlos).
 */
export const dueReminder = (task: TaskReminder, offsets: number[], now: number): { notification: AppNotification; dueIds: string[] } | null => {
  const start = reminderTime(task.start);
  if (isNaN(start)) return null;
  const due = offsets.filter(offset => (offset === 0
    ? now >= start && now < start + LATE_MS
    : now >= start - offset * 60_000 && now < start));
  if (due.length === 0) return null;
  const offset = Math.min(...due);
  // Si el aviso sale tarde (p. ej. la tarea se creó poco antes de empezar), dice lo que de
  // verdad falta, no la anticipación configurada
  const remaining = Math.max(1, Math.ceil((start - now) / 60_000));
  return {
    notification: {
      ...task,
      id: `${task.taskId}:${offset}:${task.start}`,
      kind: offset === 0 ? 'now' : 'soon',
      offsetMin: offset === 0 ? 0 : Math.min(offset, remaining),
      firedAt: now,
      read: false
    },
    dueIds: due.map(o => `${task.taskId}:${o}:${task.start}`)
  };
};

export interface ReminderSource {
  projects: any[];                               // filas de Project de GLPI
  tasksByProject: Map<number, GLPIProjectTask[]>;
  closedStateId: number;
  now: number;
  horizonDays: number;
  plainText: (html: string) => string;           // nombres de proyecto (pueden traer HTML)
}

/** Hitos que comienzan dentro del horizonte (de todos los usuarios) y el administrador de cada proyecto. */
export const candidateReminders = (src: ReminderSource): { reminders: TaskReminder[]; adminOf: Map<number, number> } => {
  const until = src.now + src.horizonDays * 24 * 3600_000;
  const reminders: TaskReminder[] = [];
  const adminOf = new Map<number, number>();
  src.projects
    .filter((p: any) => !Number(p.is_deleted) && !Number(p.is_template) && Number(p.projectstates_id) !== src.closedStateId)
    .forEach((p: any) => {
      adminOf.set(Number(p.id), Number(p.users_id) || 0);
      const tasks = src.tasksByProject.get(Number(p.id)) || [];
      const byId = new Map(tasks.map(t => [t.id, t]));
      const parents = new Set(tasks.map(t => t.projecttasks_id));
      tasks
        .filter(t => !parents.has(t.id) && t.plan_start_date && t.percent_done < 100 && t.projectstates_id !== src.closedStateId)
        .forEach(t => {
          const time = reminderTime(t.plan_start_date!);
          if (isNaN(time) || time < src.now - LATE_MS || time > until) return;
          reminders.push({
            taskId: t.id,
            taskName: t.name,
            parentName: byId.get(t.projecttasks_id)?.name,
            projectId: Number(p.id),
            projectName: src.plainText(String(p.name || `Proyecto #${p.id}`)),
            start: t.plan_start_date!
          });
        });
    });
  return { reminders, adminOf };
};

/**
 * De los avisos candidatos, los que le tocan a un usuario: tareas donde es responsable (o lo es un
 * grupo suyo) y, si la tarea no tiene responsables, las de proyectos que administra.
 * teamRows: filas de ProjectTaskTeam ({ projecttasks_id, itemtype, items_id }).
 */
export const remindersForUser = (
  candidates: TaskReminder[],
  adminOf: Map<number, number>,
  teamRows: { projecttasks_id: number; itemtype: string; items_id: number }[],
  userId: number,
  groups: number[]
): TaskReminder[] => {
  const wanted = new Set(candidates.map(c => c.taskId));
  const mine = new Set<number>();
  const withTeam = new Set<number>();
  teamRows.forEach(row => {
    const taskId = Number(row.projecttasks_id);
    const id = Number(row.items_id);
    if (!wanted.has(taskId)) return;
    withTeam.add(taskId);
    if ((row.itemtype === 'User' && id === userId) || (row.itemtype === 'Group' && groups.includes(id))) mine.add(taskId);
  });
  return candidates
    .filter(r => mine.has(r.taskId) || (!withTeam.has(r.taskId) && adminOf.get(r.projectId) === userId))
    .map(r => (mine.has(r.taskId) ? r : { ...r, asAdmin: true }))
    .sort((a, b) => a.start.localeCompare(b.start));
};
