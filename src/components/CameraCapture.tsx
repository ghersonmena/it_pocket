import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, RefreshCw, Camera } from 'lucide-react';

interface Shot {
  key: number;
  blob: Blob;
  url: string;
}

interface CameraCaptureProps {
  // Devuelve todas las fotos tomadas (nunca se descartan al cerrar)
  onDone: (blobs: Blob[]) => void;
  // Si la cámara integrada no está disponible: abrir la cámara nativa del teléfono.
  // Se llama dentro del clic del usuario para que el navegador permita abrir el selector.
  onUseNativeCamera: () => void;
}

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

// Cámara a pantalla completa para tomar varias fotos seguidas sin salir de la app
export const CameraCapture: React.FC<CameraCaptureProps> = ({ onDone, onUseNativeCamera }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [flash, setFlash] = useState<boolean>(false);
  const [capturing, setCapturing] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara dentro de la app (se requiere HTTPS).');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (err: any) {
        if (cancelled) return;
        setError(
          err?.name === 'NotAllowedError'
            ? 'No se dio permiso para usar la cámara. Actívalo en la configuración del navegador.'
            : 'No se pudo abrir la cámara.'
        );
      }
    };

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  // Las miniaturas se liberan al cerrar; los blobs siguen vivos para el padre
  const shotsRef = useRef<Shot[]>([]);
  useEffect(() => { shotsRef.current = shots; }, [shots]);
  useEffect(() => () => {
    shotsRef.current.forEach(shot => URL.revokeObjectURL(shot.url));
  }, []);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !ready || capturing || !video.videoWidth) return;

    setCapturing(true);
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    setFlash(true);
    window.setTimeout(() => setFlash(false), 120);

    canvas.toBlob(blob => {
      setCapturing(false);
      if (!blob) return;
      setShots(prev => [...prev, { key: Date.now(), blob, url: URL.createObjectURL(blob) }]);
    }, 'image/jpeg', JPEG_QUALITY);
  };

  const removeShot = (key: number) => {
    setShots(prev => {
      const shot = prev.find(s => s.key === key);
      if (shot) URL.revokeObjectURL(shot.url);
      return prev.filter(s => s.key !== key);
    });
  };

  const finish = () => onDone(shots.map(shot => shot.blob));

  // Portal a <body>: el árbol está dentro de un contenedor animado con transform, que
  // haría que position: fixed se recortara a ese contenedor en vez de cubrir la pantalla
  return createPortal(
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        background: '#000',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      {/* Barra superior */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', color: '#fff' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
          {shots.length === 0 ? 'Toma las fotos del mantenimiento' : `${shots.length} foto${shots.length === 1 ? '' : 's'} tomada${shots.length === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          onClick={finish}
          aria-label="Cerrar cámara"
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', padding: '8px', color: '#fff', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Visor */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: error ? 'none' : 'block' }}
        />
        {!ready && !error && (
          <div style={{ position: 'absolute', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
            <RefreshCw size={16} className="spin" /> Abriendo cámara...
          </div>
        )}
        {error && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#e2e8f0' }}>
            <div style={{ fontSize: '0.88rem', marginBottom: '16px' }}>{error}</div>
            <button
              type="button"
              onClick={() => {
                finish();
                onUseNativeCamera();
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                borderRadius: '12px', border: 'none', background: 'var(--primary-gradient)',
                color: 'var(--on-primary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
              }}
            >
              <Camera size={16} /> Usar la cámara del teléfono
            </button>
          </div>
        )}
        {flash && <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0.6 }} />}
      </div>

      {/* Miniaturas de lo tomado en esta sesión de cámara */}
      {shots.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '8px 12px' }}>
          {shots.map(shot => (
            <div key={shot.key} style={{ position: 'relative', flex: '0 0 auto' }}>
              <img src={shot.url} alt="Foto tomada" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', display: 'block' }} />
              <button
                type="button"
                onClick={() => removeShot(shot.key)}
                aria-label="Eliminar foto"
                style={{
                  position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  borderRadius: '50%', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer'
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Controles: obturador + terminar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px 20px' }}>
        <span style={{ width: '88px' }} />
        <button
          type="button"
          onClick={takePhoto}
          disabled={!ready || capturing}
          aria-label="Tomar foto"
          style={{
            width: '68px', height: '68px', borderRadius: '50%', border: '4px solid #fff',
            background: ready ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
            cursor: ready ? 'pointer' : 'not-allowed', boxShadow: '0 0 0 3px rgba(0,0,0,0.4)'
          }}
        />
        <button
          type="button"
          onClick={finish}
          disabled={shots.length === 0}
          style={{
            width: '88px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
            padding: '10px 0', borderRadius: '12px', border: 'none',
            background: shots.length ? '#10b981' : 'rgba(255,255,255,0.15)',
            color: '#fff', fontWeight: 700, fontSize: '0.8rem',
            cursor: shots.length ? 'pointer' : 'not-allowed'
          }}
        >
          <Check size={16} /> Listo
        </button>
      </div>
    </div>,
    document.body
  );
};
