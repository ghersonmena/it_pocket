import React, { useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface SwipeToCompleteProps {
  enabled: boolean;
  onComplete: () => void;
  children: React.ReactNode;
}

// Distancia mínima para distinguir el deslizamiento de un toque o de un scroll vertical
const START_PX = 10;

// Deslizar la fila hacia la derecha para concluir el hito. El scroll vertical sigue funcionando
// (touch-action: pan-y) y el toque que termina un deslizamiento no abre la fila.
export const SwipeToComplete: React.FC<SwipeToCompleteProps> = ({ enabled, onComplete, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; dragging: boolean; cancelled: boolean } | null>(null);
  const swallowClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  const threshold = () => Math.min(140, (ref.current?.offsetWidth || 300) * 0.4);
  const armed = offset >= threshold();

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    gesture.current = { x: e.clientX, y: e.clientY, dragging: false, cancelled: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.cancelled) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.dragging) {
      if (Math.abs(dy) > START_PX && Math.abs(dy) > Math.abs(dx)) { g.cancelled = true; return; }
      if (dx < START_PX || dx < Math.abs(dy) * 1.5) return;
      g.dragging = true;
      setAnimating(false);
      ref.current?.setPointerCapture(e.pointerId);
    }
    const width = ref.current?.offsetWidth || 300;
    const next = Math.max(0, Math.min(width, dx));
    const t = threshold();
    if (offset < t && next >= t) navigator.vibrate?.(12);
    setOffset(next);
  };

  const finish = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.dragging) return;
    swallowClick.current = true;
    setAnimating(true);
    if (offset >= threshold()) {
      setOffset(ref.current?.offsetWidth || 300);
      setTimeout(() => { onComplete(); setOffset(0); }, 180);
    } else {
      setOffset(0);
    }
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={e => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', touchAction: enabled ? 'pan-y' : undefined }}
    >
      {offset > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '16px',
            background: armed ? '#10b981' : '#6ee7b7', color: armed ? '#fff' : '#065f46', fontWeight: 800, fontSize: '0.8rem',
            transition: 'background 0.15s ease'
          }}
        >
          <CheckCircle2 size={18} /> {armed ? 'Suelta para concluir' : 'Concluir hito'}
        </div>
      )}
      <div style={{ transform: `translateX(${offset}px)`, transition: animating ? 'transform 0.18s ease' : 'none' }}>
        {children}
      </div>
    </div>
  );
};
