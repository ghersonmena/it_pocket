import React, { useEffect, useState } from 'react';
import type { GLPISession, GLPIProject, GLPIUserOption, ProjectHeaderForm, ProjectCatalogOption } from '../types/glpi';
import { GLPIService, GLPI_PRIORITY_MAP } from '../services/glpiService';
import { SearchSelect } from './SearchSelect';
import { ArrowLeft, Save, RefreshCw, Type, CalendarClock, CalendarCheck, CalendarPlus, Clock, Percent, X, UserPlus } from 'lucide-react';

interface ProjectFormViewProps {
  session: GLPISession;
  onBack: () => void;
  onCreated: (project: GLPIProject) => void;
}

const sectionTitle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: '12px'
};

const DEFAULT_PRIORITY = 3; // Media

// Fecha/hora actual en el formato del input datetime-local ("YYYY-MM-DDTHH:MM")
const nowForInput = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Alta de la cabecera de un proyecto. Solo los datos que el equipo captura; la fecha del
// proyecto (momento de creación), el avance y el fin previsto (calculados con las tareas) los
// pone la app, y la fecha de fin real no se captura aquí.
export const ProjectFormView: React.FC<ProjectFormViewProps> = ({ session, onBack, onCreated }) => {
  const [form, setForm] = useState<ProjectHeaderForm>({
    name: '',
    priority: DEFAULT_PRIORITY,
    projectstates_id: 0,
    projecttypes_id: 0,
    users_id: session.userId || 0,
    plan_start_date: '',
    real_start_date: '',
    content: '',
    members: []
  });
  const [states, setStates] = useState<ProjectCatalogOption[]>([]);
  const [types, setTypes] = useState<ProjectCatalogOption[]>([]);
  const [users, setUsers] = useState<GLPIUserOption[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  // Fecha que tendrá el proyecto (la definitiva se pone al guardarlo)
  const [createdLabel] = useState<string>(() => new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }));

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      GLPIService.getOpenProjectStates(session),
      GLPIService.getProjectTypes(session),
      GLPIService.getActiveUsers(session)
    ])
      .then(([s, t, u]) => {
        if (cancelled) return;
        setStates(s);
        setTypes(t);
        setUsers(u);
        setForm(f => ({
          ...f,
          // Estado inicial: el primero del catálogo (en GLPI, "New")
          projectstates_id: f.projectstates_id || s[0]?.id || 0,
          // Administrador por defecto: quien lo crea, si está entre los usuarios activos
          users_id: u.some(user => user.id === f.users_id) ? f.users_id : 0
        }));
      })
      .catch(err => { if (!cancelled) setError(`No se pudieron cargar los catálogos de GLPI: ${err.message || err}`); })
      .finally(() => { if (!cancelled) setLoadingCatalogs(false); });
    return () => { cancelled = true; };
  }, [session]);

  const set = <K extends keyof ProjectHeaderForm>(key: K, value: ProjectHeaderForm[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setError('');
  };

  const dirty = !!(form.name.trim() || form.content.trim() || form.members.length || form.plan_start_date || form.real_start_date);
  const handleBack = () => {
    if (dirty && !saving && !window.confirm('¿Salir sin crear el proyecto? Se perderá lo capturado.')) return;
    onBack();
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Escribe el nombre del proyecto.'); return; }
    if (!form.projectstates_id) { setError('Elige el estado del proyecto.'); return; }
    // Siempre debe haber administrador: recibe los avisos de las tareas sin responsable
    if (!form.users_id) { setError('Elige al administrador del proyecto.'); return; }
    setSaving(true);
    setError('');
    try {
      onCreated(await GLPIService.createProject(session, form));
    } catch (err: any) {
      setError(err.message || 'No se pudo crear el proyecto en GLPI.');
      setSaving(false);
    }
  };

  const chip = (selected: boolean, color = 'var(--primary)'): React.CSSProperties => ({
    padding: '8px 12px', borderRadius: '999px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.8rem',
    border: `1.5px solid ${selected ? color : 'var(--border-color)'}`,
    background: selected ? 'var(--primary-soft)' : 'var(--card-bg)',
    color: selected ? color : 'var(--text-main)'
  });

  const dateField = (key: 'plan_start_date' | 'real_start_date', label: string, icon: React.ReactNode, extra?: React.ReactNode) => (
    <div className="form-group">
      <label className="form-label" htmlFor={`project-${key}`}>{label}</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div className="input-wrapper" style={{ flex: 1, minWidth: 0 }}>
          <span className="input-icon" style={{ display: 'flex' }}>{icon}</span>
          <input
            id={`project-${key}`}
            type="datetime-local"
            className="form-input"
            value={form[key]}
            onChange={e => set(key, e.target.value)}
            disabled={saving}
          />
        </div>
        {extra}
      </div>
    </div>
  );

  const userName = (id: number) => users.find(u => u.id === id)?.name || `Usuario #${id}`;
  const userOptions = users.map(u => ({ id: u.id, label: u.name }));

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      <div style={{ marginBottom: '14px' }}>
        <button
          type="button"
          onClick={handleBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none',
            color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
          }}
        >
          <ArrowLeft size={18} /> Proyectos
        </button>
      </div>

      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '14px' }}>Nuevo proyecto</h2>

      <div className="card">
        <div style={sectionTitle}>Proyecto</div>
        <div className="form-group">
          <label className="form-label" htmlFor="project-name">Nombre del proyecto *</label>
          <div className="input-wrapper">
            <span className="input-icon" style={{ display: 'flex' }}><Type size={18} /></span>
            <input
              id="project-name"
              className="form-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Ej. Mantenimiento semestral de equipos"
              disabled={saving}
            />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="project-content">Descripción</label>
          <textarea
            id="project-content"
            className="form-input"
            value={form.content}
            onChange={e => set('content', e.target.value)}
            rows={4}
            placeholder="Objetivo, alcance y notas del proyecto"
            disabled={saving}
            style={{ resize: 'vertical', padding: '10px 12px' }}
          />
        </div>
      </div>

      <div className="card">
        <div style={sectionTitle}>Clasificación</div>
        <div className="form-group">
          <label className="form-label">Prioridad</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {Object.entries(GLPI_PRIORITY_MAP).map(([value, p]) => (
              <button
                key={value}
                type="button"
                onClick={() => set('priority', Number(value))}
                disabled={saving}
                aria-pressed={form.priority === Number(value)}
                style={{ ...chip(form.priority === Number(value), p.color), display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} /> {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Estado</label>
          {loadingCatalogs ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <RefreshCw size={14} className="spin" /> Cargando estados...
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {states.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => set('projectstates_id', s.id)}
                  disabled={saving}
                  aria-pressed={form.projectstates_id === s.id}
                  style={chip(form.projectstates_id === s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Tipo</label>
          <SearchSelect
            label="Tipo de proyecto"
            value={form.projecttypes_id}
            options={types}
            loading={loadingCatalogs}
            disabled={saving}
            onChange={id => set('projecttypes_id', id)}
          />
        </div>
      </div>

      <div className="card">
        <div style={sectionTitle}>Equipo</div>
        <div className="form-group">
          <label className="form-label">Administrador del proyecto *</label>
          <SearchSelect
            label="Administrador del proyecto"
            value={form.users_id}
            options={userOptions}
            loading={loadingCatalogs}
            disabled={saving}
            placeholder="Elige al administrador"
            onChange={id => set('users_id', id)}
          />
          <div style={{ marginTop: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Recibe los avisos de las tareas que no tienen responsable.
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Integrantes</label>
          {form.members.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {form.members.map(id => (
                <span
                  key={id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 8px 6px 12px', borderRadius: '999px',
                    fontSize: '0.8rem', fontWeight: 700, border: '1.5px solid var(--primary)', background: 'var(--primary-soft)', color: 'var(--primary)'
                  }}
                >
                  {userName(id)}
                  <button
                    type="button"
                    onClick={() => set('members', form.members.filter(m => m !== id))}
                    disabled={saving}
                    aria-label={`Quitar a ${userName(id)}`}
                    style={{ display: 'flex', padding: '2px', border: 'none', borderRadius: '50%', background: 'rgba(245, 165, 36, 0.2)', color: 'var(--primary)', cursor: 'pointer' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <SearchSelect
            label="Agregar integrante"
            value={0}
            options={userOptions.filter(u => !form.members.includes(u.id))}
            loading={loadingCatalogs}
            disabled={saving}
            placeholder="+ Agregar integrante"
            onChange={id => { if (id) set('members', [...form.members, id]); }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            <UserPlus size={13} /> {form.members.length === 0 ? 'Sin integrantes todavía' : `${form.members.length} integrante${form.members.length === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={sectionTitle}>Fechas y avance</div>
        <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <Clock size={15} /> <span>Fecha del proyecto: <b style={{ color: 'var(--text-main)' }}>{createdLabel}</b> (se registra al crearlo)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <Percent size={15} /> <span>Avance: <b style={{ color: 'var(--text-main)' }}>automático</b>, se calcula con las tareas</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <CalendarClock size={15} /> <span>Fin previsto: <b style={{ color: 'var(--text-main)' }}>automático</b>, la tarea que termine más tarde</span>
          </div>
        </div>
        {dateField('plan_start_date', 'Inicio previsto', <CalendarPlus size={18} />)}
        {dateField('real_start_date', 'Inicio real', <CalendarCheck size={18} />,
          <button
            type="button"
            onClick={() => set('real_start_date', form.real_start_date ? '' : nowForInput())}
            disabled={saving}
            style={{
              flexShrink: 0, padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
              background: 'var(--card-bg)', color: 'var(--primary)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer'
            }}
          >
            {form.real_start_date ? 'Quitar' : 'Ahora'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: '10px', fontSize: '0.8rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>
      )}

      <button
        type="button"
        className="btn-primary"
        onClick={handleSave}
        disabled={saving || loadingCatalogs}
        style={{ opacity: saving || loadingCatalogs ? 0.6 : 1 }}
      >
        {saving ? <RefreshCw size={18} className="spin" /> : <Save size={18} />}
        Crear proyecto
      </button>
    </div>
  );
};
