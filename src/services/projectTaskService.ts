// Tareas de proyecto: alta (con o sin subtareas), edición y cálculos automáticos.
//
// Reglas (definidas con el equipo de TI):
// - Una tarea sin subtareas (último nivel) es siempre un HITO: solo lleva inicio previsto y su
//   marca de tiempo al concluirla (inicio real). No tiene fin ni duración.
// - Una tarea con subtareas NO es hito: sus fechas previstas y reales, duraciones, avance y
//   estado se calculan con sus hijos:
//     inicio previsto = el más temprano de sus hijos; fin previsto = el más tardío
//     inicio real = el primer hito concluido; fin real = el último, cuando ya concluyeron todos
//     avance = promedio de sus hijos; estado = New / Processing / Closed según sus hijos
// - Proyecto: el fin previsto es la fecha más tardía de sus tareas; al concluir el último hito
//   toma la fecha de fin real y pasa a cerrado. Si después vuelve a tener hitos pendientes (se
//   crearon o se reabrieron tareas, en la app o en GLPI), se reabre (Processing, sin fin real).
// Los cálculos se guardan en GLPI (syncRollups) al abrir el proyecto y tras cada cambio, así que
// también reflejan las tareas creadas o cambiadas desde GLPI.

import type { GLPISession, GLPIProjectTask } from '../types/glpi';
import { GLPIService } from './glpiService';

export interface NewMilestoneInput {
  name: string;
  content: string;
  plan_start_date: string; // input datetime-local ("YYYY-MM-DDTHH:MM") o vacío
}

export interface NewTaskInput extends NewMilestoneInput {
  projectId: number;
  parentId: number;          // 0 = tarea de primer nivel del proyecto
  projectstates_id: number;  // solo aplica si es hito; una tarea con subtareas calcula su estado
  subtasks: NewMilestoneInput[]; // vacío = la tarea es un hito
}

export interface TaskEdit {
  name: string;
  content: string;
  projecttasks_id: number;
  plan_start_date?: string;   // solo hitos (input datetime-local o vacío)
  projectstates_id?: number;  // solo hitos
}

export interface ProjectStateIds {
  newId: number;
  processingId: number;
  closedId: number;
}

interface ProjectSnapshot {
  plan_end_date: string | null;
  real_end_date: string | null;
  projectstates_id: number;
}

export interface RollupPlan {
  taskUpdates: { id: number; changes: Record<string, string | number | null> }[];
  projectChanges: Record<string, string | number | null>;
  tasks: GLPIProjectTask[]; // las tareas con los cálculos ya aplicados
}

const headers = (session: GLPISession) => ({
  'Content-Type': 'application/json',
  'App-Token': session.appToken,
  'Session-Token': session.sessionToken
});

const readError = async (res: Response): Promise<string> => {
  try {
    const body = await res.json();
    return Array.isArray(body) && body[1] ? `: ${body[1]}` : '';
  } catch {
    return '';
  }
};

const toTime = (value?: string | null): number | null => {
  if (!value) return null;
  const t = new Date(value.replace(' ', 'T')).getTime();
  return isNaN(t) ? null : t;
};

const minDate = (values: (string | null | undefined)[]): string | null =>
  values.filter((v): v is string => !!v).sort()[0] || null;

const maxDate = (values: (string | null | undefined)[]): string | null =>
  values.filter((v): v is string => !!v).sort().at(-1) || null;

const seconds = (from: string | null, to: string | null): number => {
  const a = toTime(from);
  const b = toTime(to);
  return a !== null && b !== null && b > a ? Math.round((b - a) / 1000) : 0;
};

export class ProjectTaskService {
  private static stateIdsCache = new Map<string, Promise<ProjectStateIds>>();

