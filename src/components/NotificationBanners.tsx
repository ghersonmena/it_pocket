import React, { useEffect, useRef } from 'react';
import { BellRing, X, CornerDownRight } from 'lucide-react';
import { formatReminderTime, reminderTitle, type AppNotification } from '../services/notificationService';

interface NotificationBannersProps {
  banners: AppNotification[];
  onOpen: (notification: AppNotification) => void;
  onDismiss: (id: string) => void;
}

const AUTO_HIDE_MS = 20_000;

const Banner: React.FC<{ n: AppNotification; onOpen: () => void; onDismiss: () => void }> = ({ n, onOpen, onDismiss }) => {
  // Se oculta solo a los 20 s (el temporizador no se reinicia cuando la app se vuelve a dibujar)
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; });
  useEffect(() => {
    const timer = window.setTimeout(() => dismissRef.current(), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="alert"
      className="notification-banner"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', borderRadius: '18px',
        background: 'var(--brand-graphite)', color: '#ffffff', boxShadow: '0 14px 34px -10px rgba(0, 0, 0, 0.55)',
        border: '1px solid rgba(245, 165, 36, 0.45)'
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: '10px', padding: 0, border: 'none', background: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
      >
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '12px', background: 'var(--brand-amber)', color: 'var(--brand-graphite)' }}>
          <BellRing size={20} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--brand-amber)' }}>
            {reminderTitle(n)} · {formatReminderTime(n.start)}
          </span>
          <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 800, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{n.taskName}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', fontSize: '0.74rem', color: '#a9afbc', overflowWrap: 'anywhere' }}>
            {n.parentName && <CornerDownRight size={12} style={{ flexShrink: 0 }} />}
            {n.parentName ? `${n.parentName} · ` : ''}{n.projectName}
          </span>
          {n.asAdmin && (
            <span style={{ display: 'block', marginTop: '3px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-amber)' }}>
              Sin responsable: te avisamos como administrador del proyecto
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        style={{ flexShrink: 0, display: 'flex', padding: '6px', border: 'none', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', cursor: 'pointer' }}
      >
        <X size={16} />
      </button>
    </div>
  );
};

// Avisos emergentes arriba de la app; tocar uno abre la tarea
export const NotificationBanners: React.FC<NotificationBannersProps> = ({ banners, onOpen, onDismiss }) => {
  if (banners.length === 0) return null;
  return (
    <div
      aria-live="assertive"
      style={{
        position: 'absolute', top: 'calc(10px + env(safe-area-inset-top, 0px))', left: '12px', right: '12px', zIndex: 1200,
        display: 'flex', flexDirection: 'column', gap: '8px'
      }}
    >
      {banners.map(n => (
        <Banner key={n.id} n={n} onOpen={() => onOpen(n)} onDismiss={() => onDismiss(n.id)} />
      ))}
    </div>
  );
};
