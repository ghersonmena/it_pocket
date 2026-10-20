import { useCallback, useEffect, useRef, useState } from 'react';
import type { GLPISession } from '../types/glpi';
import {
  NotificationService, reminderTime, LATE_MS, OFFSETS_CHANGED_EVENT,
  type AppNotification, type TaskReminder
} from '../services/notificationService';
import { prepareNotificationSound, playNotificationSound } from '../services/notificationSound';
import { showDeviceNotification } from '../services/deviceNotifications';

const REFRESH_MS = 10 * 60_000; // volver a buscar tareas próximas
const TICK_MS = 5_000;          // revisar si toca avisar
const MAX_BANNERS = 3;

// Avisos de tareas por comenzar, con la anticipación que elige el usuario en Ajustes (por defecto
// 1 minuto antes y al comenzar), mientras la app está abierta o en segundo plano, con su historial.
// Siempre quedan en la barra de notificaciones del teléfono (si dio permiso); con la app al frente
// además se muestran arriba con sonido. Los navegadores congelan la app minimizada al poco tiempo,
// así que en segundo plano solo avisan mientras el teléfono la mantenga activa. Las tareas próximas se buscan al iniciar sesión, cada 10 minutos, al
// volver a la app, al cambiar los tiempos de aviso y cuando se crean o editan tareas (refresh).
export const useTaskReminders = (session: GLPISession | null) => {
  const [history, setHistory] = useState<AppNotification[]>([]);
  const [banners, setBanners] = useState<AppNotification[]>([]);
  const [upcoming, setUpcoming] = useState<TaskReminder[]>([]);
  const [offsets, setOffsets] = useState<number[]>([]);
  const firedIds = useRef<Set<string>>(new Set());
  const loadingRef = useRef<boolean>(false);

  // El navegador solo deja sonar después del primer toque en la app
  useEffect(() => { prepareNotificationSound(); }, []);

  useEffect(() => {
    const list = session ? NotificationService.loadHistory(session) : [];
    firedIds.current = new Set(list.map(n => n.id));
    setHistory(list);
    setBanners([]);
    setUpcoming([]);
    setOffsets(session ? NotificationService.getOffsets(session) : []);
  }, [session]);

  // Tiempos de aviso cambiados en Ajustes
  useEffect(() => {
    const onChange = (e: Event) => setOffsets((e as CustomEvent<number[]>).detail);
    window.addEventListener(OFFSETS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(OFFSETS_CHANGED_EVENT, onChange);
  }, []);

  // Se buscan tareas al menos hasta el aviso con más anticipación (mínimo una semana)
  const horizonDays = Math.max(7, Math.ceil(Math.max(0, ...offsets) / 1440) + 1);

  const refresh = useCallback(async () => {
    if (!session || loadingRef.current) return;
    loadingRef.current = true;
    try {
      setUpcoming(await NotificationService.getUpcomingTasks(session, horizonDays));
    } catch (err) {
      console.warn('[Recordatorios] No se pudieron revisar las tareas próximas:', err);
    } finally {
      loadingRef.current = false;
    }
  }, [session, horizonDays]);

  useEffect(() => {
    if (!session) return;
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session, refresh]);

  const persist = useCallback((updater: (list: AppNotification[]) => AppNotification[]) => {
    setHistory(prev => {
      const next = updater(prev);
      if (session) NotificationService.saveHistory(session, next);
      return next;
    });
  }, [session]);

  // Disparar los avisos que ya tocan. Si la app se abrió tarde y ya pasaron varios avisos de la
  // misma tarea, solo se muestra el más reciente (el de menor anticipación).
  useEffect(() => {
    if (!session || upcoming.length === 0 || offsets.length === 0) return;
    const check = () => {
      const now = Date.now();
      const fired: AppNotification[] = [];
      upcoming.forEach(task => {
        const start = reminderTime(task.start);
        const due = offsets.filter(offset => (offset === 0
          ? now >= start && now < start + LATE_MS
          : now >= start - offset * 60_000 && now < start));
        if (due.length === 0) return;
        const offset = Math.min(...due);
        const id = `${task.taskId}:${offset}:${task.start}`;
        if (firedIds.current.has(id)) return;
        // Los avisos anteriores de la misma tarea que ya no tiene caso mostrar
        due.forEach(o => firedIds.current.add(`${task.taskId}:${o}:${task.start}`));
        // Si el aviso sale tarde (p. ej. la tarea se creó poco antes de empezar), dice lo que de
        // verdad falta, no la anticipación configurada
        const remaining = Math.max(1, Math.ceil((start - now) / 60_000));
        fired.push({ ...task, id, kind: offset === 0 ? 'now' : 'soon', offsetMin: offset === 0 ? 0 : Math.min(offset, remaining), firedAt: now, read: false });
      });
      if (fired.length === 0) return;
      persist(list => [...fired, ...list]);
      // Siempre queda en la barra de notificaciones del teléfono (si dio permiso), con el sonido
      // del dispositivo. Con la app al frente además se muestra arriba; la campanita de la app
      // solo suena si no salió la del teléfono, para no sonar dos veces ("comienza ahora" tiene
      // prioridad si llegan varios).
      (async () => {
        const inBackground = document.visibilityState === 'hidden';
        const shown = await Promise.all(fired.map(n => showDeviceNotification(n)));
        const pending = inBackground ? fired.filter((_, i) => !shown[i]) : fired;
        if (pending.length === 0) return;
        setBanners(prev => [...pending, ...prev].slice(0, MAX_BANNERS));
        if (shown.some(Boolean)) return;
        try { navigator.vibrate?.([120, 80, 120]); } catch { /* sin vibración */ }
        playNotificationSound(pending.some(n => n.kind === 'now') ? 'now' : 'soon');
      })();
    };
    check();
    const timer = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(timer);
  }, [session, upcoming, offsets, persist]);

  const dismissBanner = useCallback((id: string) => setBanners(prev => prev.filter(n => n.id !== id)), []);
  const markRead = useCallback((id: string) => persist(list => list.map(n => (n.id === id ? { ...n, read: true } : n))), [persist]);
  const markAllRead = useCallback(() => persist(list => (list.some(n => !n.read) ? list.map(n => ({ ...n, read: true })) : list)), [persist]);
  const clearHistory = useCallback(() => persist(() => []), [persist]);

  return {
    history,
    banners,
    upcoming,
    unread: history.filter(n => !n.read).length,
    refresh,
    dismissBanner,
    markRead,
    markAllRead,
    clearHistory
  };
};
