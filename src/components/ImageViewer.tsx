import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight } from 'lucide-react';

export interface ViewerImage {
  src: string;
  alt?: string;
}

interface ImageViewerProps {
  // Una imagen (src/alt) o una galería (images + initialIndex)
  src?: string;
  alt?: string;
  images?: ViewerImage[];
  initialIndex?: number;
  onClose: () => void;
}

interface View { tx: number; ty: number; s: number }

const MAX_ZOOM = 6;
const DOUBLE_TAP_MS = 300;
const SWIPE_PX = 50; // desplazamiento horizontal para pasar a la siguiente imagen

// Visor de imagen a pantalla completa con zoom: pellizco, doble toque, rueda o botones,
// y arrastre para moverse por la imagen ampliada. Con varias imágenes es una galería: sin zoom,
// deslizar a la izquierda o a la derecha (o las flechas) pasa a la siguiente o a la anterior.
export const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt, images, initialIndex = 0, onClose }) => {
  const list: ViewerImage[] = images && images.length ? images : src ? [{ src, alt }] : [];
  const [index, setIndex] = useState<number>(Math.min(Math.max(initialIndex, 0), Math.max(list.length - 1, 0)));
  const current = list[index] || { src: '', alt: '' };
  const containerRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [fit, setFit] = useState<number>(1);
  const [view, setView] = useState<View>({ tx: 0, ty: 0, s: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const moved = useRef<number>(0);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback((step: number) => {
    setIndex(i => {
      const next = i + step;
      if (next < 0 || next >= list.length) return i;
      setNatural(null); // la nueva imagen se vuelve a encajar al cargar
      return next;
    });
  }, [list.length]);

  // Encajar la imagen completa en la pantalla
  const fitToScreen = useCallback(() => {
    const el = containerRef.current;
    if (!el || !natural) return;
    const f = Math.min(el.clientWidth / natural.w, el.clientHeight / natural.h, 1);
    setFit(f);
    setView({ s: f, tx: (el.clientWidth - natural.w * f) / 2, ty: (el.clientHeight - natural.h * f) / 2 });
  }, [natural]);

  useEffect(() => { fitToScreen(); }, [fitToScreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go]);

  // Zoom relativo a la imagen encajada en pantalla (100% = imagen completa visible). Máximo 6x
  // de eso, o 2x los píxeles reales si la imagen es pequeña
  const maxScale = Math.max(fit * MAX_ZOOM, 2);

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setView(v => {
      const s = Math.min(maxScale, Math.max(fit, v.s * factor));
      return { s, tx: cx - (cx - v.tx) * (s / v.s), ty: cy - (cy - v.ty) * (s / v.s) };
    });
  };

  const local = (x: number, y: number) => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    containerRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      moved.current = 0;
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current += Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (pinch.current) zoomAt(dist / pinch.current, mid.x, mid.y);
      pinch.current = dist;
      return;
    }
    setView(v => ({ ...v, tx: v.tx + (e.clientX - prev.x), ty: v.ty + (e.clientY - prev.y) }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const start = dragStart.current;
    if (pointers.current.size === 0) dragStart.current = null;
    // Galería: sin zoom, un deslizamiento horizontal cambia de imagen; si no, vuelve a su lugar
    if (pointers.current.size === 0 && moved.current > 10 && view.s <= fit * 1.05) {
      const dx = start ? e.clientX - start.x : 0;
      const dy = start ? e.clientY - start.y : 0;
      if (list.length > 1 && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      else fitToScreen();
      return;
    }
    if (pointers.current.size > 0 || moved.current > 10) return;
    // Doble toque: acercar a 2.5x de lo que se ve en ese punto, o volver a ver completa
    const now = Date.now();
    const last = lastTap.current;
    if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
      lastTap.current = null;
      const p = local(e.clientX, e.clientY);
      if (view.s > fit * 1.2) fitToScreen();
      else zoomAt((fit * 2.5) / view.s, p.x, p.y);
      return;
    }
    lastTap.current = { time: now, x: e.clientX, y: e.clientY };
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = local(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  };

  const center = (factor: number) => {
    const el = containerRef.current;
    if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  const percent = fit ? Math.round((view.s / fit) * 100) : 100;
  const buttonStyle: React.CSSProperties = {
    display: 'flex', padding: '10px', border: 'none', borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.15)', color: '#fff', cursor: 'pointer'
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.alt || 'Imagen'}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: '#0b0b0b', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        padding: 'calc(10px + env(safe-area-inset-top, 0px)) 12px 10px', color: '#e2e8f0'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, fontSize: '0.78rem', fontWeight: 700 }}>
          {list.length > 1 && <span style={{ flexShrink: 0, whiteSpace: 'nowrap', padding: '3px 9px', borderRadius: '999px', background: 'rgba(255, 255, 255, 0.15)' }}>{index + 1} / {list.length}</span>}
          <span style={{ flexShrink: 0 }}>{percent}%</span>
          {current.alt && <span style={{ fontWeight: 600, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.alt}</span>}
        </span>
        <button type="button" onClick={onClose} aria-label="Cerrar imagen" style={buttonStyle}>
          <X size={20} />
        </button>
      </div>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        style={{ position: 'relative', flex: 1, overflow: 'hidden', touchAction: 'none', cursor: view.s > fit ? 'grab' : 'zoom-in' }}
      >
        <img
          key={current.src}
          src={current.src}
          alt={current.alt || ''}
          draggable={false}
          onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{
            position: 'absolute', left: 0, top: 0, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none',
            width: natural?.w, height: natural?.h, visibility: natural ? 'visible' : 'hidden',
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: '0 0'
          }}
        />
        {list.length > 1 && index > 0 && (
          <button type="button" onClick={() => go(-1)} onPointerDown={e => e.stopPropagation()} aria-label="Imagen anterior"
            style={{ ...buttonStyle, position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0, 0, 0, 0.45)' }}>
            <ChevronLeft size={22} />
          </button>
        )}
        {list.length > 1 && index < list.length - 1 && (
          <button type="button" onClick={() => go(1)} onPointerDown={e => e.stopPropagation()} aria-label="Imagen siguiente"
            style={{ ...buttonStyle, position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0, 0, 0, 0.45)' }}>
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px',
        padding: '12px 12px calc(14px + env(safe-area-inset-bottom, 0px))'
      }}>
        <button type="button" onClick={() => center(1 / 1.4)} aria-label="Alejar" style={buttonStyle}><ZoomOut size={20} /></button>
        <button type="button" onClick={fitToScreen} aria-label="Ver completa" style={buttonStyle}><Maximize size={18} /></button>
        <button type="button" onClick={() => center(1.4)} aria-label="Acercar" style={buttonStyle}><ZoomIn size={20} /></button>
      </div>
    </div>,
    document.body
  );
};
