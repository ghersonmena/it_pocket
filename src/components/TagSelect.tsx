import React, { useState } from 'react';
import { Plus, X, Check } from 'lucide-react';

interface TagOption {
  value: string;
  label: string;
}

interface TagSelectProps {
  options: TagOption[];
  value: string[];             // valores elegidos
  onChange: (value: string[]) => void;
  disabled?: boolean;
  emptyText?: string;
}

// Selección múltiple como etiquetas: lo elegido se ve como etiquetas con ✕ y "Agregar" despliega
// lo que falta. Ocupa una línea en lugar de una lista de casillas.
export const TagSelect: React.FC<TagSelectProps> = ({ options, value, onChange, disabled, emptyText = 'Ninguno' }) => {
  const [open, setOpen] = useState<boolean>(false);
  const selected = options.filter(o => value.includes(o.value));
  const available = options.filter(o => !value.includes(o.value));

  // Se conserva el orden de `options` para que el valor no cambie según el orden de los toques
  const toggle = (v: string) => {
    const next = value.includes(v) ? value.filter(x => x !== v) : [...value, v];
    onChange(options.map(o => o.value).filter(x => next.includes(x)));
  };

  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 8px 6px 12px', borderRadius: '999px',
    fontSize: '0.8rem', fontWeight: 700, border: '1.5px solid var(--primary)',
    background: 'rgba(245, 165, 36, 0.12)', color: 'var(--primary)'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        {selected.length === 0 && !open && (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{emptyText}</span>
        )}
        {selected.map(o => (
          <span key={o.value} style={chip}>
            {o.label}
            <button
              type="button"
              onClick={() => toggle(o.value)}
              disabled={disabled}
              aria-label={`Quitar ${o.label}`}
              style={{ display: 'flex', padding: '2px', border: 'none', borderRadius: '50%', background: 'rgba(245, 165, 36, 0.18)', color: 'var(--primary)', cursor: 'pointer' }}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {available.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            disabled={disabled}
            aria-expanded={open}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '999px',
              border: '1.5px dashed var(--border-color)', background: 'transparent', color: 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
            }}
          >
            {open ? <Check size={14} /> : <Plus size={14} />} {open ? 'Listo' : 'Agregar'}
          </button>
        )}
      </div>

      {/* Opciones que faltan: tocar una la agrega */}
      {open && available.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '10px', borderRadius: '14px', background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
          {available.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              disabled={disabled}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '999px',
                border: '1.5px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)',
                fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
              }}
            >
              <Plus size={13} /> {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
