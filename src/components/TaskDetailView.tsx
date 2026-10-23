import React, { useEffect, useState } from 'react';
import type { GLPISession, ProjectTaskNode, TaskParticipant, ProjectCatalogOption } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { ProjectTaskService } from '../services/projectTaskService';
import { TaskNotes } from './TaskNotes';
import { TaskPhotos } from './TaskPhotos';
import { ItemDocuments } from './ItemDocuments';
import {
  ArrowLeft, Flag, ListTree, Pencil, Plus, CheckCircle2, Square, RefreshCw, UserPlus, User as UserIcon,
  Eye, ChevronRight, Save, X, CalendarPlus, MessageSquare, Camera, FileText
} from 'lucide-react';

interface TaskDetailViewProps {
  session: GLPISession;
  node: ProjectTaskNode;
  backLabel: string;
  participants?: TaskParticipant[];
  hasElement: boolean;
  completing: boolean;
  onBack: () => void;
  onOpenTask: (taskId: number) => void;
  onAddSubtask: (node: ProjectTaskNode) => void;
  onComplete: (node: ProjectTaskNode) => void;
  onAssign: (node: ProjectTaskNode) => void;
  onViewElement: (node: ProjectTaskNode) => void;
  onSaved: () => Promise<void>;
}

type DetailTab = 'notes' | 'photos' | 'documents';

const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value.replace(' ', 'T'));
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (secs?: number): string => {
  if (!secs) return '—';
  const hours = Math.round(secs / 3600);
  if (hours < 24) return `${Math.max(1, hours)} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} d ${rest} h` : `${days} d`;
};

// "YYYY-MM-DD HH:MM:SS" de GLPI → valor del input datetime-local
const toInput = (value?: string | null): string => (value ? value.replace(' ', 'T').slice(0, 16) : '');

const sectionTitle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: '10px'
};