  /** IDs de los estados New, Processing y Closed (dependen de cada instalación de GLPI). */
  static getStateIds(session: GLPISession): Promise<ProjectStateIds> {
    if (session.isMock) return Promise.resolve({ newId: 1, processingId: 2, closedId: 3 });
    const key = session.baseUrl;
    if (!this.stateIdsCache.has(key)) {
      const promise = Promise.all([GLPIService.getOpenProjectStates(session), GLPIService.getClosedProjectStateId(session)])
        .then(([open, closedId]) => ({
          newId: open[0]?.id || 1,
          processingId: open[1]?.id || open[0]?.id || 2,
          closedId
        }));
      promise.catch(() => this.stateIdsCache.delete(key));
      this.stateIdsCache.set(key, promise);
    }
    return this.stateIdsCache.get(key)!;
  }

  /**
   * Crea una tarea. Sin subtareas es un hito; con subtareas se crea la tarea (no hito) y sus
   * subtareas como hitos debajo de ella. Devuelve el ID de la tarea creada.
   */
  static async createTask(session: GLPISession, input: NewTaskInput): Promise<number> {
    const ids = await this.getStateIds(session);
    const hasSubtasks = input.subtasks.length > 0;
    const content = (text: string) => (text.trim() ? GLPIService.plainTextToHtml(text.trim()) : '');
    const date = (value: string) => GLPIService.inputToGlpiDateTime(value);

    if (session.isMock) {
      const tasks = GLPIService.mockProjectTasks(input.projectId);
      let nextId = Math.max(1000, ...tasks.map(t => t.id)) + 1;
      const make = (name: string, text: string, parentId: number, milestone: boolean, start: string, stateId: number): GLPIProjectTask => ({
        id: nextId++, projects_id: input.projectId, projecttasks_id: parentId, name: name.trim(), content: text.trim(),
        percent_done: 0, is_milestone: milestone, state: stateId, projectstates_id: stateId,
        plan_start_date: date(start) || undefined, plan_end_date: milestone ? date(start) || undefined : undefined
      });
      const task = make(input.name, input.content, input.parentId, !hasSubtasks, hasSubtasks ? '' : input.plan_start_date, hasSubtasks ? ids.newId : input.projectstates_id);
      tasks.push(task, ...input.subtasks.map(sub => make(sub.name, sub.content, task.id, true, sub.plan_start_date, ids.newId)));
      return task.id;
    }

    const res = await fetch(`${session.baseUrl}/apirest.php/ProjectTask`, {
      method: 'POST',
      headers: headers(session),
      body: JSON.stringify({
        input: {
          projects_id: input.projectId,
          projecttasks_id: input.parentId,
          name: input.name.trim(),
          content: content(input.content),
          is_milestone: hasSubtasks ? 0 : 1,
          auto_percent_done: 0,
          percent_done: 0,
          projectstates_id: hasSubtasks ? ids.newId : input.projectstates_id || ids.newId,
          plan_start_date: hasSubtasks ? null : date(input.plan_start_date)
        }
      })
    });
    const created = await res.json().catch(() => null);
    const taskId = Number(created?.id);
    if (!res.ok || !taskId) throw new Error(`GLPI no creó la tarea (${res.status})`);

    if (hasSubtasks) {
      const subRes = await fetch(`${session.baseUrl}/apirest.php/ProjectTask`, {
        method: 'POST',
        headers: headers(session),
        body: JSON.stringify({
          input: input.subtasks.map(sub => ({
            projects_id: input.projectId,
            projecttasks_id: taskId,
            name: sub.name.trim(),
            content: content(sub.content),
            is_milestone: 1,
            auto_percent_done: 0,
            percent_done: 0,
            projectstates_id: ids.newId,
            plan_start_date: date(sub.plan_start_date)
          }))
        })
      });
      const results = await subRes.json().catch(() => null);
      GLPIService.rememberProjectTaskIds(session, [taskId, ...(Array.isArray(results) ? results.map((r: any) => Number(r?.id)).filter(Boolean) : [])]);
      if (!subRes.ok || !Array.isArray(results) || results.some((r: any) => !r?.id)) {
        throw new Error(`La tarea se creó, pero no todas sus subtareas (${subRes.status}). Revisa el árbol y agrega las que falten.`);
      }
    } else {
      GLPIService.rememberProjectTaskIds(session, [taskId]);
    }
    return taskId;
  }

