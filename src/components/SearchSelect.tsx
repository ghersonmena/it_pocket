import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, Check, RefreshCw } from 'lucide-react';

export interface SelectOption {
  id: number;
  label: string;
}

interface SearchSelectProps {
  label: string;
  value: number;          // 0 = sin valor
  options: SelectOption[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;   // texto cuando no hay valor (por defecto "Sin asignar")
  onChange: (id: number) => void;
}

// Etiquetas jerárquicas de GLPI ("Oficinas ACERO > Planta Alta > ... > 4 Posicion"): el camino
// va en una línea pequeña y el último nivel (el lugar exacto) en negritas debajo. Así se lee la
// ruta completa aunque sea larga, sin cortarla con "…".
const HierarchicalLabel: React.FC<{ label: string; color: string; strong?: boolean }> = ({ label, color, strong }) => {
  const parts = label.split('>').map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return <span style={{ color, fontWeight: strong ? 700 : 500, wordBreak: 'break-word' }}>{label}</span>;
  }
  const last = parts.pop();
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1.35, wordBreak: 'break-word' }}>
        {parts.join(' › ')}
      </span>
      <span style={{ fontSize: '0.95em', fontWeight: 800, color, lineHeight: 1.3, wordBreak: 'break-word' }}>{last}</span>
    </span>
  );
};

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Campo de selección con buscador para desplegables de GLPI (ubicaciones, usuarios, fabricantes...)
export const SearchSelect: React.FC<SearchSelectProps> = ({ label, value, options, loading, disabled, placeholder = 'Sin asignar', onChange }) => {
  const [open, setOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');

  const selected = options.find(o => o.id === value);
  const query = normalize(search.trim());
  const filtered = query ? options.filter(o => normalize(o.label).includes(query)) : options;

  const choose = (id: number) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="form-input"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer', paddingLeft: '12px',
          // El texto puede ocupar varias líneas: valores largos (ubicaciones) se leen completos
          paddingTop: '10px', paddingBottom: '10px', minHeight: '52px', height: 'auto'
        }}
      >
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'normal' }}>
          {selected
            ? <HierarchicalLabel label={selected.label} color="var(--text-main)" />
            : <span style={{ color: 'var(--text-muted)' }}>{value ? `#${value}` : placeholder}</span>}
        </span>
        {loading ? <RefreshCw size={14} className="spin" /> : <ChevronDown size={16} color="var(--text-muted)" />}
      </button>

      {open && createPortal(
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
              width: '100%', maxWidth: '420px', height: 'min(560px, 100%)', display: 'flex', flexDirection: 'column',
              background: 'var(--card-bg)', borderRadius: '24px', border: '1px solid var(--border-color)',
              boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.45)', overflow: 'hidden'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>{label}</div>
              <button
                type="button"
                onClick={() => { setOpen(false); setSearch(''); }}
                aria-label="Cerrar"
                style={{ background: 'var(--bg-main)', border: 'none', borderRadius: '50%', padding: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '0 16px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
                <Search size={14} color="var(--text-muted)" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '0.88rem', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <RefreshCw size={14} className="spin" /> Cargando opciones de GLPI...
                </div>
              ) : (
                [{ id: 0, label: 'Sin asignar' }, ...filtered].map(option => {
                  const isSelected = option.id === value;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => choose(option.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 10px',
                        border: 'none', borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                        background: isSelected ? 'rgba(245, 165, 36, 0.1)' : 'transparent'
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontSize: '0.84rem' }}>
                        {option.id === 0
                          ? <span style={{ fontWeight: 600, fontStyle: 'italic', color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>{option.label}</span>
                          : <HierarchicalLabel label={option.label} color={isSelected ? 'var(--primary)' : 'var(--text-main)'} strong />}
                      </span>
                      {isSelected && <Check size={16} color="var(--primary)" />}
                    </button>
                  );
                })
              )}
              {!loading && query && filtered.length === 0 && (
                <div style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin coincidencias.</div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