// Detalle de una tarea o subtarea: datos, fechas (de hito o calculadas con sus subtareas),
// descripción, responsables, activo relacionado, subtareas, notas, fotos y documentos.
export const TaskDetailView: React.FC<TaskDetailViewProps> = ({
  session, node, backLabel, participants, hasElement, completing,
  onBack, onOpenTask, onAddSubtask, onComplete, onAssign, onViewElement, onSaved
}) => {
  const isMilestone = node.children.length === 0;
  const isDone = node.percent_done >= 100;
  const description = GLPIService.htmlToPlainText(node.content || '');

  const [tab, setTab] = useState<DetailTab>('notes');
  const [editing, setEditing] = useState<boolean>(false);
  const [name, setName] = useState<string>(node.name);
  const [content, setContent] = useState<string>(description);
  const [planStart, setPlanStart] = useState<string>(toInput(node.plan_start_date));
  const [stateId, setStateId] = useState<number>(node.projectstates_id || 0);
  const [states, setStates] = useState<ProjectCatalogOption[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!editing || !isMilestone || isDone || states.length) return;
    GLPIService.getOpenProjectStates(session).then(setStates).catch(() => { /* sin catálogo: no se edita el estado */ });
  }, [editing, isMilestone, isDone, session, states.length]);

  const startEdit = () => {
    setName(node.name);
    setContent(description);
    setPlanStart(toInput(node.plan_start_date));
    setStateId(node.projectstates_id || 0);
    setError('');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!name.trim()) { setError('Escribe el nombre de la tarea.'); return; }
    setSaving(true);
    setError('');
    try {
      await ProjectTaskService.updateTask(session, node, {
        name,
        content,
        projecttasks_id: node.projecttasks_id,
        // La fecha prevista de un hito se puede corregir aunque ya esté concluido; el estado, no
        ...(isMilestone ? { plan_start_date: planStart, projectstates_id: isDone ? undefined : stateId || undefined } : {})
      }, isMilestone);
      await onSaved();
      setEditing(false);
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar la tarea.');
    } finally {
      setSaving(false);
    }
  };

  const tabButton = (key: DetailTab, label: string, icon: React.ReactNode) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      style={{
        flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '8px 6px', border: 'none',
        borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem',
        background: tab === key ? 'var(--card-bg)' : 'transparent', boxShadow: tab === key ? 'var(--shadow-sm)' : 'none',
        color: tab === key ? 'var(--primary)' : 'var(--text-muted)'
      }}
    >
      {icon} {label}
    </button>
  );

  const actionButton: React.CSSProperties = {
    flex: '1 1 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px 12px',
    borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)',
    fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
  };

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.82rem', padding: '4px 0' }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--text-main)', fontWeight: 700, textAlign: 'right' }}>{value}</span>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      <div style={{ marginBottom: '14px' }}>
        <button
          type="button"
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left' }}
        >
          <ArrowLeft size={18} style={{ flexShrink: 0 }} /> {backLabel}
        </button>
      </div>

      {/* Encabezado */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <span className="badge" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            {isMilestone ? <><Flag size={12} /> Hito</> : <><ListTree size={12} /> Tarea · {node.children.length} subtarea{node.children.length === 1 ? '' : 's'}</>}
          </span>
          <span className="badge" style={{ background: isDone ? '#ecfdf5' : 'var(--bg-main)', color: isDone ? '#047857' : 'var(--text-muted)' }}>
            {isDone ? 'Concluida' : node.percent_done > 0 || node.real_start_date ? 'En proceso' : 'Sin iniciar'}
          </span>
        </div>

        {editing ? (
          <div>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-task-name">Nombre</label>
              <input id="edit-task-name" className="form-input" value={name} onChange={e => setName(e.target.value)} disabled={saving} style={{ paddingLeft: '12px' }} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-task-content">Descripción</label>
              <textarea id="edit-task-content" className="form-input" value={content} onChange={e => setContent(e.target.value)} rows={4} disabled={saving} style={{ resize: 'vertical', padding: '10px 12px' }} />
            </div>
            {isMilestone && (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-task-start">Inicio previsto</label>
                  <div className="input-wrapper">
                    <span className="input-icon" style={{ display: 'flex' }}><CalendarPlus size={18} /></span>
                    <input id="edit-task-start" type="datetime-local" className="form-input" value={planStart} onChange={e => setPlanStart(e.target.value)} disabled={saving} />
                  </div>
                </div>
                {!isDone && states.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Estado</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {states.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStateId(s.id)}
                          aria-pressed={stateId === s.id}
                          disabled={saving}
                          style={{
                            padding: '8px 12px', borderRadius: '999px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                            border: `1.5px solid ${stateId === s.id ? 'var(--primary)' : 'var(--border-color)'}`,
                            background: stateId === s.id ? 'var(--primary-soft)' : 'var(--card-bg)', color: stateId === s.id ? 'var(--primary)' : 'var(--text-main)'
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {!isMilestone && (
              <div style={{ marginBottom: '12px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Las fechas, el avance y el estado de esta tarea se calculan con sus subtareas.
              </div>
            )}
            {error && <div style={{ marginBottom: '10px', fontSize: '0.8rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => setEditing(false)} disabled={saving} style={actionButton}><X size={15} /> Cancelar</button>
              <button type="button" className="btn-primary" onClick={saveEdit} disabled={saving} style={{ flex: '1 1 auto', width: 'auto', padding: '9px 12px', fontSize: '0.82rem' }}>
                {saving ? <RefreshCw size={15} className="spin" /> : <Save size={15} />} Guardar
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.3, marginBottom: '8px', overflowWrap: 'anywhere' }}>{node.name}</h2>
            {description
              ? <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5, whiteSpace: 'pre-line', marginBottom: '10px' }}>{description}</p>
              : <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '10px' }}>Sin descripción</p>}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ flex: 1, height: '7px', background: 'var(--bg-main)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <div style={{ width: `${node.percent_done}%`, height: '100%', background: isDone ? '#10b981' : 'var(--primary-gradient)' }} />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: isDone ? '#059669' : 'var(--primary)' }}>{node.percent_done}%</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" onClick={startEdit} style={actionButton}><Pencil size={15} /> Editar</button>
              <button type="button" onClick={() => onAddSubtask(node)} style={actionButton}><Plus size={15} /> Agregar subtarea</button>
              {isMilestone && (
                <button
                  type="button"
                  onClick={() => !isDone && onComplete(node)}
                  disabled={completing || isDone}
                  style={{
                    ...actionButton,
                    border: isDone ? '1px solid #a7f3d0' : '1px solid var(--primary)',
                    background: isDone ? '#ecfdf5' : 'var(--primary-soft)',
                    color: isDone ? '#059669' : 'var(--primary)',
                    cursor: isDone ? 'default' : 'pointer'
                  }}
                >
                  {completing ? <RefreshCw size={15} className="spin" /> : isDone ? <CheckCircle2 size={15} /> : <Square size={15} />}
                  {isDone ? 'Hito concluido' : 'Concluir hito'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Fechas */}
      <div className="card">
        <div style={sectionTitle}>Fechas</div>
        {isMilestone ? (
          <>
            {row('Inicio previsto', formatDateTime(node.plan_start_date))}
            {row('Inicio real', node.real_start_date ? formatDateTime(node.real_start_date) : <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Al concluir el hito</span>)}
          </>
        ) : (
          <>
            {row('Inicio previsto', formatDateTime(node.plan_start_date))}
            {row('Fin previsto', formatDateTime(node.plan_end_date))}
            {row('Duración prevista', formatDuration(node.planned_duration))}
            <div style={{ height: '1px', background: 'var(--border-color)', margin: '6px 0' }} />
            {row('Inicio real', formatDateTime(node.real_start_date))}
            {row('Fin real', formatDateTime(node.real_end_date))}
            {row('Duración real', formatDuration(node.effective_duration))}
            <div style={{ marginTop: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>Calculadas con sus subtareas.</div>
          </>
        )}
      </div>

      {/* Responsables y activo relacionado */}
      <div className="card">
        <div style={sectionTitle}>Responsables</div>
        <button
          type="button"
          onClick={() => onAssign(node)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', color: participants?.length ? 'var(--text-main)' : 'var(--primary)', fontSize: '0.84rem', fontWeight: 700 }}
        >
          {participants?.length ? <UserIcon size={16} /> : <UserPlus size={16} />}
          <span style={{ flex: 1 }}>{participants?.length ? participants.map(p => p.name).join(', ') : 'Asignar responsable'}</span>
          <ChevronRight size={16} color="var(--text-muted)" />
        </button>
        {hasElement && (
          <button
            type="button"
            onClick={() => onViewElement(node)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '12px', padding: '8px 12px', borderRadius: '10px',
              border: '1px solid rgba(139, 92, 246, 0.4)', background: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer'
            }}
          >
            <Eye size={14} /> Ver activo relacionado
          </button>
        )}
      </div>

      {/* Subtareas */}
      {!isMilestone && (
        <div className="card">
          <div style={sectionTitle}>Subtareas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {node.children.map(child => {
              const childDone = child.percent_done >= 100;
              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onOpenTask(child.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '12px', textAlign: 'left',
                    border: '1px solid var(--border-color)', background: 'var(--bg-main)', cursor: 'pointer'
                  }}
                >
                  {child.children.length > 0
                    ? <ListTree size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                    : <Flag size={15} color={childDone ? '#10b981' : '#f59e0b'} fill={childDone ? '#10b981' : 'transparent'} style={{ flexShrink: 0 }} />}
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', fontWeight: 700, color: childDone ? '#059669' : 'var(--text-main)', overflowWrap: 'anywhere' }}>{child.name}</span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: childDone ? '#059669' : 'var(--text-muted)' }}>{child.percent_done}%</span>
                  <ChevronRight size={16} color="var(--text-muted)" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Notas, fotos y documentos de esta tarea (no se heredan) */}
      <div className="card">
        <div style={{ display: 'flex', gap: '4px', padding: '4px', marginBottom: '12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
          {tabButton('notes', 'Notas', <MessageSquare size={14} />)}
          {tabButton('photos', 'Fotos', <Camera size={14} />)}
          {tabButton('documents', 'Documentos', <FileText size={14} />)}
        </div>
        {tab === 'notes' && <TaskNotes session={session} taskId={node.id} indent={0} />}
        {tab === 'photos' && <TaskPhotos session={session} taskId={node.id} taskName={node.name} indent={0} />}
        {tab === 'documents' && <ItemDocuments session={session} itemtype="ProjectTask" itemId={node.id} itemName={node.name} />}
      </div>
    </div>
  );
};
