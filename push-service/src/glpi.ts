// Acceso a GLPI desde el servicio, reutilizando el cliente de la app (src/services) para aplicar
// exactamente las mismas reglas. El cliente está hecho para el navegador; aquí se completan las
// dos piezas que usa de él: localStorage (en memoria) y DOMParser (solo para quitar etiquetas).

const memory = new Map<string, string>();
(globalThis as any).localStorage ??= {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, String(v)); },
  removeItem: (k: string) => { memory.delete(k); }
};
(globalThis as any).DOMParser ??= class {
  parseFromString(value: string) {
    const text = value.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    return { documentElement: { textContent: text }, body: { textContent: text } };
  }
};

import type { GLPISession } from '../../src/types/glpi';
import type { PushConfig } from './config';

const { GLPIService } = await import('../../src/services/glpiService');
const { ProjectTaskService } = await import('../../src/services/projectTaskService');
export { GLPIService, ProjectTaskService };

let session: GLPISession | null = null;

/** Sesión del usuario de servicio (se crea al primer uso y se renueva si GLPI la invalida). */
export const getServiceSession = async (config: PushConfig, renew = false): Promise<GLPISession> => {
  if (session && !renew) return session;
  // initSession escribe en consola cada paso: aquí solo interesa si funcionó
  const log = console.log;
  console.log = () => {};
  try {
    session = await GLPIService.initSession(config.userToken
      ? { baseUrl: config.glpiUrl, appToken: config.appToken, userToken: config.userToken }
      : { baseUrl: config.glpiUrl, appToken: config.appToken, username: config.username, password: config.password });
  } finally {
    console.log = log;
  }
  return session;
};

/** Usuario de GLPI dueño de una sesión de la app (para saber a quién suscribir). */
export const verifyAppSession = async (config: PushConfig, sessionToken: string): Promise<number | null> => {
  if (!sessionToken || /^demo_/.test(sessionToken)) return null;
  const res = await fetch(`${config.glpiUrl}/apirest.php/getFullSession`, {
    headers: { 'App-Token': config.appToken, 'Session-Token': sessionToken }
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const id = Number(data?.session?.glpiID);
  return id > 0 ? id : null;
};

/** Grupos de un usuario (para avisos asignados a grupos). */
export const getUserGroups = async (config: PushConfig, userId: number): Promise<number[]> => {
  const s = await getServiceSession(config);
  const res = await fetch(`${config.glpiUrl}/apirest.php/User/${userId}/Group_User?range=0-200`, {
    headers: { 'App-Token': s.appToken, 'Session-Token': s.sessionToken }
  });
  if (!res.ok) return [];
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows.map((r: any) => Number(r.groups_id)).filter(Boolean) : [];
};