  /** Guarda la edición de una tarea. Fechas y estado solo se editan en hitos. */
  static async updateTask(session: GLPISession, task: GLPIProjectTask, edit: TaskEdit, isMilestone: boolean): Promise<void> {
    const changes: Record<string, unknown> = {
      name: edit.name.trim(),
      content: edit.content.trim() ? GLPIService.plainTextToHtml(edit.content.trim()) : '',
      projecttasks_id: edit.projecttasks_id
    };
    if (isMilestone) {
      if (edit.plan_start_date !== undefined) {
        const start = GLPIService.inputToGlpiDateTime(edit.plan_start_date);
        changes.plan_start_date = start;
        changes.plan_end_date = start; // un hito es un instante
      }
      if (edit.projectstates_id) changes.projectstates_id = edit.projectstates_id;
    }
    if (session.isMock) {
      const found = GLPIService.mockProjectTasks(task.projects_id).find(t => t.id === task.id);
      if (found) Object.assign(found, { ...changes, content: edit.content.trim(), state: changes.projectstates_id ?? found.state });
      return;
    }
    await GLPIService.putItem(session, 'ProjectTask', task.id, changes, 'la tarea');
  }

  /**
   * Calcula (sin guardar) lo que debe cambiar en las tareas padre y en el proyecto según las
   * reglas de arriba. Solo se incluyen los campos que realmente cambian.
   */
  static computeRollups(tasks: GLPIProjectTask[], project: ProjectSnapshot, ids: ProjectStateIds): RollupPlan {
    const byId = new Map(tasks.map(t => [t.id, { ...t }]));
    const children = new Map<number, number[]>();
    byId.forEach(t => {
      const parent = byId.has(t.projecttasks_id) ? t.projecttasks_id : 0;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(t.id);
    });

    const isDone = (t: GLPIProjectTask) => t.percent_done >= 100 || t.projectstates_id === ids.closedId;
    const updates = new Map<number, Record<string, string | number | null>>();
    const setField = (t: GLPIProjectTask, field: keyof GLPIProjectTask, value: string | number | boolean | null) => {
      const current = (t[field] ?? null) as unknown;
      const normalized = typeof value === 'boolean' ? value : value ?? null;
      const same = typeof normalized === 'boolean' ? Boolean(current) === normalized : (current || null) === (normalized || null);
      if (same) return;
      (t as any)[field] = typeof normalized === 'boolean' ? normalized : normalized ?? undefined;
      const change = updates.get(t.id) || {};
      change[field] = typeof normalized === 'boolean' ? (normalized ? 1 : 0) : normalized;
      updates.set(t.id, change);
    };

    // Valores que cada tarea aporta a su padre
    const visit = (id: number): { planStart: string | null; planEnd: string | null; realStart: string | null; realEnd: string | null; done: boolean; percent: number } => {
      const t = byId.get(id)!;
      const kids = children.get(id) || [];
      if (kids.length === 0) {
        setField(t, 'is_milestone', true);
        const done = isDone(t);
        return {
          planStart: t.plan_start_date || null,
          planEnd: t.plan_end_date || t.plan_start_date || null,
          realStart: t.real_start_date || null,
          realEnd: done ? t.real_end_date || t.real_start_date || null : null,
          done,
          percent: done ? 100 : t.percent_done
        };
      }
      const values = kids.map(visit);
      const done = values.every(v => v.done);
      const started = values.some(v => v.done || v.realStart || v.percent > 0);
      const planStart = minDate(values.map(v => v.planStart));
      const planEnd = maxDate(values.map(v => v.planEnd));
      const realStart = minDate(values.map(v => v.realStart));
      const realEnd = done ? maxDate(values.map(v => v.realEnd)) : null;
      const percent = Math.floor(values.reduce((sum, v) => sum + v.percent, 0) / values.length);

      setField(t, 'is_milestone', false);
      setField(t, 'plan_start_date', planStart);
      setField(t, 'plan_end_date', planEnd);
      setField(t, 'planned_duration', seconds(planStart, planEnd));
      setField(t, 'real_start_date', realStart);
      setField(t, 'real_end_date', realEnd);
      setField(t, 'effective_duration', seconds(realStart, realEnd));
      setField(t, 'percent_done', percent);
      setField(t, 'projectstates_id', done ? ids.closedId : started ? ids.processingId : ids.newId);
      if (t.projectstates_id !== undefined) t.state = t.projectstates_id;
      return { planStart, planEnd, realStart, realEnd, done, percent };
    };
    const roots = (children.get(0) || []).map(visit);

    const projectChanges: Record<string, string | number | null> = {};
    const projectPlanEnd = maxDate(roots.map(r => r.planEnd));
    if (projectPlanEnd && projectPlanEnd !== project.plan_end_date) projectChanges.plan_end_date = projectPlanEnd;
    if (roots.length > 0 && roots.every(r => r.done)) {
      const realEnd = maxDate(roots.map(r => r.realEnd));
      if (realEnd && realEnd !== project.real_end_date) projectChanges.real_end_date = realEnd;
      if (project.projectstates_id !== ids.closedId) projectChanges.projectstates_id = ids.closedId;
    } else if (roots.length > 0 && project.projectstates_id === ids.closedId) {
      // Proyecto cerrado con hitos pendientes (tareas nuevas o reabiertas): vuelve a estar en proceso
      projectChanges.projectstates_id = ids.processingId;
      projectChanges.real_end_date = null;
    }

    // Las tareas con cambios conservan el auto_percent_done en 0: el avance lo pone la app
    const taskUpdates = [...updates.entries()].map(([id, changes]) => ({
      id,
      changes: 'percent_done' in changes ? { ...changes, auto_percent_done: 0 } : changes
    }));
    return { taskUpdates, projectChanges, tasks: tasks.map(t => byId.get(t.id)!) };
  }

