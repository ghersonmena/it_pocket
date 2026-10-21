// Avisos con la app cerrada (Web Push), si el servidor tiene configurado el servicio opcional
// push-service. Sin él, /push/status responde que no hay push (o no existe) y la app no lo ofrece.

import type { GLPISession } from '../types/glpi';

const SUBSCRIBED_KEY = 'itpocket_push_subscribed';

export interface PushStatus {
  enabled: boolean;
  publicKey: string | null;
}

const post = async (path: string, body: unknown): Promise<void> => {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `El servicio de avisos respondió ${res.status}`);
  }
};

const base64ToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

const subscribedKey = (session: GLPISession) => `${SUBSCRIBED_KEY}:${session.baseUrl}:${session.userId || ''}`;

export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** ¿El servidor ofrece avisos push? */
export const getPushStatus = async (session: GLPISession): Promise<PushStatus> => {
  if (session.isMock || !isPushSupported()) return { enabled: false, publicKey: null };
  try {
    const res = await fetch('/push/status', { cache: 'no-store' });
    const data = res.ok ? await res.json() : null;
    return data?.enabled && data.publicKey ? { enabled: true, publicKey: String(data.publicKey) } : { enabled: false, publicKey: null };
  } catch {
    return { enabled: false, publicKey: null };
  }
};

export const isPushSubscribed = (session: GLPISession): boolean => {
  try {
    return localStorage.getItem(subscribedKey(session)) === '1';
  } catch {
    return false;
  }
};

const setSubscribed = (session: GLPISession, value: boolean) => {
  try {
    if (value) localStorage.setItem(subscribedKey(session), '1');
    else localStorage.removeItem(subscribedKey(session));
  } catch { /* sin localStorage */ }
};

/** Suscribe este teléfono a los avisos push del usuario de la sesión (requiere permiso). */
export const subscribePush = async (session: GLPISession, publicKey: string, offsets: number[]): Promise<void> => {
  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription())
    || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) });
  await post('/push/subscribe', { subscription: subscription.toJSON(), offsets, sessionToken: session.sessionToken });
  setSubscribed(session, true);
};

/** Deja de recibir avisos push en este teléfono. */
export const unsubscribePush = async (session: GLPISession): Promise<void> => {
  setSubscribed(session, false);
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await post('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
};

/** Envía al servidor los tiempos de aviso (si este teléfono está suscrito). */
export const updatePushOffsets = async (session: GLPISession, offsets: number[]): Promise<void> => {
  if (!isPushSubscribed(session) || !isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await post('/push/preferences', { endpoint: subscription.endpoint, offsets, sessionToken: session.sessionToken }).catch(() => {});
};

/**
 * Al abrir la app: si este teléfono estaba suscrito, se vuelve a registrar (por si el navegador
 * renovó la suscripción o el servidor la perdió).
 */
export const refreshPushSubscription = async (session: GLPISession, offsets: number[]): Promise<void> => {
  if (!isPushSubscribed(session) || Notification.permission !== 'granted') return;
  const status = await getPushStatus(session);
  if (!status.enabled || !status.publicKey) return;
  await subscribePush(session, status.publicKey, offsets).catch(err => console.warn('[Push] No se pudo renovar la suscripción:', err));
};

/**
 * Avisa al servicio push que cambiaron tareas (alta, edición, responsables) para que recargue de
 * inmediato y los avisos de todos los usuarios queden al día. Sin servicio push no hace nada.
 */
export const notifyTasksChanged = (session: GLPISession): void => {
  if (session.isMock) return;
  fetch('/push/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken: session.sessionToken })
  }).catch(() => { /* sin servicio push */ });
};
