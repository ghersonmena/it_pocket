import React, { useState } from 'react';
import type { GLPISession } from '../types/glpi';
import { NotificationService, PRESET_OFFSETS, formatOffset } from '../services/notificationService';
import {
  getDevicePermission, isIosBrowser, isDeviceNotificationEnabled, setDeviceNotificationEnabled,
  requestDevicePermission, showTestDeviceNotification, type DevicePermission
} from '../services/deviceNotifications';
import { BellRing, Plus, X, Smartphone, Send } from 'lucide-react';

interface NotificationSettingsProps {
  session: GLPISession;
}

type Unit = 'min' | 'h' | 'd';
const UNIT_MINUTES: Record<Unit, number> = { min: 1, h: 60, d: 1440 };

const offsetLabel = (minutes: number) => (minutes === 0 ? 'Al comenzar' : `${formatOffset(minutes)} antes`);

const chipStyle = (selected: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '999px', cursor: 'pointer',
  fontWeight: 700, fontSize: '0.78rem',
  border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border-color)'}`,
  background: selected ? 'var(--primary-soft)' : 'var(--card-bg)',
  color: selected ? 'var(--primary)' : 'var(--text-main)'
});

const Switch: React.FC<{ on: boolean; label: string; onToggle: () => void }> = ({ on, label, onToggle }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onToggle}
    style={{ position: 'relative', width: '50px', height: '30px', flexShrink: 0, border: 'none', borderRadius: '999px', cursor: 'pointer', background: on ? 'var(--brand-amber)' : 'var(--border-color)', transition: 'background 0.2s ease' }}
  >
    <span style={{ position: 'absolute', top: '3px', left: on ? '23px' : '3px', width: '24px', height: '24px', borderRadius: '50%', background: '#ffffff', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)', transition: 'left 0.2s ease' }} />
  </button>
);

// Ajustes de avisos de tareas: con cuánta anticipación avisar y notificaciones del teléfono
export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ session }) => {
  const [offsets, setOffsets] = useState<number[]>(() => NotificationService.getOffsets(session));
  const [amount, setAmount] = useState<string>('');
  const [unit, setUnit] = useState<Unit>('h');
  const [permission, setPermission] = useState<DevicePermission>(getDevicePermission);
  const [deviceOn, setDeviceOn] = useState<boolean>(isDeviceNotificationEnabled);
  const [message, setMessage] = useState<string>('');

  const save = (next: number[]) => {
    const clean = [...new Set(next)].sort((a, b) => b - a);
    setOffsets(clean);
    NotificationService.setOffsets(session, clean);
  };
  const toggle = (minutes: number) => save(offsets.includes(minutes) ? offsets.filter(o => o !== minutes) : [...offsets, minutes]);

  const addCustom = () => {
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) { setMessage('Escribe cuánto tiempo antes quieres el aviso.'); return; }
    const minutes = Math.round(value * UNIT_MINUTES[unit]);
    if (minutes > 30 * 1440) { setMessage('El aviso puede ser hasta 30 días antes.'); return; }
    save([...offsets, minutes]);
    setAmount('');
    setMessage('');
  };

  const enableDevice = async () => {
    const result = await requestDevicePermission();
    setPermission(result);
    if (result === 'granted') { setDeviceOn(true); await showTestDeviceNotification(); }
  };

  const toggleDevice = () => {
    const next = !deviceOn;
    setDeviceOn(next);
    setDeviceNotificationEnabled(next);
  };

  const custom = offsets.filter(o => !PRESET_OFFSETS.includes(o));

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <BellRing size={20} color="var(--primary)" />
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Avisos de tareas</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {offsets.length === 0 ? 'Sin avisos: elige al menos un tiempo' : 'Cuándo avisarte antes de que comience una tarea'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {PRESET_OFFSETS.map(minutes => (
          <button key={minutes} type="button" onClick={() => toggle(minutes)} aria-pressed={offsets.includes(minutes)} style={chipStyle(offsets.includes(minutes))}>
            {offsetLabel(minutes)}
          </button>
        ))}
        {custom.map(minutes => (
          <span key={minutes} style={chipStyle(true)}>
            {offsetLabel(minutes)}
            <button
              type="button"
              onClick={() => toggle(minutes)}
              aria-label={`Quitar aviso de ${offsetLabel(minutes)}`}
              style={{ display: 'flex', padding: '2px', border: 'none', borderRadius: '50%', background: 'rgba(245, 165, 36, 0.2)', color: 'var(--primary)', cursor: 'pointer' }}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      {/* Tiempo personalizado */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
        <input
          className="form-input"
          inputMode="decimal"
          value={amount}
          onChange={e => { setAmount(e.target.value.replace(/[^0-9.,]/g, '')); setMessage(''); }}
          onKeyDown={e => { if (e.key === 'Enter') addCustom(); }}
          placeholder="Otro"
          aria-label="Tiempo personalizado"
          style={{ flex: 1, minWidth: 0, paddingLeft: '12px' }}
        />
        <select className="form-input" value={unit} onChange={e => setUnit(e.target.value as Unit)} aria-label="Unidad" style={{ width: 'auto', paddingLeft: '10px', paddingRight: '8px' }}>
          <option value="min">minutos</option>
          <option value="h">horas</option>
          <option value="d">días</option>
        </select>
        <button
          type="button"
          onClick={addCustom}
          aria-label="Agregar tiempo de aviso"
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--primary)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
        >
          <Plus size={15} /> Agregar
        </button>
      </div>
      {message && <div style={{ marginTop: '6px', fontSize: '0.76rem', fontWeight: 600, color: '#dc2626' }}>{message}</div>}

      {/* Notificaciones del teléfono */}
      <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Smartphone size={20} color={permission === 'granted' && deviceOn ? 'var(--primary)' : 'var(--text-muted)'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Notificaciones del teléfono</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {permission === 'granted'
                ? (deviceOn ? 'Los avisos también quedan en la barra de notificaciones del teléfono' : 'Desactivadas: los avisos solo aparecen dentro de la app')
                : permission === 'denied'
                  ? 'Bloqueadas para esta app: actívalas en los ajustes de notificaciones del teléfono o del navegador'
                  : permission === 'unsupported'
                    ? (isIosBrowser()
                      ? 'En iPhone solo funcionan con la app instalada: en Safari toca Compartir → "Agregar a inicio" y ábrela desde ahí'
                      : 'Este navegador no permite notificaciones')
                    : 'Recibe los avisos aunque la app esté minimizada'}
            </div>
          </div>
          {permission === 'granted' && <Switch on={deviceOn} label="Notificaciones del teléfono" onToggle={toggleDevice} />}
        </div>
        {permission === 'default' && (
          <button
            type="button"
            onClick={enableDevice}
            style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '12px', border: 'none', background: 'var(--primary-gradient)', color: 'var(--on-primary)', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}
          >
            <BellRing size={15} /> Activar notificaciones
          </button>
        )}
        {permission === 'granted' && deviceOn && (
          <button
            type="button"
            onClick={() => showTestDeviceNotification()}
            style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--primary)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
          >
            <Send size={14} /> Probar notificación
          </button>
        )}
        <div style={{ marginTop: '10px', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
          Los avisos solo se generan con la app abierta: al minimizarla, el teléfono la congela en pocos minutos y el aviso sale hasta que vuelves a ella.
        </div>
      </div>
    </div>
  );
};
