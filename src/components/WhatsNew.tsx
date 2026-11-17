import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import { RELEASES } from '../releases';
import type { Release } from '../releases';

interface WhatsNewProps {
  // Las versiones a destacar; las demás quedan detrás de "Ver versiones anteriores"
  releases: Release[];
  onClose: () => void;
}

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

// Ventana de novedades: lo que cambió desde la última versión que se vio en este teléfono
export const WhatsNew: React.FC<WhatsNewProps> = ({ releases, onClose }) => {
  const [all, setAll] = useState<boolean>(false);
  const shown = all ? RELEASES : releases;

  // Portal a <body>: el contenido está dentro de contenedores con transform
  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="modal-pop"
        style={{
          width: '100%', maxWidth: '420px', maxHeight: '100%', display: 'flex', flexDirection: 'column',
          background: 'var(--card-bg)', borderRadius: '24px', border: '1px solid var(--border-color)',
          boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.45)', overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <Sparkles size={18} color="var(--brand-amber)" />
            <div>
              <div id="whats-new-title" style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>Novedades de ITPocket</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Versión {__APP_VERSION__}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'var(--bg-main)', border: 'none', borderRadius: '50%', padding: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 16px', borderTop: '1px solid var(--border-color)' }}>
          {shown.map((release, i) => {
            const latest = i === 0;
            return (
              <section key={release.version} style={{ padding: '14px 0', borderTop: i ? '1px solid var(--border-color)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    ...(latest
                      ? { padding: '2px 10px', borderRadius: '999px', background: 'var(--primary-soft)', color: 'var(--primary)' }
                      : { color: 'var(--text-main)' })
                  }}>
                    {latest && <Sparkles size={13} aria-hidden="true" />}v{release.version}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatDate(release.date)}</span>
                </div>
                <ul style={{
                  margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px',
                  fontSize: '0.82rem', lineHeight: 1.45, color: latest ? 'var(--text-main)' : 'var(--text-muted)'
                }}>
                  {release.notes.map(note => <li key={note}>{note}</li>)}
                </ul>
              </section>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px 16px', borderTop: '1px solid var(--border-color)' }}>
          {!all && releases.length < RELEASES.length && (
            <button type="button" className="btn-secondary" onClick={() => setAll(true)} style={{ flex: 1, marginTop: 0 }}>
              Versiones anteriores
            </button>
          )}
          <button type="button" className="btn-primary" onClick={onClose} autoFocus style={{ flex: 1 }}>
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
