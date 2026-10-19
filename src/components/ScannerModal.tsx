import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { detectBarcode, recognizeCandidates, preloadOcr, normalizeScannedValue, cropGuide, GUIDE } from '../services/scanService';
import type { ScanFieldKind } from '../services/scanService';
import { X, Barcode, ScanText, Flashlight, RefreshCw, Camera, Check, RotateCcw } from 'lucide-react';

interface ScannerModalProps {
  fieldLabel: string;
  kind: ScanFieldKind;
  onResult: (value: string) => void;
  onClose: () => void;
}

type Mode = 'barcode' | 'text';

const BARCODE_INTERVAL_MS = 300;

// Prepara la imagen para el OCR: escala de grises y tamaño suficiente para letras pequeñas
const prepareForOcr = (source: HTMLCanvasElement): HTMLCanvasElement => {
  // Altura objetivo ~420 px: las letras de etiquetas chicas quedan de un tamaño que el OCR lee bien
  const scale = Math.min(4, Math.max(1, 420 / source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'grayscale(1) contrast(1.4)';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
};

// Imagen de un archivo (cámara nativa, sin HTTPS) a canvas, limitada a 2000 px
const fileToCanvas = async (file: File): Promise<HTMLCanvasElement> => {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
};

// Escáner a pantalla completa: códigos de barras/QR (automático) o texto con OCR
export const ScannerModal: React.FC<ScannerModalProps> = ({ fieldLabel, kind, onResult, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('barcode');
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  // Sin cámara en vivo (sin HTTPS o sin permiso): se usa una foto de la cámara del teléfono
  const [photoFallback, setPhotoFallback] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  // Zoom: 'hardware' = zoom de la cámara (más detalle real, Chrome Android); 'digital' = ampliar
  // la imagen en pantalla (respaldo cuando la cámara no lo permite, p. ej. iPhone)
  const [zoom, setZoom] = useState<number>(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number; mode: 'hardware' | 'digital' }>(
    { min: 1, max: 4, step: 0.1, mode: 'digital' }
  );
  const zoomRef = useRef<number>(1);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const applyingZoomRef = useRef<boolean>(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Resultado: código leído (uno) o candidatos del OCR (varios, se elige uno)
  const [barcodeValue, setBarcodeValue] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);

  const hasResult = barcodeValue !== null || candidates !== null;

  // Abrir la cámara trasera
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhotoFallback('Este navegador solo permite la cámara en vivo con HTTPS. Puedes escanear con una foto.');
        return;
      }
      try {
        // Más resolución = más detalle al hacer zoom digital sobre etiquetas chicas
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() || {}) as MediaTrackCapabilities & {
          torch?: boolean;
          zoom?: { min: number; max: number; step?: number };
          focusMode?: string[];
        };
        setTorchAvailable(!!caps.torch);
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          // Zoom real de la cámara: se limita a 8x (más allá suele ser digital y se ve peor)
          setZoomRange({ min: caps.zoom.min, max: Math.min(caps.zoom.max, 8), step: caps.zoom.step || 0.1, mode: 'hardware' });
        }
        if (caps.focusMode?.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
      } catch (err: any) {
        if (!cancelled) {
          setPhotoFallback(err?.name === 'NotAllowedError'
            ? 'No se dio permiso para la cámara. Puedes escanear con una foto.'
            : 'No se pudo abrir la cámara. Puedes escanear con una foto.');
        }
      }
    };
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Al pasar a modo texto, cargar el OCR por adelantado (la primera vez descarga ~7 MB)
  useEffect(() => {
    if (mode !== 'text') return;
    let cancelled = false;
    const timer = window.setTimeout(() => { if (!cancelled) setBusy('Preparando lector de texto...'); }, 0);
    preloadOcr()
      .catch(() => { if (!cancelled) setMessage('No se pudo cargar el lector de texto.'); })
      .finally(() => { window.clearTimeout(timer); if (!cancelled) setBusy(null); });
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [mode]);

  const changeZoom = useCallback((value: number) => {
    const next = Math.min(zoomRange.max, Math.max(zoomRange.min, Math.round(value / zoomRange.step) * zoomRange.step));
    zoomRef.current = next;
    setZoom(next);
    if (zoomRange.mode !== 'hardware') return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    pendingZoomRef.current = next;
    if (applyingZoomRef.current) return;
    applyingZoomRef.current = true;
    (async () => {
      while (pendingZoomRef.current !== null) {
        const target = pendingZoomRef.current;
        pendingZoomRef.current = null;
        try {
          await track.applyConstraints({ advanced: [{ zoom: target } as MediaTrackConstraintSet] });
        } catch { /* la cámara rechazó ese nivel de zoom */ }
      }
      applyingZoomRef.current = false;
    })();
  }, [zoomRange]);

  // Pellizco con dos dedos sobre el visor
  const onPinchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    pinchRef.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: zoomRef.current };
  };
  const onPinchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    changeZoom(pinchRef.current.zoom * (distance / pinchRef.current.distance));
  };
  const onPinchEnd = () => { pinchRef.current = null; };

  // Zoom digital: escala visual del video (el zoom de hardware ya llega aplicado en la imagen)
  const digitalZoom = zoomRange.mode === 'digital' ? zoom : 1;

  const foundBarcode = useCallback((raw: string) => {
    navigator.vibrate?.(80);
    setBarcodeValue(kind === 'uuid' ? normalizeScannedValue(raw, kind) : raw);
  }, [kind]);

  // Modo código de barras: revisar el recuadro guía varias veces por segundo
  useEffect(() => {
    if (mode !== 'barcode' || !cameraReady || hasResult) return;
    let stopped = false;
    let running = false;
    const timer = window.setInterval(async () => {
      if (running || stopped || !videoRef.current) return;
      running = true;
      try {
        const frame = cropGuide(videoRef.current, zoomRange.mode === 'digital' ? zoomRef.current : 1);
        const value = frame ? await detectBarcode(frame) : null;
        if (value && !stopped) foundBarcode(value);
      } finally {
        running = false;
      }
    }, BARCODE_INTERVAL_MS);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [mode, cameraReady, hasResult, foundBarcode, zoomRange.mode]);

  const runOcr = async (image: HTMLCanvasElement) => {
    setBusy('Leyendo texto...');
    setMessage(null);
    try {
      const found = await recognizeCandidates(prepareForOcr(image), kind);
      if (found.length) {
        navigator.vibrate?.(80);
        setCandidates(found);
      } else {
        setMessage('No se encontró texto legible. Acércate, enfoca y evita reflejos.');
      }
    } catch {
      setMessage('No se pudo leer el texto.');
    } finally {
      setBusy(null);
    }
  };

  const readTextFromCamera = () => {
    if (!videoRef.current) return;
    const frame = cropGuide(videoRef.current, digitalZoom);
    if (frame) runOcr(frame);
  };

  // Foto de la cámara nativa: primero se busca un código; si no hay, se lee el texto
  const handlePhoto = async (file?: File) => {
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!file) return;
    setBusy('Analizando foto...');
    setMessage(null);
    try {
      const canvas = await fileToCanvas(file);
      if (mode === 'barcode') {
        const value = await detectBarcode(canvas);
        if (value) { foundBarcode(value); setBusy(null); return; }
        setMessage('No se encontró un código de barras; intentando leer el texto...');
      }
      await runOcr(canvas);
    } catch {
      setMessage('No se pudo analizar la foto.');
      setBusy(null);
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(v => !v);
    } catch { /* la cámara no permitió la linterna */ }
  };

  const resetResult = () => {
    setBarcodeValue(null);
    setCandidates(null);
    setMessage(null);
  };

  const accept = (value: string) => {
    onResult(value);
    onClose();
  };

  const modeButton = (value: Mode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => { setMode(value); resetResult(); }}
      style={{
        flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        padding: '9px 6px', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
        background: mode === value ? '#fff' : 'transparent', color: mode === value ? '#0f172a' : '#e2e8f0'
      }}
    >
      {icon} {label}
    </button>
  );

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', flexDirection: 'column', background: '#000',
        paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      {/* Barra superior */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px', color: '#fff' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>Escanear</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 800 }}>{fieldLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {torchAvailable && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label="Linterna"
              style={{ background: torchOn ? '#facc15' : 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', padding: '8px', color: torchOn ? '#0f172a' : '#fff', cursor: 'pointer' }}
            >
              <Flashlight size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar escáner"
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', padding: '8px', color: '#fff', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Modo */}
      <div style={{ display: 'flex', gap: '4px', margin: '0 12px 10px', padding: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '14px' }}>
        {modeButton('barcode', 'Código de barras', <Barcode size={16} />)}
        {modeButton('text', 'Texto / números', <ScanText size={16} />)}
      </div>

      {/* Visor */}
      <div
        style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', touchAction: 'none' }}
        onTouchStart={onPinchStart}
        onTouchMove={onPinchMove}
        onTouchEnd={onPinchEnd}
        onTouchCancel={onPinchEnd}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: photoFallback ? 'none' : 'block',
            transform: digitalZoom !== 1 ? `scale(${digitalZoom})` : undefined, transformOrigin: 'center center'
          }}
        />

        {!photoFallback && (
          <>
            {/* Recuadro guía: lo de afuera se oscurece */}
            <div
              style={{
                position: 'absolute', left: `${(1 - GUIDE.width) * 50}%`, top: `${(1 - GUIDE.height) * 50}%`,
                width: `${GUIDE.width * 100}%`, height: `${GUIDE.height * 100}%`,
                border: `3px solid ${hasResult ? '#10b981' : '#fff'}`, borderRadius: '16px',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)', pointerEvents: 'none', transition: 'border-color 0.2s'
              }}
            >
              {mode === 'barcode' && !hasResult && cameraReady && (
                <div className="scan-line" style={{ position: 'absolute', left: '6%', right: '6%', height: '2px', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
              )}
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(${(1 + GUIDE.height) * 50}% + 12px)`, textAlign: 'center', color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600, padding: '0 20px' }}>
              {!cameraReady ? 'Abriendo cámara...'
                : mode === 'barcode' ? 'Centra el código de barras o QR dentro del recuadro'
                : 'Centra el texto en el recuadro; si es muy chico usa el zoom (o pellizca) en vez de acercarte, y toca “Leer”'}
            </div>
          </>
        )}

        {!photoFallback && cameraReady && (
          <div
            style={{
              position: 'absolute', left: '12px', right: '12px', bottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px',
              padding: '10px 12px', borderRadius: '16px', background: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)'
            }}
            onTouchStart={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ color: '#e2e8f0', fontSize: '0.72rem', fontWeight: 700 }}>
                Zoom {zoom.toFixed(1)}x{zoomRange.mode === 'digital' ? ' · digital' : ''}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[1, 2, 3, 5].filter(level => level >= zoomRange.min && level <= zoomRange.max).map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => changeZoom(level)}
                    style={{
                      minWidth: '36px', padding: '5px 8px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                      fontWeight: 800, fontSize: '0.75rem',
                      background: Math.abs(zoom - level) < 0.05 ? '#facc15' : 'rgba(255,255,255,0.15)',
                      color: Math.abs(zoom - level) < 0.05 ? '#0f172a' : '#fff'
                    }}
                  >
                    {level}x
                  </button>
                ))}
              </div>
            </div>
            <input
              type="range"
              aria-label="Zoom"
              min={zoomRange.min}
              max={zoomRange.max}
              step={zoomRange.step}
              value={zoom}
              onChange={e => changeZoom(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#facc15' }}
            />
          </div>
        )}

        {photoFallback && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px', textAlign: 'center', color: '#e2e8f0' }}>
            <div style={{ fontSize: '0.88rem' }}>{photoFallback}</div>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={!!busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 18px', borderRadius: '14px', border: 'none', background: 'var(--primary-gradient)', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
            >
              <Camera size={18} /> Tomar foto de la etiqueta
            </button>
          </div>
        )}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={e => handlePhoto(e.target.files?.[0])}
        />
      </div>

      {/* Panel inferior: estado, resultado o botón de lectura */}
      <div style={{ padding: '14px 16px 18px', background: '#0b0f17', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {busy && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600, padding: '6px 0' }}>
            <RefreshCw size={16} className="spin" /> {busy}
          </div>
        )}
        {message && !busy && (
          <div style={{ color: '#fbbf24', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center', marginBottom: '10px' }}>{message}</div>
        )}

        {barcodeValue !== null && (
          <>
            <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px' }}>Código leído</div>
            <button
              type="button"
              onClick={() => accept(barcodeValue)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '12px 14px', borderRadius: '14px', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '1.05rem', fontWeight: 800, wordBreak: 'break-all', textAlign: 'left' }}>{barcodeValue}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}><Check size={18} /> Usar</span>
            </button>
          </>
        )}

        {candidates !== null && (
          <>
            <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px' }}>Toca el valor correcto</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '32dvh', overflowY: 'auto' }}>
              {candidates.map((value, i) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => accept(value)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '11px 14px', borderRadius: '12px',
                    border: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.15)', background: i === 0 ? '#10b981' : 'rgba(255,255,255,0.06)',
                    color: '#fff', cursor: 'pointer'
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 800, wordBreak: 'break-all', textAlign: 'left' }}>{value}</span>
                  <Check size={16} style={{ flexShrink: 0, opacity: i === 0 ? 1 : 0.5 }} />
                </button>
              ))}
            </div>
          </>
        )}

        {hasResult ? (
          <button
            type="button"
            onClick={resetResult}
            style={{ width: '100%', marginTop: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            <RotateCcw size={16} /> Escanear de nuevo
          </button>
        ) : mode === 'text' && !photoFallback ? (
          <button
            type="button"
            onClick={readTextFromCamera}
            disabled={!cameraReady || !!busy}
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', borderRadius: '14px', border: 'none', background: 'var(--primary-gradient)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: !cameraReady || busy ? 'not-allowed' : 'pointer', opacity: !cameraReady || busy ? 0.6 : 1 }}
          >
            <ScanText size={18} /> Leer
          </button>
        ) : !busy && !photoFallback ? (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.75rem' }}>Se lee automáticamente al detectar el código</div>
        ) : null}
      </div>
    </div>,
    document.body
  );
};
