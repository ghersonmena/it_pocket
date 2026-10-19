import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GLPISession, GLPIUserOption, TaskParticipant } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { RefreshCw, Search, X, Check, Users as UsersIcon } from 'lucide-react';

interface AssignParticipantsProps {
  session: GLPISession;
  taskId: number;
  taskName: string;
  participants: TaskParticipant[];
  onChange: (participants: TaskParticipant[]) => void;
  onClose: () => void;
}

// Hoja inferior para asignar/quitar responsables (usuarios de GLPI) de una tarea.
// Cada cambio se guarda al momento en la pestaña "Equipo" de la tarea.
export const AssignParticipants: React.FC<AssignParticipantsProps> = ({
  session, taskId, taskName, participants, onChange, onClose
}) => {
  const [users, setUsers] = useState<GLPIUserOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    GLPIService.getActiveUsers(session)
      .then(list => { if (!cancelled) setUsers(list); })
      .catch(err => { if (!cancelled) setError(err.message || 'No se pudo cargar la lista de usuarios.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session]);

  const assignedUser = (userId: number) =>
    participants.find(p => p.itemtype === 'User' && p.id === userId);

  const toggleUser = async (user: GLPIUserOption) => {
    if (savingUserId !== null) return;
    setSavingUserId(user.id);
    setError(null);
    try {
      const current = assignedUser(user.id);
      if (current) {
        await GLPIService.removeTaskParticipant(session, taskId, current);
        onChange(participants.filter(p => p !== current));
      } else {
        const added = await GLPIService.addTaskParticipant(session, taskId, user);
        onChange([...participants, added]);
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar el cambio.');
    } finally {
      setSavingUserId(null);
    }
  };

  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const query = normalize(search.trim());
  const filtered = query
    ? users.filter(u => normalize(`${u.name} ${u.login}`).includes(query))
    : users;
  // Los ya asignados primero
  const sorted = [...filtered].sort((a, b) => Number(!!assignedUser(b.id)) - Number(!!assignedUser(a.id)));

  // Participantes que no son usuarios (grupos, proveedores): se muestran pero se gestionan en GLPI
  const others = participants.filter(p => p.itemtype !== 'User');

  // Portal a <body>: el árbol está en un contenedor con transform que recortaría el fixed
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.5)'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '80dvh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card-bg)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          boxShadow: 'var(--shadow-lg)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
      >
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', padding: '14px 16px 8px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>Responsables</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {taskName}
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

        {/* Búsqueda */}
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar usuario..."
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '0.85rem', fontFamily: 'inherit' }}
            />
          </div>
          {others.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <UsersIcon size={12} /> También asignado: {others.map(o => o.name).join(', ')} (se gestiona en GLPI)
            </div>
          )}
          {error && (
            <div style={{ marginTop: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>
          )}
        </div>

        {/* Lista de usuarios */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <RefreshCw size={14} className="spin" /> Cargando usuarios de GLPI...
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              No hay usuarios que coincidan.
            </div>
          ) : (
            sorted.map(user => {
              const assigned = !!assignedUser(user.id);
              const saving = savingUserId === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleUser(user)}
                  disabled={savingUserId !== null}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 8px',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: assigned ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    textAlign: 'left',
                    cursor: savingUserId !== null ? 'wait' : 'pointer'
                  }}
                >
                  <span
                    style={{
                      width: '20px',
                      height: '20px',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '6px',
                      border: `1.5px solid ${assigned ? 'var(--primary)' : 'var(--border-color)'}`,
                      background: assigned ? 'var(--primary)' : 'transparent',
                      color: '#fff'
                    }}
                  >
                    {saving ? <RefreshCw size={12} className="spin" color={assigned ? '#fff' : 'var(--primary)'} /> : assigned && <Check size={14} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{user.name}</span>
                    {user.login && user.login !== user.name && (
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{user.login}</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div style={{ padding: '8px 16px 14px', borderTop: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%', padding: '10px', borderRadius: '10px', border: 'none',
              background: 'var(--primary-gradient)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
            }}
          >
            Listo
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
