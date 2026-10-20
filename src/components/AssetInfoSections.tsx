import React, { useState, useEffect } from 'react';
import type { GLPISession } from '../types/glpi';
import { AssetService } from '../services/assetService';
import type { AssetTechInfo, NetworkPortInfo } from '../services/assetService';
import { RefreshCw, Cpu, MemoryStick, HardDrive, MonitorCog, Network, Copy, Check } from 'lucide-react';

interface SectionProps {
  session: GLPISession;
  itemtype: string;
  assetId: number;
}

const formatSize = (mb: number): string => {
  if (mb >= 1024 * 1024) return `${(mb / 1024 / 1024).toFixed(1)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB`;
  return `${mb} MB`;
};

const formatDate = (value?: string) => {
  if (!value) return undefined;
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

const Loading: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
    <RefreshCw className="spin" size={22} style={{ marginBottom: '8px' }} />
    <div style={{ fontSize: '0.85rem' }}>{text}</div>
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{text}</div>
);

const CardTitle: React.FC<{ icon: React.ReactNode; title: string; right?: React.ReactNode }> = ({ icon, title, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
    <span style={{ color: 'var(--primary)', display: 'flex' }}>{icon}</span>
    <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
    {right}
  </div>
);

const Line: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '6px 0', borderTop: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
    <span style={{ fontWeight: 700, color: value ? 'var(--text-main)' : 'var(--text-muted)', textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
  </div>
);

// Sistema operativo, procesador, memoria y discos (datos del inventario automático, solo lectura)
export const AssetHardwareSection: React.FC<SectionProps> = ({ session, itemtype, assetId }) => {
  const [info, setInfo] = useState<AssetTechInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    AssetService.getTechInfo(session, itemtype, assetId)
      .then(data => { if (!cancelled) setInfo(data); })
      .catch(err => { if (!cancelled) setError(err.message || 'No se pudo consultar el hardware.'); });
    return () => { cancelled = true; };
  }, [session, itemtype, assetId]);

  if (error) return <Empty text={error} />;
  if (!info) return <Loading text="Consultando sistema y hardware..." />;
  if (!info.os && info.processors.length === 0 && info.memory.totalMB === 0 && info.disks.length === 0) {
    return <Empty text="Este equipo no tiene datos de sistema ni hardware en GLPI (normalmente los llena el agente de inventario)." />;
  }

  return (
    <>
      <div className="card">
        <CardTitle icon={<MonitorCog size={16} />} title="Sistema operativo" />
        <Line label="Sistema" value={info.os?.name} />
        <Line label="Versión" value={info.os?.version} />
        <Line label="Arquitectura" value={info.os?.architecture} />
        {info.os?.kernel && <Line label="Kernel" value={info.os.kernel} />}
        <Line label="Instalado" value={formatDate(info.os?.installDate)} />
      </div>

      <div className="card">
        <CardTitle icon={<Cpu size={16} />} title="Procesador" />
        {info.processors.length === 0 ? <Line label="Procesador" /> : info.processors.map((cpu, i) => (
          <div key={i}>
            <Line label={info.processors.length > 1 ? `CPU ${i + 1}` : 'Modelo'} value={cpu.name} />
            {(cpu.cores || cpu.threads) && (
              <Line label="Núcleos / hilos" value={`${cpu.cores ?? '—'} / ${cpu.threads ?? '—'}`} />
            )}
            {cpu.frequencyMHz && <Line label="Frecuencia" value={`${(cpu.frequencyMHz / 1000).toFixed(2)} GHz`} />}
          </div>
        ))}
      </div>

      <div className="card">
        <CardTitle icon={<MemoryStick size={16} />} title="Memoria RAM" right={
          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>{info.memory.totalMB ? formatSize(info.memory.totalMB) : '—'}</span>
        } />
        {info.memory.modules.map((m, i) => (
          <Line key={i} label={`Módulo ${i + 1}`} value={`${formatSize(m.sizeMB)} · ${m.type}`} />
        ))}
      </div>

      <div className="card">
        <CardTitle icon={<HardDrive size={16} />} title="Almacenamiento" />
        {info.disks.length === 0 ? <Line label="Discos" /> : info.disks.map((disk, i) => {
          const used = disk.totalMB ? Math.round(((disk.totalMB - disk.freeMB) / disk.totalMB) * 100) : 0;
          const color = used >= 90 ? '#dc2626' : used >= 75 ? '#f59e0b' : '#10b981';
          return (
            <div key={i} style={{ padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.82rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-main)', wordBreak: 'break-all' }}>
                  {disk.mountpoint || disk.name}{disk.filesystem && <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}> · {disk.filesystem}</span>}
                </span>
                <span style={{ fontWeight: 800, color, flexShrink: 0 }}>{formatSize(disk.freeMB)} libres</span>
              </div>
              <div style={{ height: '6px', marginTop: '6px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${used}%`, height: '100%', background: color }} />
              </div>
              <div style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {used}% usado de {formatSize(disk.totalMB)}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

// Puertos de red con sus IPs. Por defecto solo tarjetas físicas con IPs útiles; el resto se despliega
export const AssetNetworkSection: React.FC<SectionProps> = ({ session, itemtype, assetId }) => {
  const [ports, setPorts] = useState<NetworkPortInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<boolean>(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    AssetService.getNetwork(session, itemtype, assetId)
      .then(data => { if (!cancelled) setPorts(data); })
      .catch(err => { if (!cancelled) setError(err.message || 'No se pudo consultar la red.'); });
    return () => { cancelled = true; };
  }, [session, itemtype, assetId]);

  const copy = async (ip: string) => {
    try {
      await navigator.clipboard.writeText(ip);
      setCopied(ip);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* sin permiso de portapapeles */ }
  };

  if (error) return <Empty text={error} />;
  if (!ports) return <Loading text="Consultando puertos e IPs..." />;
  if (ports.length === 0) return <Empty text="Este activo no tiene puertos de red registrados en GLPI." />;

  const mainPorts = ports.filter(p => !p.virtual && p.ips.some(ip => ip.useful));
  const visible = showAll || mainPorts.length === 0 ? ports : mainPorts;
  const hidden = ports.length - mainPorts.length;
  const mainIps = mainPorts.flatMap(p => p.ips.filter(ip => ip.useful && ip.version === 4).map(ip => ip.address));

  return (
    <>
      {mainIps.length > 0 && (
        <div className="card" style={{ background: 'rgba(245, 165, 36, 0.08)', border: '1px solid rgba(245, 165, 36, 0.3)' }}>
          <CardTitle icon={<Network size={16} />} title={mainIps.length === 1 ? 'IP principal' : 'IPs principales'} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {[...new Set(mainIps)].map(ip => (
              <button
                key={ip}
                type="button"
                onClick={() => copy(ip)}
                title="Copiar IP"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '10px',
                  border: '1px solid rgba(245, 165, 36, 0.4)', background: 'var(--card-bg)', color: 'var(--primary)',
                  fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer'
                }}
              >
                {ip} {copied === ip ? <Check size={14} /> : <Copy size={13} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.map(port => (
        <div key={port.id} className="card" style={{ padding: '12px 14px', opacity: port.virtual ? 0.8 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)', wordBreak: 'break-all' }}>{port.name}</span>
            {port.virtual && <span className="badge" style={{ background: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: '0.65rem' }}>virtual</span>}
          </div>
          {port.mac && <div style={{ marginTop: '2px', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>MAC {port.mac}</div>}
          {port.ips.length === 0 ? (
            <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sin IP asignada</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px' }}>
              {port.ips.map(ip => (
                <span key={ip.address} style={{
                  fontFamily: 'monospace', fontSize: ip.useful ? '0.85rem' : '0.72rem', fontWeight: ip.useful ? 700 : 500,
                  color: ip.useful ? 'var(--text-main)' : 'var(--text-muted)', wordBreak: 'break-all'
                }}>
                  {ip.address} <span style={{ fontFamily: 'inherit', fontSize: '0.65rem', color: 'var(--text-muted)' }}>IPv{ip.version}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {hidden > 0 && mainPorts.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="btn-secondary"
          style={{ marginBottom: '14px' }}
        >
          {showAll ? 'Mostrar solo las tarjetas principales' : `Mostrar los ${hidden} puertos restantes (virtuales o sin IP)`}
        </button>
      )}
    </>
  );
};
