import React, { useState, useEffect } from 'react';
import type { GLPISession, GLPITicket } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { Ticket, Clock, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react';

interface DashboardProps {
  session: GLPISession;
  onNavigateTab: (tab: 'tickets' | 'create') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ session, onNavigateTab }) => {
  const [tickets, setTickets] = useState<GLPITicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    GLPIService.getTickets(session)
      .then(data => setTickets(data))
      .catch(err => console.warn(err))
      .finally(() => setLoading(false));
  }, [session]);

  const newCount = tickets.filter(t => t.status === 1).length;
  const inProgressCount = tickets.filter(t => t.status === 2 || t.status === 3 || t.status === 4).length;
  const solvedCount = tickets.filter(t => t.status === 5 || t.status === 6).length;
  const totalCount = tickets.length;

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
          Resumen & Estadísticas
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Estado general de las solicitudes en GLPI
        </p>
      </div>

      {/* Grid de KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>NUEVOS</span>
            <AlertCircle size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ef4444' }}>
            {loading ? '-' : newCount}
          </div>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>EN CURSO</span>
            <Clock size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>
            {loading ? '-' : inProgressCount}
          </div>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>RESUELTOS</span>
            <CheckCircle size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981' }}>
            {loading ? '-' : solvedCount}
          </div>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL</span>
            <Ticket size={18} color="var(--primary)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {loading ? '-' : totalCount}
          </div>
        </div>
      </div>

      {/* Información del Perfil Conectado */}
      <div className="card" style={{ background: 'var(--primary-gradient)', color: 'var(--on-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, fontWeight: 600 }}>SESIÓN ACTIVA GLPI</div>
            <div style={{ fontSize: '1rem', fontWeight: 800 }}>{session.username || 'Usuario GLPI'}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
              Perfil: {session.activeProfile || 'Estándar'} | {session.activeEntity || 'Raíz'}
            </div>
          </div>
        </div>
      </div>

      {/* Botones de acción rápida */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
        <button
          className="btn-primary"
          onClick={() => onNavigateTab('tickets')}
          style={{ flex: 1, padding: '12px', fontSize: '0.85rem' }}
        >
          <Ticket size={16} /> Ver Tickets
        </button>
        <button
          className="btn-secondary"
          onClick={() => onNavigateTab('create')}
          style={{ flex: 1, padding: '12px', fontSize: '0.85rem' }}
        >
          Nuevo Ticket
        </button>
      </div>
    </div>
  );
};
