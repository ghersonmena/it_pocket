import React, { useEffect } from 'react';
import type { GLPISession } from '../types/glpi';
import { LogOut, X, ShieldCheck } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { NAV_ITEMS } from '../navigation';
import type { TabType } from '../navigation';

interface NavDrawerProps {
  open: boolean;
  session: GLPISession;
  activeTab: TabType;
  onSelect: (tab: TabType) => void;
  onClose: () => void;
  onLogout: () => void;
  badges?: Partial<Record<TabType, number>>; // número de pendientes junto a una sección
}

// Menú lateral izquierdo (se abre con ☰): todas las secciones de la app con sus íconos
export const NavDrawer: React.FC<NavDrawerProps> = ({ open, session, activeTab, onSelect, onClose, onLogout, badges }) => {
  // Cerrar con Escape (teclado / escritorio)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const fullName = [session.firstname, session.realname].filter(Boolean).join(' ') || session.username || 'Usuario';
  // "Nuevo ticket" pertenece a Tickets en el menú
  const current = activeTab === 'create' ? 'tickets' : activeTab;

  return (
    <div
      aria-hidden={!open}
      style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: open ? 'auto' : 'none' }}
    >
      {/* Fondo oscurecido: tocar fuera cierra el menú */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
          opacity: open ? 1 : 0, transition: 'opacity 0.22s ease'
        }}
      />

      <nav
        aria-label="Menú principal"
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: 'min(290px, 82%)', display: 'flex', flexDirection: 'column',
          background: 'var(--card-bg)', boxShadow: '8px 0 32px -8px rgba(0, 0, 0, 0.35)',
          borderRadius: '0 24px 24px 0',
          paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: open ? 'translateX(0)' : 'translateX(-105%)', transition: 'transform 0.25s ease'
        }}
      >
        {/* Usuario */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', padding: '20px 16px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div className="brand-logo"><BrandLogo size={40} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                <ShieldCheck size={12} color="#10b981" /> {session.activeProfile || 'Usuario'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            style={{ display: 'flex', padding: '6px', border: 'none', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Secciones */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {NAV_ITEMS.map(item => {
            const active = item.tab === current;
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => onSelect(item.tab)}
                aria-current={active ? 'page' : undefined}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 14px', marginBottom: '4px',
                  border: 'none', borderRadius: '14px', textAlign: 'left', cursor: 'pointer',
                  background: active ? 'rgba(245, 165, 36, 0.12)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text-main)', fontWeight: active ? 800 : 600, fontSize: '0.92rem'
                }}
              >
                <span style={{ display: 'flex', color: active ? 'var(--primary)' : 'var(--text-muted)' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {!!badges?.[item.tab] && (
                  <span style={{ minWidth: '22px', padding: '2px 7px', borderRadius: '999px', background: 'var(--brand-amber)', color: 'var(--brand-graphite)', fontSize: '0.72rem', fontWeight: 800, textAlign: 'center' }}>
                    {badges[item.tab]! > 99 ? '99+' : badges[item.tab]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ padding: '10px', borderTop: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={onLogout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 14px', border: 'none', borderRadius: '14px',
              background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer'
            }}
          >
            <LogOut size={20} /> Cerrar sesión
          </button>
        </div>
      </nav>
    </div>
  );
};
