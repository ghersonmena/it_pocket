import React, { useEffect, useState } from 'react';
import { Bell, BellRing, CalendarClock, ChevronRight, CornerDownRight, Trash2 } from 'lucide-react';
import { reminderTime, formatReminderTime, type AppNotification, type TaskReminder } from '../services/notificationService';

interface NotificationsScreenProps {
  history: AppNotification[];
  upcoming: TaskReminder[];
  onOpen: (target: TaskReminder, notificationId?: string) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}

const MAX_UPCOMING = 20;

const timeAgo = (ms: number, now: number): string => {
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} día${days === 1 ? '' : 's'}`;
};

const sectionTitle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.04em', margin: '18px 0 8px'
};

const Row: React.FC<{ icon: React.ReactNode; top: string; target: TaskReminder; unread?: boolean; onClick: () => void }> = ({ icon, top, target, unread, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="card card-interactive"
    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginBottom: '8px', textAlign: 'left', cursor: 'pointer' }}
  >
    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '12px', background: 'var(--primary-soft)', color: 'var(--primary)' }}>
      {icon}
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)' }}>{top}</span>
      <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)', overflowWrap: 'anywhere' }}>{target.taskName}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
        {target.parentName && <CornerDownRight size={12} style={{ flexShrink: 0 }} />}
        {target.parentName ? `${target.parentName} · ` : ''}{target.projectName}
      </span>
    </span>
    {unread && <span aria-label="Sin leer" style={{ flexShrink: 0, width: '9px', height: '9px', borderRadius: '50%', background: 'var(--brand-amber)' }} />}
    <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
  </button>
);

// Avisos que ya pasaron y tareas que están por comenzar (próximos 7 días)
export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ history, upcoming, onOpen, onMarkAllRead, onClear }) => {
  // Al entrar a la sección, los avisos se dan por vistos (el número del menú se apaga)
  useEffect(() => {
    const timer = window.setTimeout(onMarkAllRead, 1500);
    return () => window.clearTimeout(timer);
  }, [onMarkAllRead]);

  // Hora de referencia al abrir la sección (para "hace 3 min" y ocultar tareas ya iniciadas)
  const [now] = useState<number>(() => Date.now());
  const nextTasks = upcoming.filter(t => reminderTime(t.start) >= now - 60_000).slice(0, MAX_UPCOMING);

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '6px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell color="var(--primary)" size={22} /> Notificaciones
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Avisos 1 minuto antes y al comenzar cada tarea, mientras la app está abierta
        </p>
      </div>

      <div style={sectionTitle}>Próximas tareas</div>
      {nextTasks.length === 0 ? (
        <div className="card" style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>No hay tareas por comenzar en los próximos 7 días.</div>
      ) : (
        nextTasks.map(t => (
          <Row key={`${t.taskId}:${t.start}`} icon={<CalendarClock size={18} />} top={formatReminderTime(t.start)} target={t} onClick={() => onOpen(t)} />
        ))
      )}

      <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Historial</span>
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => { if (window.confirm('¿Borrar el historial de notificaciones de este teléfono?')) onClear(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', border: 'none', borderRadius: '8px', background: 'none', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}
          >
            <Trash2 size={13} /> Borrar
          </button>
        )}
      </div>
      {history.length === 0 ? (
        <div className="card" style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>Todavía no hay avisos.</div>
      ) : (
        history.map(n => (
          <Row
            key={n.id}
            icon={<BellRing size={18} />}
            top={`${n.kind === 'soon' ? 'Comenzaba en 1 minuto' : 'Comenzó'} · ${formatReminderTime(n.start)} · ${timeAgo(n.firedAt, now)}`}
            target={n}
            unread={!n.read}
            onClick={() => onOpen(n, n.id)}
          />
        ))
      )}
    </div>
  );
};
