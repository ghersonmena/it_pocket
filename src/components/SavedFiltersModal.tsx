import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GLPISession } from '../types/glpi';
import { AssetService } from '../services/assetService';
import type { SavedFilter } from '../services/assetService';
import { X, Star, Lock, RefreshCw, Check, ListFilter, AlertCircle } from 'lucide-react';

interface SavedFiltersModalProps {
  session: GLPISession;
  itemtype: string;
  typeLabel: string;
  filters: SavedFilter[];
  loading: boolean;
  error: string | null;
  activeId: number | null;
  onSelect: (filter: SavedFilter | null) => void;
  onClose: () => void;
}

// Búsquedas guardadas de GLPI ("filtros") con su conteo, como en "Búsquedas guardadas" de la web
export const SavedFiltersModal: React.FC<SavedFiltersModalProps> = ({
  session, itemtype, typeLabel, filters, loading, error, activeId, onSelect, onClose
}) => {
  // Conteo por búsqueda: número, 'error' si GLPI no la pudo ejecutar, ausente mientras carga
  const [counts, setCounts] = useState<Record<number, number | 'error'>>({});

  useEffect(() => {
    let cancelled = false;
    filters.forEach(filter => {
      AssetService.countSavedFilter(session, itemtype, filter)
        .then(n => { if (!cancelled) setCounts(prev => ({ ...prev, [filter.id]: n })); })
        .catch(() => { if (!cancelled) setCounts(prev => ({ ...prev, [filter.id]: 'error' })); });
    });
    return () => { cancelled = true; };
  }, [session, itemtype, filters]);

  const row = (filter: SavedFilter | null) => {
    const selected = (filter?.id ?? null) === activeId;
    const count = filter ? counts[filter.id] : undefined;
    return (
      <button
        key={filter?.id ?? 'none'}
        type="button"
        onClick={() => onSelect(filter)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 10px',
          border: 'none', borderBottom: '1px solid var(--border-color)', textAlign: 'left', cursor: 'pointer',
          background: selected ? 'rgba(245, 165, 36, 0.1)' : 'transparent',
          borderLeft: `3px solid ${selected ? 'var(--primary)' : 'transparent'}`
        }}
      >
        <span style={{
          flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.3,
          fontStyle: filter ? 'normal' : 'italic',
          color: selected ? 'var(--primary)' : filter ? 'var(--text-main)' : 'var(--text-muted)'
        }}>
          {filter ? filter.name : `Todos (sin filtro)`}
        </span>
        {filter?.isDefault && <Star size={13} color="#f59e0b" fill="#f59e0b" style={{ flexShrink: 0 }} aria-label="Predeterminada" />}
        {filter?.isPrivate && <Lock size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} aria-label="Privada" />}
        {filter && (
          <span
            title={count === 'error' ? 'GLPI no pudo ejecutar esta búsqueda' : undefined}
            style={{
              flexShrink: 0, minWidth: '26px', textAlign: 'center', padding: '2px 7px', borderRadius: '8px',
              fontSize: '0.72rem', fontWeight: 800,
              background: count === 'error' ? 'rgba(220, 38, 38, 0.12)' : 'var(--bg-main)',
              color: count === 'error' ? '#dc2626' : 'var(--text-main)',
              border: '1px solid var(--border-color)'
            }}
          >
            {count === undefined ? <RefreshCw size={10} className="spin" /> : count === 'error' ? <AlertCircle size={11} /> : count}
          </span>
        )}
        {selected && <Check size={16} color="var(--primary)" style={{ flexShrink: 0 }} />}
      </button>
    );
  };

  // Portal a <body>: el contenido está dentro de contenedores con transform
  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="modal-pop"
        style={{
          width: '100%', maxWidth: '420px', maxHeight: '100%', display: 'flex', flexDirection: 'column',
          background: 'var(--card-bg)', borderRadius: '24px', border: '1px solid var(--border-color)',
          boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.45)', overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <ListFilter size={18} color="var(--primary)" />
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>Búsquedas guardadas</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{typeLabel}</div>
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

        <div style={{ overflowY: 'auto', borderTop: '1px solid var(--border-color)' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <RefreshCw size={14} className="spin" /> Cargando búsquedas de GLPI...
            </div>
          ) : error ? (
            <div style={{ padding: '16px', fontSize: '0.8rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>
          ) : (
            <>
              {row(null)}
              {filters.map(f => row(f))}
              {filters.length === 0 && (
                <div style={{ padding: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  No tienes búsquedas guardadas para {typeLabel.toLowerCase()}. Créalas en GLPI con “Guardar búsqueda” y aparecerán aquí.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
