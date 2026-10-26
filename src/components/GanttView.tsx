import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectTaskNode } from '../types/glpi';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface GanttViewProps {
  nodes: ProjectTaskNode[];
  onOpenTask: (taskId: number) => void;
}

type Zoom = 'day' | 'week' | 'month' | 'year';

// Día: escala de horas (26 px por hora). Semana: de días. Mes: de semanas. Año: de meses.
const PX_PER_DAY: Record<Zoom, number> = { day: 26 * 24, week: 44, month: 9, year: 2.2 };
const WORK_START = 8;   // horario laboral (las demás horas se sombrean en el zoom día)
const WORK_END = 19;
const ZOOM_LABEL: Record<Zoom, string> = { day: 'Día', week: 'Semana', month: 'Mes', year: 'Año' };
const DAY_MS = 86_400_000;
// Retraso de un hito: de la fecha prevista a hoy (pendiente) o a la fecha en que se concluyó
const DELAY_COLOR = '#eab308';
const formatDelay = (ms: number): string => {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 24) return `${Math.round(hours)} h`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours % 24);
  return rest && days < 3 ? `${days} d ${rest} h` : `${days} d`;
};
const NAME_W = 132;
const ROW_H = 40;
const HEADER_H = 46;

const toTime = (value?: string | null): number | null => {
  if (!value) return null;
  const t = new Date(value.replace(' ', 'T')).getTime();
  return isNaN(t) ? null : t;
};

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** Semana del mes (S1–S5) según su lunes: la semana que empieza el primer lunes del mes es la S1. */
const weekOfMonth = (monday: Date) => Math.ceil(monday.getDate() / 7);

interface Cell { label: string; left: number; width: number; muted?: boolean }

interface Row {
  node: ProjectTaskNode;
  level: number;
}

