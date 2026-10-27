import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GLPISession, ProjectTaskNode, TaskParticipant, ProjectCatalogOption } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { ProjectTaskService } from '../services/projectTaskService';
import { CheckCircle2, ArrowRightLeft, RefreshCw, User as UserIcon, Users as UsersIcon, CalendarClock } from 'lucide-react';

interface KanbanViewProps {
  session: GLPISession;
  nodes: ProjectTaskNode[];
  participants?: Record<number, TaskParticipant[]>; // undefined mientras se cargan
  updatingTaskId: number | null;
  onOpenTask: (taskId: number) => void;
  onComplete: (node: ProjectTaskNode) => void;
  onMoveState: (node: ProjectTaskNode, stateId: number) => void;
}

type Criterion = 'state' | 'date' | 'people' | 'parent';

const CRITERIA: [Criterion, string][] = [['state', 'Estado'], ['date', 'Fechas'], ['people', 'Responsables'], ['parent', 'Tarea']];

// Tarjetas visibles por columna antes de "Mostrar más" (un proyecto puede tener cientos de hitos)
const PAGE = 25;
const DAY_MS = 86_400_000;
const DELAY_COLOR = '#eab308';

// Nombres de los estados por defecto de GLPI
const STATE_NAMES: Record<string, string> = { New: 'Nuevo', Processing: 'En proceso', Closed: 'Concluido' };

interface Card {
  node: ProjectTaskNode;
  parentName: string;
  done: boolean;
}

interface Column {
  key: string;
  label: string;
  color: string;
  cards: Card[];
  // En la vista por estado: a qué estado se mueve una tarjeta al soltarla aquí (0 = concluir)
  stateId?: number;
}

const toTime = (value?: string | null): number | null => {
  if (!value) return null;
  const t = new Date(value.replace(' ', 'T')).getTime();
  return isNaN(t) ? null : t;
};

const shortDate = (t: number) =>
  new Date(t).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Pendientes arriba y concluidos al final (sort estable: se respeta el orden del árbol)
const pendingFirst = (cols: Column[]): Column[] => {
  cols.forEach(col => col.cards.sort((a, b) => Number(a.done) - Number(b.done)));
  return cols;
};

// Arrastrar tarjetas: mantener presionado (táctil) o mover el mouse unos píxeles para tomarla
const HOLD_MS = 350;
const MOVE_TOLERANCE = 8;
const EDGE = 48; // orilla del tablero o de la pantalla que activa el desplazamiento automático
const SCROLL_SPEED = 14;

interface DragState {
  card: Card;
  from: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  over: string | null;
}

const formatDelay = (ms: number): string => {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 24) return `${Math.round(hours)} h`;
  return `${Math.floor(hours / 24)} d`;
};

