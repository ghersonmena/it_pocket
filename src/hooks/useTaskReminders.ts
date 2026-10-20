import { useCallback, useEffect, useRef, useState } from 'react';
import type { GLPISession } from '../types/glpi';
import {
  NotificationService, reminderTime, SOON_MS, LATE_MS,
  type AppNotification, type ReminderKind, type TaskReminder
} from '../services/notificationService';

const REFRESH_MS = 10 * 60_000; // volver a buscar tareas próximas
const TICK_MS = 5_000;          // revisar si toca avisar
const MAX_BANNERS = 3;

// Avisos de tareas por comenzar (1 minuto antes y al comenzar) mientras la app está abierta,
// con su historial. Las tareas próximas se buscan al iniciar sesión, cada 10 minutos, al volver
// a la app y cuando se crean o editan tareas (refresh).
export const useTaskReminders = (session: GLPISession | null) => {
  const [history, setHistory] = useState<AppNotification[]>([]);
  const [banners, setBanners] = useState<AppNotification[]>([]);
  const [upcoming, setUpcoming] = useState<TaskReminder[]>([]);
  const firedIds = useRef<Set<string>>(new Set());
  const loadingRef = useRef<boolean>(false);

  useEffect(() => {
    const list = session ? NotificationService.loadHistory(session) : [];
    firedIds.current = new Set(list.map(n => n.id));
    setHistory(list);
    setBanners([]);
    setUpcoming([]);
  }, [session]);

  const refresh = useCallback(async () => {
    if (!session || loadingRef.current) return;
    loadingRef.current = true;
    try {
      setUpcoming(await NotificationService.getUpcomingTasks(session));
    } catch (err) {
      console.warn('[Recordatorios] No se pudieron revisar las tareas próximas:', err);
    } finally {
      loadingRef.current = false;
    }
  }, [session]);

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

  // Disparar los avisos que ya tocan
  useEffect(() => {
    if (!session || upcoming.length === 0) return;
    const check = () => {
      const now = Date.now();
      const fired: AppNotification[] = [];
      upcoming.forEach(task => {
        const start = reminderTime(task.start);
        const due: ReminderKind | null =
          now >= start && now < start + LATE_MS ? 'now'
            : now >= start - SOON_MS && now < start ? 'soon'
              : null;
        if (!due) return;
        const id = `${task.taskId}:${due}:${task.start}`;
        if (firedIds.current.has(id)) return;
        firedIds.current.add(id);
        fired.push({ ...task, id, kind: due, firedAt: now, read: false });
      });
      if (fired.length === 0) return;
      persist(list => [...fired, ...list]);
      setBanners(prev => [...fired, ...prev].slice(0, MAX_BANNERS));
      try { navigator.vibrate?.([120, 80, 120]); } catch { /* sin vibración */ }
    };
    check();
    const timer = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(timer);
  }, [session, upcoming, persist]);

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