// Diagrama de Gantt del proyecto pensado para el teléfono: nombres fijos a la izquierda y la línea
// de tiempo deslizable. Las tareas con subtareas se dibujan como barra (previsto) con su avance y
// una línea de lo real; los hitos, como rombos en su inicio previsto.
export const GanttView: React.FC<GanttViewProps> = ({ nodes, onOpenTask }) => {
  const [zoom, setZoom] = useState<Zoom>('week');
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now] = useState<number>(() => Date.now());

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const walk = (list: ProjectTaskNode[], level: number) => list.forEach(node => {
      out.push({ node, level });
      if (node.children.length && !collapsed[node.id]) walk(node.children, level + 1);
    });
    walk(nodes, 0);
    return out;
  }, [nodes, collapsed]);

  // Rango de fechas: de lo más temprano a lo más tardío (incluye hoy), con un margen
  const range = useMemo(() => {
    const times: number[] = [now];
    const collect = (list: ProjectTaskNode[]) => list.forEach(n => {
      [n.plan_start_date, n.plan_end_date, n.real_start_date, n.real_end_date].forEach(v => { const t = toTime(v); if (t) times.push(t); });
      collect(n.children);
    });
    collect(nodes);
    // Zoom año: los años completos (de enero a diciembre) para ver el proyecto en contexto
    const start = zoom === 'year'
      ? new Date(new Date(Math.min(...times)).getFullYear(), 0, 1).getTime()
      : startOfDay(Math.min(...times)) - 2 * DAY_MS;
    const end = zoom === 'year'
      ? new Date(new Date(Math.max(...times)).getFullYear() + 1, 0, 1).getTime()
      : startOfDay(Math.max(...times)) + 4 * DAY_MS;
    return { start, end, days: Math.round((end - start) / DAY_MS) };
  }, [nodes, now, zoom]);

  const px = PX_PER_DAY[zoom];
  const width = range.days * px;
  const x = (t: number) => ((t - range.start) / DAY_MS) * px;
  const todayX = x(now);
  // Etiqueta "HOY": en semana ocupa la casilla de hoy, en año la del mes actual; en día y mes, la hora exacta
  const today = new Date(now);
  const badgeX = zoom === 'week'
    ? x(startOfDay(now)) + px / 2
    : zoom === 'year'
      ? (x(new Date(today.getFullYear(), today.getMonth(), 1).getTime()) + x(new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime())) / 2
      : todayX;

  // Al abrir y al cambiar el zoom, se muestra el día de hoy
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, todayX - (el.clientWidth - NAME_W) / 3);
  }, [zoom, todayX]);

  // Encabezado y fondo según el zoom:
  //   Día    → arriba el día, abajo las horas; se sombrea fuera del horario laboral y los fines de semana
  //   Semana → arriba el mes, abajo los días (19, 20, 21…); se sombrean los fines de semana
  //   Mes    → arriba el mes, abajo las semanas del mes (S1, S2…)
  //   Año    → arriba el año, abajo los meses (Ene, Feb…)
  const header = useMemo(() => {
    const top: Cell[] = [];
    const ticks: Cell[] = [];
    const shades: { left: number; width: number }[] = [];
    const lines: number[] = [];
    // La etiqueta que quedaría debajo de "HOY" se omite
    const clearOfToday = (cell: Cell) => (zoom === 'week' || zoom === 'year'
      ? Math.abs(cell.left + cell.width / 2 - badgeX) > 1
      : cell.left + cell.width < badgeX - 17 || cell.left > badgeX + 17);
    for (let i = 0; i < range.days; i++) {
      const day = new Date(range.start + i * DAY_MS);
      const left = i * px;
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      if (zoom === 'day') {
        top.push({ label: capitalize(day.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')), left, width: px });
        lines.push(left);
        const hourW = px / 24;
        for (let h = 0; h < 24; h++) {
          const cell = { label: String(h), left: left + h * hourW, width: hourW, muted: weekend || h < WORK_START || h >= WORK_END };
          if (clearOfToday(cell)) ticks.push(cell);
        }
        if (weekend) shades.push({ left, width: px });
        else {
          shades.push({ left, width: WORK_START * hourW });
          shades.push({ left: left + WORK_END * hourW, width: (24 - WORK_END) * hourW });
        }
        continue;
      }
      if (zoom === 'year') {
        if (i === 0 || (day.getMonth() === 0 && day.getDate() === 1)) top.push({ label: String(day.getFullYear()), left, width: 0 });
        if (day.getDate() === 1) {
          const monthDays = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
          const cell = { label: capitalize(day.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')), left, width: monthDays * px };
          if (clearOfToday(cell)) ticks.push(cell);
          lines.push(left);
        }
        continue;
      }
      if (i === 0 || day.getDate() === 1) {
        const name = day.toLocaleDateString('es-MX', { month: zoom === 'month' ? 'short' : 'long' }).replace('.', '');
        top.push({ label: `${capitalize(name)} ${day.getFullYear()}`, left, width: 0 });
      }
      if (zoom === 'week') {
        const cell = { label: String(day.getDate()), left, width: px, muted: weekend };
        if (clearOfToday(cell)) ticks.push(cell);
        if (weekend) shades.push({ left, width: px });
      } else if (day.getDay() === 1 || i === 0) {
        // Si el rango no empieza en lunes, la primera semana se nombra por su lunes y es más corta
        const daysToMonday = (8 - day.getDay()) % 7 || 7;
        const monday = new Date(day.getTime() - ((day.getDay() + 6) % 7) * DAY_MS);
        const cell = { label: `S${weekOfMonth(monday)}`, left, width: (day.getDay() === 1 ? 7 : daysToMonday) * px };
        if (clearOfToday(cell)) ticks.push(cell);
        lines.push(left);
      }
    }
    if (zoom !== 'day') top.forEach((m, i) => { m.width = (top[i + 1]?.left ?? width) - m.left; });
    return { top, ticks, shades, lines };
  }, [range, px, zoom, width, badgeX]);

  const toggle = (id: number) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  // Colapsar: solo las tareas principales; expandir: todos los niveles
  const collapseAll = () => {
    const next: Record<number, boolean> = {};
    const walk = (list: ProjectTaskNode[]) => list.forEach(n => { if (n.children.length) { next[n.id] = true; walk(n.children); } });
    walk(nodes);
    setCollapsed(next);
  };
  const expandAll = () => setCollapsed({});

  const smallButton: React.CSSProperties = {
    padding: '4px 8px', fontSize: '0.72rem', fontWeight: 700, border: '1px solid var(--border-color)',
    borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-muted)', cursor: 'pointer'
  };

  const bodyHeight = rows.length * ROW_H;

  const renderBar = (node: ProjectTaskNode) => {
    const isParent = node.children.length > 0;
    const done = node.percent_done >= 100;
    if (!isParent) {
      // Hito: rombo hueco en la fecha prevista; si se pasa de ella, línea amarilla del retraso hasta
      // hoy (pendiente) o hasta que se concluyó (rombo verde en la fecha real, el retraso queda marcado)
      const plan = toTime(node.plan_start_date);
      const real = done ? toTime(node.real_start_date) : null;
      if (plan === null && real === null) return <span style={{ position: 'absolute', left: 8, top: 12, fontSize: '0.68rem', color: 'var(--text-muted)' }}>sin fecha</span>;
      const delayEnd = done ? real : now;
      const delay = plan !== null && delayEnd !== null && delayEnd > plan ? delayEnd - plan : 0;
      const late = !done && delay > 0;
      const diamond = (t: number, color: string, filled: boolean, title: string) => (
        <span
          title={title}
          style={{
            position: 'absolute', left: x(t) - 7, top: ROW_H / 2 - 7, width: 14, height: 14, transform: 'rotate(45deg)',
            borderRadius: 3, background: filled ? color : 'var(--card-bg)', border: `3px solid ${color}`, boxSizing: 'border-box'
          }}
        />
      );
      const labelX = x((delay ? delayEnd : real ?? plan)!) + 12;
      return (
        <>
          {delay > 0 && (
            <span style={{ position: 'absolute', left: x(plan!), top: ROW_H / 2 - 2, width: Math.max(2, x(delayEnd!) - x(plan!)), height: 4, borderRadius: 2, background: DELAY_COLOR }} />
          )}
          {plan !== null && diamond(plan, done ? '#10b981' : late ? DELAY_COLOR : 'var(--brand-amber)', false, `${node.name} · previsto`)}
          {real !== null && diamond(real, '#10b981', true, `${node.name} · concluido`)}
          {delay > 0 && (
            <span style={{ position: 'absolute', left: labelX, top: ROW_H / 2 - 8, fontSize: '0.66rem', fontWeight: 800, color: 'var(--delay-text)', whiteSpace: 'nowrap' }}>
              +{formatDelay(delay)}
            </span>
          )}
        </>
      );
    }
    const s = toTime(node.plan_start_date);
    const e = toTime(node.plan_end_date) ?? s;
    if (s === null || e === null) return <span style={{ position: 'absolute', left: 8, top: 12, fontSize: '0.68rem', color: 'var(--text-muted)' }}>sin fechas</span>;
    const left = x(s);
    const barW = Math.max(8, x(e) - left);
    const rs = toTime(node.real_start_date);
    const re = toTime(node.real_end_date) ?? (rs !== null && !done ? now : null);
    return (
      <>
        <span
          title={`${node.name} · ${node.percent_done}%`}
          style={{
            position: 'absolute', left, top: ROW_H / 2 - 9, width: barW, height: 14, borderRadius: 7, overflow: 'hidden',
            background: 'var(--gantt-bar)', border: '1px solid var(--border-color)', boxSizing: 'border-box'
          }}
        >
          <span style={{ display: 'block', width: `${node.percent_done}%`, height: '100%', background: done ? '#10b981' : 'var(--primary-gradient)' }} />
        </span>
        {rs !== null && re !== null && (
          <span style={{ position: 'absolute', left: x(rs), top: ROW_H / 2 + 8, width: Math.max(3, x(re) - x(rs)), height: 3, borderRadius: 2, background: '#10b981' }} />
        )}
        {barW > 44 && (
          <span style={{ position: 'absolute', left: left + barW + 6, top: ROW_H / 2 - 9, fontSize: '0.66rem', fontWeight: 800, color: done ? '#059669' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {node.percent_done}%
          </span>
        )}
      </>
    );
  };

  return (
    <div>
      {/* Zoom y expandir/colapsar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
      <div style={{ display: 'flex', gap: '4px', padding: '4px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '12px', width: 'fit-content' }}>
        {(Object.keys(ZOOM_LABEL) as Zoom[]).map(z => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            aria-pressed={zoom === z}
            style={{
              padding: '6px 12px', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem',
              background: zoom === z ? 'var(--card-bg)' : 'transparent', boxShadow: zoom === z ? 'var(--shadow-sm)' : 'none',
              color: zoom === z ? 'var(--primary)' : 'var(--text-muted)'
            }}
          >
            {ZOOM_LABEL[z]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
        <button type="button" onClick={expandAll} style={smallButton}>Expandir</button>
        <button type="button" onClick={collapseAll} style={smallButton}>Colapsar</button>
      </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          position: 'relative', overflow: 'auto', maxHeight: '62dvh', borderRadius: '16px', border: '1px solid var(--border-color)',
          background: 'var(--card-bg)', overscrollBehavior: 'contain'
        }}
      >
        <div style={{ position: 'relative', width: NAME_W + width, minHeight: HEADER_H + bodyHeight }}>
          {/* Encabezado (fijo arriba) */}
          <div style={{ position: 'sticky', top: 0, zIndex: 3, display: 'flex', height: HEADER_H, background: 'var(--card-bg)', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ position: 'sticky', left: 0, zIndex: 4, width: NAME_W, flexShrink: 0, display: 'flex', alignItems: 'flex-end', padding: '0 10px 6px', background: 'var(--card-bg)', borderRight: '1px solid var(--border-color)', fontSize: '0.66rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Tarea
            </div>
            <div style={{ position: 'relative', width, flexShrink: 0 }}>
              <div style={{ display: 'flex', height: 22 }}>
                {header.top.map(m => (
                  <div key={m.left} style={{ width: m.width, flexShrink: 0, boxSizing: 'border-box', borderLeft: '1px solid var(--border-color)' }}>
                    {/* El nombre del día o mes se queda a la vista mientras se desliza */}
                    <span style={{ position: 'sticky', left: NAME_W, display: 'inline-block', padding: '4px 6px', fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', }}>
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
              {header.ticks.map(t => (
                <div key={t.left} style={{ position: 'absolute', left: t.left, top: 22, width: t.width, height: HEADER_H - 22, display: 'flex', alignItems: 'center', justifyContent: zoom === 'month' ? 'flex-start' : 'center', paddingLeft: zoom === 'month' ? 6 : 0, boxSizing: 'border-box', fontSize: zoom === 'day' ? '0.6rem' : '0.66rem', fontWeight: 700, color: t.muted ? 'var(--text-muted)' : 'var(--text-main)', opacity: t.muted ? 0.65 : 1, whiteSpace: 'nowrap' }}>
                  {t.label}
                </div>
              ))}
              {/* Abajo del encabezado, donde va el día o la semana (la etiqueta que tapaba se omite) */}
              <div style={{ position: 'absolute', left: badgeX - 16, bottom: 3, width: 32, textAlign: 'center', fontSize: '0.58rem', fontWeight: 800, color: 'var(--brand-graphite)', background: 'var(--brand-amber)', borderRadius: 6, zIndex: 1 }}>HOY</div>
            </div>
          </div>

          {/* Fondo de la línea de tiempo: fines de semana y línea de hoy */}
          <div aria-hidden="true" style={{ position: 'absolute', left: NAME_W, top: HEADER_H, width, height: bodyHeight, pointerEvents: 'none' }}>
            {header.shades.map(sh => (
              <div key={sh.left} style={{ position: 'absolute', left: sh.left, top: 0, width: sh.width, height: '100%', background: 'var(--gantt-weekend)' }} />
            ))}
            {header.lines.map(left => (
              <div key={left} style={{ position: 'absolute', left, top: 0, width: 1, height: '100%', background: 'var(--border-color)' }} />
            ))}
            <div style={{ position: 'absolute', left: todayX - 1, top: 0, width: 2, height: '100%', background: 'var(--brand-amber)', opacity: 0.85 }} />
          </div>

          {/* Filas */}
          {rows.map(({ node, level }) => {
            const isParent = node.children.length > 0;
            const done = node.percent_done >= 100;
            return (
              <div key={node.id} style={{ position: 'relative', display: 'flex', height: ROW_H, borderBottom: '1px solid var(--gantt-row-line)' }}>
                <div style={{ position: 'sticky', left: 0, zIndex: 2, width: NAME_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, paddingLeft: 4 + level * 10, paddingRight: 6, boxSizing: 'border-box', background: 'var(--card-bg)', borderRight: '1px solid var(--border-color)' }}>
                  {isParent ? (
                    <button type="button" onClick={() => toggle(node.id)} aria-label={collapsed[node.id] ? `Mostrar subtareas de ${node.name}` : `Ocultar subtareas de ${node.name}`} style={{ display: 'flex', padding: 2, border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
                      {collapsed[node.id] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                  ) : <span style={{ width: 18, flexShrink: 0 }} />}
                  <button
                    type="button"
                    onClick={() => onOpenTask(node.id)}
                    style={{
                      flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer',
                      fontSize: '0.72rem', lineHeight: 1.2, fontWeight: isParent ? 800 : 600,
                      color: done ? '#059669' : 'var(--text-main)',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                    }}
                  >
                    {node.name}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenTask(node.id)}
                  aria-label={`Abrir ${node.name}`}
                  style={{ position: 'relative', width, flexShrink: 0, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                >
                  {renderBar(node)}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: '10px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 22, height: 10, borderRadius: 5, background: 'var(--gantt-bar)', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'inline-flex' }}><span style={{ width: '55%', background: 'var(--primary-gradient)' }} /></span>Previsto y avance</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 22, height: 3, borderRadius: 2, background: '#10b981' }} />Real</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, transform: 'rotate(45deg)', borderRadius: 2, border: '2.5px solid var(--brand-amber)', boxSizing: 'border-box' }} />Hito previsto</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, transform: 'rotate(45deg)', borderRadius: 2, background: '#10b981' }} />Concluido</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 22, height: 4, borderRadius: 2, background: DELAY_COLOR }} />Retraso</span>
      </div>
    </div>
  );
};