  /**
   * Aplica los cálculos automáticos y los guarda en GLPI (una petición para todas las tareas y
   * otra para el proyecto, solo si algo cambió). Devuelve las tareas ya calculadas y el fin
   * previsto vigente del proyecto.
   */
  static async syncRollups(
    session: GLPISession,
    projectId: number,
    tasks: GLPIProjectTask[]
  ): Promise<{ tasks: GLPIProjectTask[]; planEnd: string | null; projectClosed: boolean; projectReopened: boolean }> {
    const ids = await this.getStateIds(session);
    let project: ProjectSnapshot = { plan_end_date: null, real_end_date: null, projectstates_id: 0 };
    if (!session.isMock) {
      const res = await fetch(`${session.baseUrl}/apirest.php/Project/${projectId}`, { headers: headers(session) });
      if (res.ok) {
        const p = await res.json();
        project = { plan_end_date: p.plan_end_date || null, real_end_date: p.real_end_date || null, projectstates_id: Number(p.projectstates_id) || 0 };
      }
    }

    const plan = this.computeRollups(tasks, project, ids);
    if (session.isMock) {
      const mock = GLPIService.mockProjectTasks(projectId);
      plan.tasks.forEach(t => { const found = mock.find(m => m.id === t.id); if (found) Object.assign(found, t); });
    } else {
      if (plan.taskUpdates.length > 0) {
        const res = await fetch(`${session.baseUrl}/apirest.php/ProjectTask`, {
          method: 'PUT',
          headers: headers(session),
          body: JSON.stringify({ input: plan.taskUpdates.map(u => ({ id: u.id, ...u.changes })) })
        });
        if (!res.ok) throw new Error(`No se pudieron guardar los cálculos de las tareas (${res.status})${await readError(res)}`);
      }
      if (Object.keys(plan.projectChanges).length > 0) {
        await GLPIService.putItem(session, 'Project', projectId, plan.projectChanges, 'el proyecto');
      }
    }
    return {
      tasks: plan.tasks,
      planEnd: (plan.projectChanges.plan_end_date as string | undefined) ?? project.plan_end_date ?? maxDate(plan.tasks.map(t => t.plan_end_date || t.plan_start_date)),
      projectClosed: plan.projectChanges.projectstates_id === ids.closedId,
      projectReopened: plan.projectChanges.projectstates_id === ids.processingId
    };
  }
}
