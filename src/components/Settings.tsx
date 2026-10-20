import React, { useState } from 'react';
import type { GLPISession } from '../types/glpi';
import { Server, User, Moon, Sun, Smartphone, LogOut, CheckCircle2, Volume2, VolumeX, Play } from 'lucide-react';
import { isNotificationSoundEnabled, setNotificationSoundEnabled, playNotificationSound } from '../services/notificationSound';
import { getThemePreference, setThemePreference } from '../theme';
import type { ThemePreference } from '../theme';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'Sistema', icon: <Smartphone size={14} /> },
  { value: 'light', label: 'Claro', icon: <Sun size={14} /> },
  { value: 'dark', label: 'Oscuro', icon: <Moon size={14} /> }
];

interface SettingsProps {
  session: GLPISession;
  onLogout: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ session, onLogout }) => {
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  const [sound, setSound] = useState<boolean>(isNotificationSoundEnabled);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setNotificationSoundEnabled(next);
    if (next) playNotificationSound('now', true);
  };

  const changeTheme = (pref: ThemePreference) => {
    setTheme(pref);
    setThemePreference(pref);
  };

  const envUrl = import.meta.env.VITE_GLPI_URL;
  const envAppToken = import.meta.env.VITE_GLPI_APP_TOKEN;

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
          Ajustes y Conexión GLPI
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Información del servidor y preferencia de tema
        </p>
      </div>

      {/* Tarjeta de Sesión Activa */}
      <div className="card">
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={18} color="var(--primary)" /> Perfil Autenticado
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Usuario:</span>
            <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{session.username}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Perfil Activo:</span>
            <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{session.activeProfile || 'Estándar'}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Entidad GLPI:</span>
            <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{session.activeEntity || 'Raíz'}</span>
          </div>
        </div>
      </div>

      {/* Servidor: solo el estado, sin mostrar la URL ni el App-Token */}
      <div className="card">
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Server size={18} color="var(--primary)" /> Servidor GLPI
        </h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <span className="badge" style={{ background: '#ecfdf5', color: '#059669' }}>
            <CheckCircle2 size={12} /> Conectado
          </span>
          <span className="badge" style={{ background: envUrl ? '#ecfdf5' : '#fef2f2', color: envUrl ? '#059669' : '#dc2626' }}>
            <CheckCircle2 size={12} /> URL {envUrl ? 'configurada' : 'manual'}
          </span>
          <span className="badge" style={{ background: envAppToken ? '#ecfdf5' : '#fef2f2', color: envAppToken ? '#059669' : '#dc2626' }}>
            <CheckCircle2 size={12} /> App-Token {envAppToken ? 'configurado' : 'manual'}
          </span>
        </div>
      </div>

      {/* Preferencia de Tema: por defecto sigue el del sistema del teléfono */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          {theme === 'dark' ? <Moon size={20} color="#6366f1" /> : theme === 'light' ? <Sun size={20} color="#f59e0b" /> : <Smartphone size={20} color="var(--primary)" />}
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Apariencia</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {theme === 'system' ? 'Sigue el modo claro/oscuro de tu teléfono' : 'Tema fijo, sin importar el del teléfono'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', padding: '4px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          {THEME_OPTIONS.map(option => {
            const selected = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => changeTheme(option.value)}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 4px',
                  borderRadius: '9px',
                  border: 'none',
                  background: selected ? 'var(--card-bg)' : 'transparent',
                  boxShadow: selected ? 'var(--shadow-sm)' : 'none',
                  color: selected ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer'
                }}
              >
                {option.icon} {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sonido de los avisos de tareas por comenzar */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {sound ? <Volume2 size={20} color="var(--primary)" /> : <VolumeX size={20} color="var(--text-muted)" />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Sonido de avisos</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {sound ? 'Suena al avisar que una tarea está por comenzar y al concluir un hito' : 'Sin sonidos; los avisos solo vibran'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sound}
            aria-label="Sonido de avisos"
            onClick={toggleSound}
            style={{
              position: 'relative', width: '50px', height: '30px', flexShrink: 0, border: 'none', borderRadius: '999px', cursor: 'pointer',
              background: sound ? 'var(--brand-amber)' : 'var(--border-color)', transition: 'background 0.2s ease'
            }}
          >
            <span style={{
              position: 'absolute', top: '3px', left: sound ? '23px' : '3px', width: '24px', height: '24px', borderRadius: '50%',
              background: '#ffffff', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)', transition: 'left 0.2s ease'
            }} />
          </button>
        </div>
        {sound && (
          <button
            type="button"
            onClick={() => playNotificationSound('soon', true)}
            style={{
              marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '10px',
              border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--primary)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer'
            }}
          >
            <Play size={14} /> Probar sonido
          </button>
        )}
      </div>

      {/* Botón de Logout */}
      <button
        onClick={onLogout}
        className="btn-secondary"
        style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', marginTop: '10px' }}
      >
        <LogOut size={18} /> Cerrar Sesión en GLPI
      </button>
    </div>
  );
};
