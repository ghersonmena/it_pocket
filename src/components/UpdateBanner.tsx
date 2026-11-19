import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { compareVersions } from '../releases';

// La app instalada (PWA) se queda abierta en segundo plano días enteros y no vuelve a pedir la
// página: aquí se pregunta al servidor qué versión tiene (version.json, sin caché) al volver a la
// app y cada 15 minutos; si hay una más nueva, se ofrece recargar.
const CHECK_EVERY_MS = 15 * 60 * 1000;

const fetchServerVersion = async (): Promise<string | null> => {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
};

// Vuelve a pedir la página saltándose la caché y recarga con la versión nueva
const reloadToLatest = async () => {
  try {
    await fetch('/', { cache: 'reload' });
  } catch { /* sin red: se recarga igual */ }
  window.location.reload();
};

export const UpdateBanner: React.FC = () => {
  const [available, setAvailable] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [reloading, setReloading] = useState<boolean>(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const check = async () => {
      const server = await fetchServerVersion();
      if (server && compareVersions(server, __APP_VERSION__) > 0) setAvailable(server);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const first = window.setTimeout(check, 3000);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
    };
  }, []);

  if (!available || dismissed === available) return null;

  return (
    <div
      role="status"
      className="notification-banner"
      style={{
        position: 'absolute', top: 'calc(10px + env(safe-area-inset-top, 0px))', left: '12px', right: '12px', zIndex: 1100,
        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 10px 10px 12px', borderRadius: '18px',
        background: 'var(--brand-graphite)', color: '#ffffff', boxShadow: '0 14px 34px -10px rgba(0, 0, 0, 0.55)',
        border: '1px solid rgba(245, 165, 36, 0.45)'
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 800 }}>Nueva versión {available}</span>
        <span style={{ display: 'block', fontSize: '0.74rem', color: '#a9afbc' }}>Actualiza para ver los cambios</span>
      </span>
      <button
        type="button"
        onClick={() => { setReloading(true); reloadToLatest(); }}
        disabled={reloading}
        style={{
          flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', border: 'none', borderRadius: '12px',
          background: 'var(--brand-amber)', color: 'var(--brand-graphite)', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer'
        }}
      >
        <RefreshCw size={15} className={reloading ? 'spin' : undefined} /> Actualizar
      </button>
      <button
        type="button"
        onClick={() => setDismissed(available)}
        aria-label="Más tarde"
        style={{ flexShrink: 0, display: 'flex', padding: '6px', border: 'none', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', cursor: 'pointer' }}
      >
        <X size={16} />
      </button>
    </div>
  );
};
