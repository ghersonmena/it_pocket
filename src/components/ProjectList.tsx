import React, { useState, useEffect } from 'react';
import type { GLPISession, GLPIProject } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { Search, RefreshCw, FolderKanban, ChevronRight, Layers } from 'lucide-react';

interface ProjectListProps {
  session: GLPISession;
  onSelectProject: (project: GLPIProject) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({ session, onSelectProject }) => {
  const [projects, setProjects] = useState<GLPIProject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchProjects = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await GLPIService.getProjects(session);
      setProjects(data);
    } catch (err) {
      console.warn('Error al cargar proyectos:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [session]);

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.content && p.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderKanban color="var(--primary)" size={22} /> Proyectos y Estructura WBS
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Administra la jerarquía de tareas e hitos de tus proyectos en GLPI
        </p>
      </div>

      {/* Buscador & Refresco */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <div className="input-wrapper" style={{ flex: 1 }}>
          <Search className="input-icon" size={18} />
          <input
            type="text"
            className="form-input"
            placeholder="Buscar proyectos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '10px 14px 10px 40px', fontSize: '0.85rem' }}
          />
        </div>

        <button
          onClick={() => fetchProjects(true)}
          disabled={refreshing || loading}
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '0 14px',
            color: 'var(--text-main)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)'
          }}
          title="Actualizar lista de proyectos"
        >
          <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <RefreshCw className="spin" size={28} style={{ marginBottom: '10px' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Cargando proyectos de GLPI...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)' }}>
          No se encontraron proyectos activos en GLPI.
        </div>
      ) : (
        <div>
          {filteredProjects.map(prj => {
            const isFinished = prj.percent_done === 100;

            return (
              <div
                key={prj.id}
                className="card card-interactive animate-fade-in"
                onClick={() => onSelectProject(prj)}
                style={{ padding: '18px', marginBottom: '14px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="badge" style={{ background: 'var(--primary-soft)', color: 'var(--primary)', fontSize: '0.72rem' }}>
                    {prj.code || `PRJ-${prj.id}`}
                  </span>
                  <span 
                    className="badge" 
                    style={{ 
                      background: isFinished ? '#ecfdf5' : '#fffbe6', 
                      color: isFinished ? '#047857' : '#b45309',
                      fontSize: '0.72rem'
                    }}
                  >
                    {prj.state_name || 'En curso'}
                  </span>
                </div>

                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px', lineHeight: 1.3 }}>
                  {prj.name}
                </h3>

                {prj.content && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.4 }}>
                    {prj.content.length > 100 ? `${prj.content.substring(0, 100)}...` : prj.content}
                  </p>
                )}

                {/* Barra de Progreso del Proyecto */}
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Avance General</span>
                    <span style={{ color: isFinished ? '#10b981' : 'var(--primary)' }}>{prj.percent_done}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'var(--bg-main)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    <div 
                      style={{ 
                        width: `${prj.percent_done}%`, 
                        height: '100%', 
                        background: isFinished ? '#10b981' : 'var(--primary-gradient)',
                        transition: 'width 0.3s ease'
                      }} 
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Layers size={14} color="var(--primary)" /> Ver estructura de tareas (WBS)
                    </span>
                  </div>
                  <ChevronRight size={18} color="var(--primary)" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
