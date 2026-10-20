// Notificaciones del sistema (barra de notificaciones / pantalla de bloqueo) mientras la app está
// abierta o en segundo plano. Usa el service worker (public/sw.js), que es lo que exigen Android
// y iOS. En iPhone solo existen con la app instalada en la pantalla de inicio (iOS 16.4+).

import { notificationText, type AppNotification } from './reminderRules';

const PREF_KEY = 'itpocket_device_notifications';
export const OPEN_TASK_MESSAGE = 'itpocket:open-task';

export type DevicePermission = 'granted' | 'denied' | 'default' | 'unsupported';

export const isDeviceNotificationSupported = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

export const getDevicePermission = (): DevicePermission =>
  isDeviceNotificationSupported() ? (Notification.permission as DevicePermission) : 'unsupported';

/** iPhone/iPad usando la app desde el navegador (sin instalar): ahí iOS no permite notificaciones. */
export const isIosBrowser = (): boolean => {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as any).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && !standalone;
};

export const isDeviceNotificationEnabled = (): boolean => {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setDeviceNotificationEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off');
  } catch { /* sin localStorage */ }
};

export const registerServiceWorker = (): void => {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(err => console.warn('[Notificaciones] No se registró el service worker:', err));
};

/** Pide el permiso (debe llamarse desde un toque del usuario). */
export const requestDevicePermission = async (): Promise<DevicePermission> => {
  if (!isDeviceNotificationSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  if (result === 'granted') setDeviceNotificationEnabled(true);
  return result as DevicePermission;
};

const show = async (title: string, options: NotificationOptions): Promise<boolean> => {
  if (getDevicePermission() !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, { icon: '/icons/icon-192.png', badge: '/icons/favicon-64.png', ...options });
    return true;
  } catch (err) {
    console.warn('[Notificaciones] No se pudo mostrar la notificación del sistema:', err);
    return false;
  }
};

/** Muestra el aviso como notificación del sistema (con su sonido); false si no se pudo o están desactivadas. */
export const showDeviceNotification = (n: AppNotification): Promise<boolean> => {
  if (!isDeviceNotificationEnabled()) return Promise.resolve(false);
  const { title, body } = notificationText(n);
  return show(title, {
    body,
    tag: n.id,
    data: { id: n.id, taskId: n.taskId, projectId: n.projectId, projectName: n.projectName }
  });
};

/** Notificación de prueba (desde Ajustes). */
export const showTestDeviceNotification = (): Promise<boolean> =>
  show('ITPocket · Prueba de notificación', { body: 'Así se verán los avisos de tus tareas.', tag: 'itpocket-test' });
