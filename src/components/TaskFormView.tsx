import React, { useEffect, useState } from 'react';
import type { GLPISession, ProjectCatalogOption } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { ProjectTaskService, type NewMilestoneInput } from '../services/projectTaskService';
import { ArrowLeft, Save, RefreshCw, Type, CalendarPlus, Flag, ListTree, Plus, Trash2, CornerDownRight } from 'lucide-react';

interface TaskFormViewProps {
  session: GLPISession;
  projectId: number;
  parent: { id: number; name: string } | null; // null = tarea de primer nivel del proyecto
  onBack: () => void;
  onCreated: (taskId: number) => void;
}

const sectionTitle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: '12px'
};

const emptySubtask = (): NewMilestoneInput => ({ name: '', content: '', plan_start_date: '' });

// Alta de una tarea. Sin subtareas es un hito (inicio previsto y estado); con la casilla
// "Tiene subtareas" se capturan sus subtareas antes de guardar, y la tarea calcula sola sus
// fechas, duración, avance y estado.
export const TaskFormView: React.FC<TaskFormViewProps> = ({ session, projectId, parent, onBack, onCreated }) => {
  const [name, setName] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [planStart, setPlanStart] = useState<string>('');
  const [stateId, setStateId] = useState<number>(0);
  const [hasSubtasks, setHasSubtasks] = useState<boolean>(false);
  const [subtasks, setSubtasks] = useState<NewMilestoneInput[]>([emptySubtask()]);
  const [states, setStates] = useState<ProjectCatalogOption[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    GLPIService.getOpenProjectStates(session)
      .then(list => { if (!cancelled) { setStates(list); setStateId(id => id || list[0]?.id || 0); } })
      .catch(() => { /* sin catálogo: se usa el estado inicial de GLPI */ });
    return () => { cancelled = true; };
  }, [session]);

  const dirty = !!(name.trim() || content.trim() || planStart || subtasks.some(s => s.name.trim() || s.content.trim() || s.plan_start_date));
  const handleBack = () => {
    if (dirty && !saving && !window.confirm('¿Salir sin crear la tarea? Se perderá lo capturado.')) return;
    onBack();
  };

  const setSubtask = (index: number, changes: Partial<NewMilestoneInput>) => {
    setSubtasks(list => list.map((s, i) => (i === index ? { ...s, ...changes } : s)));
    setError('');
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Escribe el nombre de la tarea.'); return; }
    // Renglones de subtarea vacíos se ignoran; los que tienen datos necesitan nombre
    const filled = subtasks.filter(s => s.name.trim() || s.content.trim() || s.plan_start_date);
    if (hasSubtasks) {
      if (filled.length === 0) { setError('Agrega al menos una subtarea o desmarca "Tiene subtareas".'); return; }
      if (filled.some(s => !s.name.trim())) { setError('Cada subtarea necesita nombre.'); return; }
    }
    setSaving(true);
    setError('');
    try {
      const taskId = await ProjectTaskService.createTask(session, {
        projectId,
        parentId: parent?.id || 0,
        name,
        content,
        plan_start_date: hasSubtasks ? '' : planStart,
        projectstates_id: stateId,
        subtasks: hasSubtasks ? filled : []
      });
      onCreated(taskId);
    } catch (err: any) {
      setError(err.message || 'No se pudo crear la tarea en GLPI.');
      setSaving(false);
    }
  };

  const namedSubtasks = subtasks.filter(s => s.name.trim()).length;
  const saveLabel = hasSubtasks && namedSubtasks > 0
    ? `Crear ${parent ? 'subtarea' : 'tarea'} con ${namedSubtasks} subtarea${namedSubtasks === 1 ? '' : 's'}`
    : parent ? 'Crear subtarea' : 'Crear tarea';

  const chip = (selected: boolean): React.CSSProperties => ({
    padding: '8px 12px', borderRadius: '999px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.8rem',
    border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border-color)'}`,
    background: selected ? 'var(--primary-soft)' : 'var(--card-bg)',
    color: selected ? 'var(--primary)' : 'var(--text-main)'
  });

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      <div style={{ marginBottom: '14px' }}>
        <button
          type="button"
          onClick={handleBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
        >
          <ArrowLeft size={18} /> {parent ? parent.name : 'Tareas del proyecto'}
        </button>
      </div>

      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
        {parent ? 'Nueva subtarea' : 'Nueva tarea'}
      </h2>
      {parent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <CornerDownRight size={14} /> Debajo de <b style={{ color: 'var(--text-main)' }}>{parent.name}</b>
        </div>
      )}
      {!parent && <div style={{ marginBottom: '14px' }} />}

      <div className="card">
        <div style={sectionTitle}>Tarea</div>
        <div className="form-group">
          <label className="form-label" htmlFor="task-name">Nombre de la tarea *</label>
          <div className="input-wrapper">
            <span className="input-icon" style={{ display: 'flex' }}><Type size={18} /></span>
            <input
              id="task-name"
              className="form-input"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="Ej. Levantamiento de requerimientos"
              disabled={saving}
            />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="task-content">Descripción</label>
          <textarea
            id="task-content"
            className="form-input"
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={3}
            placeholder="Qué se hará en esta tarea"
            disabled={saving}
            style={{ resize: 'vertical', padding: '10px 12px' }}
          />
        </div>
      </div>

      <label
        className="card"
        style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: saving ? 'not-allowed' : 'pointer', border: hasSubtasks ? '1.5px solid var(--primary)' : undefined }}
      >
        <input
          type="checkbox"
          checked={hasSubtasks}
          onChange={e => { setHasSubtasks(e.target.checked); setError(''); }}
          disabled={saving}
          style={{ width: '22px', height: '22px', marginTop: '2px', accentColor: 'var(--brand-amber)', flexShrink: 0 }}
        />
        <span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>
            <ListTree size={17} color="var(--primary)" /> Tiene subtareas
          </span>
          <span style={{ display: 'block', marginTop: '3px', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {hasSubtasks
              ? 'La tarea calcula sola sus fechas, duración, avance y estado con sus subtareas. Cada subtarea es un hito.'
              : 'Sin subtareas, la tarea es un hito: solo lleva inicio previsto y se marca como concluida con un toque.'}
          </span>
        </span>
      </label>

      {!hasSubtasks ? (
        <div className="card">
          <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: '6px' }}><Flag size={14} /> Hito</div>
          <div className="form-group">
            <label className="form-label" htmlFor="task-plan-start">Inicio previsto</label>
            <div className="input-wrapper">
              <span className="input-icon" style={{ display: 'flex' }}><CalendarPlus size={18} /></span>
              <input id="task-plan-start" type="datetime-local" className="form-input" value={planStart} onChange={e => setPlanStart(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Estado</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {states.map(s => (
                <button key={s.id} type="button" onClick={() => setStateId(s.id)} disabled={saving} aria-pressed={stateId === s.id} style={chip(stateId === s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              El inicio real se registra al concluir el hito.
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={sectionTitle}>Subtareas ({namedSubtasks})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {subtasks.map((sub, index) => (
              <div key={index} style={{ padding: '12px', borderRadius: '14px', border: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    <Flag size={14} color="var(--primary)" /> Subtarea {index + 1}
                  </span>
                  {subtasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSubtasks(list => list.filter((_, i) => i !== index))}
                      disabled={saving}
                      aria-label={`Quitar subtarea ${index + 1}`}
                      style={{ display: 'flex', padding: '6px', border: 'none', borderRadius: '8px', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <input
                  className="form-input"
                  value={sub.name}
                  onChange={e => setSubtask(index, { name: e.target.value })}
                  placeholder="Nombre de la subtarea"
                  aria-label={`Nombre de la subtarea ${index + 1}`}
                  disabled={saving}
                  style={{ marginBottom: '8px', paddingLeft: '12px' }}
                />
                <textarea
                  className="form-input"
                  value={sub.content}
                  onChange={e => setSubtask(index, { content: e.target.value })}
                  placeholder="Descripción (opcional)"
                  aria-label={`Descripción de la subtarea ${index + 1}`}
                  rows={2}
                  disabled={saving}
                  style={{ resize: 'vertical', padding: '10px 12px', marginBottom: '8px' }}
                />
                <label className="form-label" htmlFor={`sub-start-${index}`} style={{ fontSize: '0.72rem' }}>Inicio previsto</label>
                <input
                  id={`sub-start-${index}`}
                  type="datetime-local"
                  className="form-input"
                  value={sub.plan_start_date}
                  onChange={e => setSubtask(index, { plan_start_date: e.target.value })}
                  disabled={saving}
                  style={{ paddingLeft: '12px' }}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSubtasks(list => [...list, emptySubtask()])}
            disabled={saving}
            style={{
              width: '100%', marginTop: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px',
              borderRadius: '12px', border: '1.5px dashed var(--border-color)', background: 'transparent', color: 'var(--primary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer'
            }}
          >
            <Plus size={16} /> Agregar subtarea
          </button>
        </div>
      )}

      {error && <div style={{ marginBottom: '10px', fontSize: '0.8rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>}

      <button type="button" className="btn-primary" onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
        {saving ? <RefreshCw size={18} className="spin" /> : <Save size={18} />}
        {saveLabel}
      </button>
    </div>
  );
};
