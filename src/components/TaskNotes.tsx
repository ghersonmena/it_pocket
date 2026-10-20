import React, { useState, useEffect, useRef } from 'react';
import type { GLPISession, GLPINote } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { RefreshCw, Send, MessageSquare } from 'lucide-react';

interface TaskNotesProps {
  session: GLPISession;
  taskId: number;
  itemtype?: 'ProjectTask' | 'Project'; // notas de la tarea (por defecto) o del proyecto
  indent: number;
  onCountChange?: (count: number) => void;
}

const formatDate = (value: string): string => {
  const date = new Date(value.replace(' ', 'T'));
  if (isNaN(date.getTime())) return value;
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Historial de notas (Notepad de GLPI) de una tarea o del proyecto, con formulario para agregar una nueva
export const TaskNotes: React.FC<TaskNotesProps> = ({ session, taskId, itemtype = 'ProjectTask', indent, onCountChange }) => {
  const [notes, setNotes] = useState<GLPINote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // El padre pasa una función nueva en cada render; con un ref no se recargan las notas por eso
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => { onCountChangeRef.current = onCountChange; });

  useEffect(() => {
    let cancelled = false;
    GLPIService.getTaskNotes(session, taskId, itemtype)
      .then(data => {
        if (cancelled) return;
        setNotes(data);
        onCountChangeRef.current?.(data.length);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'No se pudieron cargar las notas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [session, taskId, itemtype]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || saving) return;

    setSaving(true);
    setError(null);
    try {
      const note = await GLPIService.addTaskNote(session, taskId, text, itemtype);
      const next = [note, ...notes];
      setNotes(next);
      onCountChange?.(next.length);
      setDraft('');
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar la nota.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        marginTop: '4px',
        marginLeft: `${indent}px`,
        padding: '10px 12px',
        background: 'var(--card-bg)',
        border: '1px dashed var(--border-color)',
        borderRadius: 'var(--radius-md)'
      }}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={`Escribe una nota para el historial de ${itemtype === 'Project' ? 'este proyecto' : 'esta tarea'}...`}
          rows={2}
          disabled={saving}
          style={{
            flex: 1,
            minWidth: 0,
            resize: 'vertical',
            padding: '8px 10px',
            fontSize: '0.82rem',
            fontFamily: 'inherit',
            color: 'var(--text-main)',
            background: 'var(--bg-main)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)'
          }}
        />
        <button
          type="submit"
          disabled={saving || !draft.trim()}
          title="Guardar nota en GLPI"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--primary-gradient)',
            color: 'var(--on-primary)',
            fontWeight: 700,
            fontSize: '0.75rem',
            cursor: saving || !draft.trim() ? 'not-allowed' : 'pointer',
            opacity: saving || !draft.trim() ? 0.6 : 1
          }}
        >
          {saving ? <RefreshCw size={14} className="spin" /> : <Send size={14} />}
          Agregar
        </button>
      </form>

      {error && (
        <div style={{ marginTop: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#dc2626' }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: '10px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={12} className="spin" /> Cargando historial...
          </div>
        ) : notes.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <MessageSquare size={12} /> Sin notas todavía.
          </div>
        ) : (
          notes.map(note => (
            <div
              key={note.id}
              style={{
                padding: '8px 0',
                borderTop: '1px solid var(--border-color)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                <span>{note.user_name || 'Usuario GLPI'}</span>
                <span>{formatDate(note.date)}</span>
              </div>
              <div style={{ marginTop: '3px', fontSize: '0.82rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {note.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