// Tablero Kanban de los hitos del proyecto. Por defecto agrupa por estado (y permite moverlos de
// columna); también por fechas, responsables o tarea padre.
export const KanbanView: React.FC<KanbanViewProps> = ({
  session, nodes, participants, updatingTaskId, onOpenTask, onComplete, onMoveState
}) => {
  const [criterion, setCriterion] = useState<Criterion>('state');
  const [hideDone, setHideDone] = useState<boolean>(false);
  const [states, setStates] = useState<ProjectCatalogOption[]>([]);
  const [closedId, setClosedId] = useState<number>(3);
  const [newId, setNewId] = useState<number>(1);
  const [moving, setMoving] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [now] = useState<number>(() => Date.now());
  const [drag, setDrag] = useState<DragState | null>(null);
  // Concluir no se puede deshacer (fija la fecha real): al soltar en Concluido se confirma
  const [confirmDone, setConfirmDone] = useState<ProjectTaskNode | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const press = useRef<{ timer: number; x: number; y: number; card: Card; from: string; el: HTMLElement; mouse: boolean } | null>(null);
  const swallowClick = useRef(false);

  useEffect(() => {
    GLPIService.getOpenProjectStates(session).then(setStates).catch(() => { /* sin catálogo: solo se puede concluir */ });
    ProjectTaskService.getStateIds(session).then(ids => { setClosedId(ids.closedId); setNewId(ids.newId); }).catch(() => {});
  }, [session]);

  // Hitos (hojas del árbol) con el nombre de su tarea padre, en el orden del árbol
  const cards = useMemo(() => {
    const list: Card[] = [];
    const walk = (items: ProjectTaskNode[], parentName: string) => items.forEach(n => {
      if (n.children.length) walk(n.children, n.name);
      else list.push({ node: n, parentName, done: n.percent_done >= 100 || n.projectstates_id === closedId });
    });
    walk(nodes, '');
    return list;
  }, [nodes, closedId]);

  const columns = useMemo((): Column[] => {
    const visible = hideDone ? cards.filter(c => !c.done) : cards;
    if (criterion === 'state') {
      const stateColor = (label: string, i: number) => (label === 'New' ? '#64748b' : label === 'Processing' ? 'var(--brand-amber)' : ['#3b82f6', '#8b5cf6', '#ec4899'][i % 3]);
      const cols: Column[] = (states.length ? states : [{ id: newId, label: 'New' }]).map((s, i) => ({
        key: `s${s.id}`, label: STATE_NAMES[s.label] || s.label, color: stateColor(s.label, i), cards: [], stateId: s.id
      }));
      const done: Column = { key: 'done', label: 'Concluido', color: '#10b981', cards: [], stateId: 0 };
      visible.forEach(c => {
        if (c.done) { done.cards.push(c); return; }
        // Sin estado (0) cuenta como Nuevo
        const col = cols.find(col => col.stateId === (c.node.projectstates_id || newId)) || cols[0];
        col.cards.push(c);
      });
      return hideDone ? cols : [...cols, done];
    }
    if (criterion === 'date') {
      const startOfToday = new Date(now).setHours(0, 0, 0, 0);
      const cols: Column[] = [
        { key: 'late', label: 'Atrasados', color: DELAY_COLOR, cards: [] },
        { key: 'today', label: 'Hoy', color: 'var(--brand-amber)', cards: [] },
        { key: 'week', label: 'Próximos 7 días', color: '#3b82f6', cards: [] },
        { key: 'later', label: 'Más adelante', color: '#8b5cf6', cards: [] },
        { key: 'none', label: 'Sin fecha', color: '#94a3b8', cards: [] },
        { key: 'done', label: 'Concluidos', color: '#10b981', cards: [] }
      ];
      const byKey = Object.fromEntries(cols.map(c => [c.key, c]));
      visible.forEach(c => {
        const t = toTime(c.node.plan_start_date);
        const key = c.done ? 'done'
          : t === null ? 'none'
          : t < now ? 'late'
          : t < startOfToday + DAY_MS ? 'today'
          : t < startOfToday + 8 * DAY_MS ? 'week' : 'later';
        byKey[key].cards.push(c);
      });
      // Pendientes por fecha (lo más urgente arriba); concluidos del más reciente al más antiguo
      const plan = (c: Card) => toTime(c.node.plan_start_date) ?? Infinity;
      cols.forEach(col => col.cards.sort(col.key === 'done'
        ? (a, b) => (toTime(b.node.real_start_date) ?? 0) - (toTime(a.node.real_start_date) ?? 0)
        : (a, b) => plan(a) - plan(b)));
      return cols.filter(col => col.cards.length || ['late', 'today', 'week'].includes(col.key));
    }
    if (criterion === 'people') {
      const map = new Map<string, Column>();
      const none: Column = { key: 'none', label: 'Sin asignar', color: '#94a3b8', cards: [] };
      visible.forEach(c => {
        const team = participants?.[c.node.id] || [];
        if (!team.length) { none.cards.push(c); return; }
        // Un hito con varios responsables aparece en la columna de cada uno
        team.forEach(p => {
          const key = `${p.itemtype}-${p.id}`;
          if (!map.has(key)) map.set(key, { key, label: p.name, color: p.itemtype === 'User' ? 'var(--brand-amber)' : '#8b5cf6', cards: [] });
          map.get(key)!.cards.push(c);
        });
      });
      const cols = [...map.values()].sort((a, b) => b.cards.length - a.cards.length || a.label.localeCompare(b.label, 'es'));
      return pendingFirst(none.cards.length ? [...cols, none] : cols);
    }
    // Por tarea padre, en el orden del árbol
    const map = new Map<string, Column>();
    visible.forEach(c => {
      const key = `p${c.node.projecttasks_id || 0}`;
      if (!map.has(key)) map.set(key, { key, label: c.parentName || 'Sin tarea padre', color: 'var(--primary)', cards: [] });
      map.get(key)!.cards.push(c);
    });
    return pendingFirst([...map.values()]);
  }, [cards, criterion, hideDone, states, newId, now, participants]);

  // Lo último de columnas y acciones, para usarlo al soltar la tarjeta
  const columnsRef = useRef(columns);
  const actionsRef = useRef({ onComplete, onMoveState });
  useEffect(() => {
    columnsRef.current = columns;
    actionsRef.current = { onComplete, onMoveState };
  });

  const updateDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  // Columna bajo el dedo (la tarjeta flotante no recibe eventos, así que no estorba)
  const columnAt = (x: number, y: number): string | null =>
    (document.elementFromPoint(x, y)?.closest('[data-col]') as HTMLElement | null)?.dataset.col ?? null;

  const startDrag = (x: number, y: number) => {
    const p = press.current;
    if (!p) return;
    const rect = p.el.getBoundingClientRect();
    navigator.vibrate?.(15);
    setMoving(null);
    updateDrag({ card: p.card, from: p.from, x, y, dx: x - rect.left, dy: y - rect.top, width: rect.width, over: p.from });
  };

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  // Mientras se arrastra: seguir el dedo, desplazar el tablero en las orillas y soltar
  useEffect(() => {
    if (!drag) return;
    let frame = 0;
    const autoScroll = () => {
      const d = dragRef.current;
      const board = boardRef.current;
      if (d && board) {
        const r = board.getBoundingClientRect();
        if (d.x < r.left + EDGE) board.scrollLeft -= SCROLL_SPEED;
        else if (d.x > r.right - EDGE) board.scrollLeft += SCROLL_SPEED;
        const page = document.querySelector('.app-content');
        if (page) {
          if (d.y < 150) page.scrollTop -= SCROLL_SPEED;
          else if (d.y > window.innerHeight - 90) page.scrollTop += SCROLL_SPEED;
        }
        const over = columnAt(d.x, d.y);
        if (over !== d.over) updateDrag({ ...d, over });
      }
      frame = requestAnimationFrame(autoScroll);
    };
    frame = requestAnimationFrame(autoScroll);

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d) updateDrag({ ...d, x: e.clientX, y: e.clientY, over: columnAt(e.clientX, e.clientY) });
    };
    const onUp = () => {
      const d = dragRef.current;
      updateDrag(null);
      press.current = null;
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 400);
      if (!d || !d.over || d.over === d.from) return;
      const target = columnsRef.current.find(c => c.key === d.over);
      if (!target || target.stateId === undefined) return;
      if (target.stateId === 0) setConfirmDone(d.card.node);
      else actionsRef.current.onMoveState(d.card.node, target.stateId);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // El navegador decide al tocar si el gesto hará scroll: un listener no pasivo permanente en el
  // tablero permite cancelar el scroll una vez que la tarjeta se tomó
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const block = (e: TouchEvent) => { if (dragRef.current) e.preventDefault(); };
    board.addEventListener('touchmove', block, { passive: false });
    return () => board.removeEventListener('touchmove', block);
  }, [columns.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem', whiteSpace: 'nowrap',
    background: active ? 'var(--card-bg)' : 'transparent', boxShadow: active ? 'var(--shadow-sm)' : 'none',
    color: active ? 'var(--primary)' : 'var(--text-muted)'
  });

  const renderCard = (card: Card, column: Column) => {
    const { node, done } = card;
    const plan = toTime(node.plan_start_date);
    const real = toTime(node.real_start_date);
    const delay = plan !== null ? (done ? (real ?? plan) : now) - plan : 0;
    const team = participants?.[node.id] || [];
    const busy = updatingTaskId === node.id;
    const isMoving = moving === node.id;
    const targets = criterion === 'state' && !done
      ? columns.filter(c => c.key !== column.key && c.stateId !== undefined)
      : [];
    const draggable = targets.length > 0 && !busy;
    const isDragged = drag?.card.node.id === node.id;

    return (
      <div
        key={`${column.key}-${node.id}`}
        role="button"
        tabIndex={0}
        onClick={() => { if (!swallowClick.current) onOpenTask(node.id); }}
        onKeyDown={e => { if (e.key === 'Enter') onOpenTask(node.id); }}
        onContextMenu={draggable ? e => e.preventDefault() : undefined}
        onPointerDown={draggable ? e => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if ((e.target as HTMLElement).closest('button')) return;
          const mouse = e.pointerType === 'mouse';
          cancelPress();
          press.current = {
            x: e.clientX, y: e.clientY, card, from: column.key, el: e.currentTarget, mouse,
            timer: mouse ? 0 : window.setTimeout(() => startDrag(press.current!.x, press.current!.y), HOLD_MS)
          };
        } : undefined}
        onPointerMove={draggable ? e => {
          const p = press.current;
          if (!p || dragRef.current) return;
          const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE;
          if (p.mouse) { if (moved) startDrag(e.clientX, e.clientY); }
          else if (moved) cancelPress(); // se movió antes de tiempo: es un scroll
        } : undefined}
        onPointerUp={draggable ? () => { if (!dragRef.current) cancelPress(); } : undefined}
        onPointerCancel={draggable ? () => { if (!dragRef.current) cancelPress(); } : undefined}
        style={{
          background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderLeft: `3px solid ${done ? '#10b981' : delay > 0 ? DELAY_COLOR : 'var(--border-color)'}`,
          borderRadius: '12px', padding: '10px 11px', cursor: draggable ? 'grab' : 'pointer', boxShadow: 'var(--shadow-sm)',
          opacity: isDragged ? 0.35 : done && criterion !== 'state' ? 0.75 : 1,
          userSelect: draggable ? 'none' : undefined, WebkitUserSelect: draggable ? 'none' : undefined, WebkitTouchCallout: draggable ? 'none' : undefined
        } as React.CSSProperties}
      >
        {criterion !== 'parent' && card.parentName && (
          <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.parentName}
          </div>
        )}
        <div style={{
          fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.3, color: done ? '#059669' : 'var(--text-main)', overflowWrap: 'anywhere',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>
          {node.name}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '7px', fontSize: '0.7rem', fontWeight: 700 }}>
          {done ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#059669' }}>
              <CheckCircle2 size={12} /> {real !== null ? shortDate(real) : 'Concluido'}
            </span>
          ) : plan !== null ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <CalendarClock size={12} /> {shortDate(plan)}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 600 }}>Sin fecha prevista</span>
          )}
          {delay > 0 && (
            <span style={{ padding: '1px 6px', borderRadius: 6, background: 'rgba(234, 179, 8, 0.16)', color: 'var(--delay-text)' }}>
              +{formatDelay(delay)}
            </span>
          )}
        </div>

        {criterion !== 'people' && team.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: '5px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', overflow: 'hidden' }}>
            {team.some(p => p.itemtype !== 'User') ? <UsersIcon size={12} style={{ flexShrink: 0 }} /> : <UserIcon size={12} style={{ flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.map(p => p.name).join(', ')}</span>
          </div>
        )}

        {/* Mover de columna (vista por estado) */}
        {targets.length > 0 && (
          <div style={{ marginTop: '8px' }} onClick={e => e.stopPropagation()}>
            {busy ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                <RefreshCw size={12} className="spin" /> Guardando…
              </span>
            ) : isMoving ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {targets.map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setMoving(null);
                      if (t.stateId === 0) onComplete(node);
                      else onMoveState(node, t.stateId!);
                    }}
                    style={{
                      padding: '5px 9px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${t.stateId === 0 ? '#10b981' : 'var(--border-color)'}`,
                      background: t.stateId === 0 ? '#10b981' : 'var(--card-bg)', color: t.stateId === 0 ? '#fff' : 'var(--text-main)'
                    }}
                  >
                    {t.stateId === 0 ? 'Concluir' : t.label}
                  </button>
                ))}
                <button type="button" onClick={() => setMoving(null)} style={{ padding: '5px 9px', border: 'none', background: 'none', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMoving(node.id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
              >
                <ArrowRightLeft size={12} /> Mover
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Criterio de agrupación */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '2px', padding: '4px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '12px', maxWidth: '100%', overflowX: 'auto' }}>
          {CRITERIA.map(([key, label]) => (
            <button key={key} type="button" onClick={() => { setCriterion(key); setMoving(null); }} aria-pressed={criterion === key} style={chip(criterion === key)}>
              {label}
            </button>
          ))}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />
          Ocultar concluidos
        </label>
      </div>
      {criterion === 'state' && (
        <div style={{ margin: '-2px 2px 10px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          Mantén presionada una tarjeta y arrástrala a otra columna para cambiar su estado.
        </div>
      )}

      {criterion === 'people' && !participants ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          <RefreshCw size={18} className="spin" style={{ marginBottom: 6 }} /><div>Cargando responsables…</div>
        </div>
      ) : columns.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No hay hitos para mostrar.
        </div>
      ) : (
        <div
          ref={boardRef}
          style={{
            // Sin "snap" mientras se arrastra: pelearía con el desplazamiento automático
            display: 'flex', gap: '10px', overflowX: 'auto', scrollSnapType: drag ? 'none' : 'x mandatory', overscrollBehaviorX: 'contain',
            paddingBottom: '8px', margin: '0 -4px', paddingLeft: '4px', paddingRight: '4px'
          }}
        >
          {columns.map(column => {
            const open = expanded[column.key];
            const shown = open ? column.cards : column.cards.slice(0, PAGE);
            const doneCount = column.cards.filter(c => c.done).length;
            const dropTarget = !!drag && drag.over === column.key && drag.from !== column.key && column.stateId !== undefined;
            return (
              <section
                key={column.key}
                aria-label={column.label}
                data-col={column.key}
                style={{
                  flex: '0 0 min(80%, 290px)', minWidth: 0, scrollSnapAlign: 'start',
                  background: dropTarget ? 'var(--primary-soft)' : 'var(--bg-main)',
                  border: dropTarget ? `2px dashed ${column.color}` : '1px solid var(--border-color)', transition: 'background 0.12s ease',
                  borderRadius: '16px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', alignSelf: 'flex-start'
                }}
              >
                <header style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 2px 4px', borderBottom: `3px solid ${column.color}` }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={column.label}>
                    {column.label}
                  </span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {criterion === 'people' || criterion === 'parent' ? `${doneCount}/${column.cards.length}` : column.cards.length}
                  </span>
                </header>
                {column.cards.length === 0 && (
                  <div style={{ padding: '14px 4px', textAlign: 'center', fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin hitos</div>
                )}
                {shown.map(card => renderCard(card, column))}
                {column.cards.length > PAGE && (
                  <button
                    type="button"
                    onClick={() => setExpanded(prev => ({ ...prev, [column.key]: !open }))}
                    style={{ padding: '7px', border: '1px dashed var(--border-color)', borderRadius: 10, background: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer' }}
                  >
                    {open ? 'Mostrar menos' : `Mostrar ${column.cards.length - PAGE} más`}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {confirmDone && createPortal(
        <div
          role="dialog"
          aria-label="Confirmar conclusión del hito"
          style={{
            position: 'fixed', left: 12, right: 12, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 3000,
            background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '14px',
            boxShadow: '0 14px 30px rgba(0, 0, 0, 0.25)', maxWidth: 480, margin: '0 auto'
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 4 }}>¿Concluir este hito?</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12, overflowWrap: 'anywhere' }}>
            {confirmDone.name} — se registra la fecha real y ya no se puede regresar a otro estado.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setConfirmDone(null)} style={{ flex: 1, padding: '9px', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => { const node = confirmDone; setConfirmDone(null); onComplete(node); }}
              style={{ flex: 1, padding: '9px', borderRadius: 12, border: 'none', background: '#10b981', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
            >
              Concluir
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Tarjeta que sigue al dedo */}
      {drag && createPortal(
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width, zIndex: 3000, pointerEvents: 'none',
            transform: 'rotate(2deg) scale(1.03)', background: 'var(--card-bg)', border: '1px solid var(--primary)', borderRadius: '12px',
            padding: '10px 11px', boxShadow: '0 14px 30px rgba(0, 0, 0, 0.25)'
          }}
        >
          {drag.card.parentName && (
            <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {drag.card.parentName}
            </div>
          )}
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>{drag.card.node.name}</div>
          <div style={{ marginTop: 6, fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary)' }}>
            {(() => {
              const target = drag.over && drag.over !== drag.from ? columns.find(c => c.key === drag.over) : null;
              return target && target.stateId !== undefined ? (target.stateId === 0 ? 'Soltar para concluir' : `Mover a ${target.label}`) : 'Arrastra a otra columna';
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
