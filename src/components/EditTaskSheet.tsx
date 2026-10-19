import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { GLPIProjectTask } from '../types/glpi';
import { RefreshCw, Search, X, Check, CornerDownRight } from 'lucide-react';

interface EditTaskSheetProps {
  title: string;               // "Editar tarea" / "Editar proyecto"
  initialName: string;
  // Solo para tareas: lista completa del proyecto para elegir "Debajo de"
  task?: GLPIProjectTask;
  allTasks?: GLPIProjectTask[];
  onSave: (changes: { name: string; parentId?: number }) => Promise<void>;
  onClose: () => void;
}

interface ParentOption {
  id: number;
  name: string;
  level: number;
}

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Hoja inferior para editar el nombre de un proyecto/tarea y, en tareas, su tarea padre
export const EditTaskSheet: React.FC<EditTaskSheetProps> = ({ title, initialName, task, allTasks, onSave, onClose }) => {
  const [name, setName] = useState<string>(initialName);
  const [parentId, setParentId] = useState<number>(task?.projecttasks_id || 0);
  const [search, setSearch] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Posibles padres en orden de árbol, sin la propia tarea ni sus descendientes (evita ciclos)
  const parentOptions = useMemo<ParentOption[]>(() => {
    if (!task || !allTasks) return [];
    const ids = new Set(allTasks.map(t => t.id));
    const children = new Map<number, GLPIProjectTask[]>();
    allTasks.forEach(t => {
      const pid = ids.has(t.projecttasks_id) ? t.projecttasks_id : 0;
      if (!children.has(pid)) children.set(pid, []);
      children.get(pid)!.push(t);
    });
    children.forEach(list => list.sort((a, b) => a.id - b.id));

    const result: ParentOption[] = [];
    const walk = (pid: number, level: number) => {
      (children.get(pid) || []).forEach(t => {
        if (t.id === task.id) return; // ni la tarea ni nada debajo de ella
        // Los hitos no suelen ser padres; se ocultan para que la lista sea manejable
        if (!t.is_milestone) result.push({ id: t.id, name: t.name, level });
        walk(t.id, level + 1);
      });
    };
    walk(0, 0);
    return result;
  }, [task, allTasks]);

  const currentParent = parentOptions.find(o => o.id === parentId);
  const query = normalize(search.trim());
  const filtered = query ? parentOptions.filter(o => normalize(o.name).includes(query)) : parentOptions;

  const trimmed = name.trim();
  const changed = trimmed !== initialName.trim() || (task !== undefined && parentId !== (task.projecttasks_id || 0));

  const handleSave = async () => {
    if (!trimmed || !changed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: trimmed, parentId: task ? parentId : undefined });
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar.');
      setSaving(false);
    }
  };

  // Portal a <body>: el árbol está en un contenedor con transform que recortaría el fixed
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.5)'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '520px', maxHeight: '88dvh', display: 'flex', flexDirection: 'column',
          background: 'var(--card-bg)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          boxShadow: 'var(--shadow-lg)', paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 8px' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'var(--bg-main)', border: 'none', borderRadius: '50%', padding: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '0 16px 8px' }}>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
            Nombre
          </label>
          <textarea
            value={name}
            onChange={e => setName(e.target.value)}
            rows={2}
            disabled={saving}
            style={{
              width: '100%', resize: 'vertical', padding: '8px 10px', fontSize: '0.88rem', fontWeight: 600,
              fontFamily: 'inherit', color: 'var(--text-main)', background: 'var(--bg-main)',
              border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)'
            }}
          />
        </div>

        {task && (
          <>
            <div style={{ padding: '4px 16px 6px' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Debajo de
              </label>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>
                {parentId === 0 ? 'Nivel superior del proyecto' : currentParent?.name || `Tarea #${parentId}`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                <Search size={14} color="var(--text-muted)" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar tarea padre..."
                  style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '0.85rem', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            <div style={{ flex: 1, minHeight: '120px', overflowY: 'auto', padding: '0 8px 8px' }}>
              {[{ id: 0, name: 'Nivel superior del proyecto', level: 0 }, ...filtered].map(option => {
                const selected = option.id === parentId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setParentId(option.id)}
                    disabled={saving}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px', paddingLeft: `${8 + (query ? 0 : option.level * 14)}px`,
                      border: 'none', borderRadius: 'var(--radius-sm)',
                      background: selected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      textAlign: 'left', cursor: 'pointer'
                    }}
                  >
                    {option.level > 0 && !query && <CornerDownRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                    <span style={{
                      flex: 1, fontSize: '0.8rem', fontWeight: option.id === 0 || option.level === 0 ? 800 : 600,
                      fontStyle: option.id === 0 ? 'italic' : 'normal',
                      color: selected ? 'var(--primary)' : 'var(--text-main)'
                    }}>
                      {option.name}
                    </span>
                    {selected && <Check size={14} color="var(--primary)" style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div style={{ padding: '8px 16px 14px', borderTop: '1px solid var(--border-color)' }}>
          {error && (
            <div style={{ marginBottom: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!trimmed || !changed || saving}
            style={{
              width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '10px', borderRadius: '10px', border: 'none', background: 'var(--primary-gradient)',
              color: '#fff', fontWeight: 700, fontSize: '0.85rem',
              cursor: !trimmed || !changed || saving ? 'not-allowed' : 'pointer',
              opacity: !trimmed || !changed || saving ? 0.6 : 1
            }}
          >
            {saving && <RefreshCw size={14} className="spin" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
