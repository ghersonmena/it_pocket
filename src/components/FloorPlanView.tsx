import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { GLPISession } from '../types/glpi';
import { FloorPlanService } from '../services/floorPlanService';
import type { FloorPlan, FloorMarker, LocationNode, PlanPermissions } from '../services/floorPlanService';
import { isPdf, getPdfPageCount, renderPdfPage } from '../services/pdfRender';
import { AssetService, getAssetType } from '../services/assetService';
import type { AssetSummary } from '../services/assetService';
import { GLPIService } from '../services/glpiService';
import { SearchSelect } from './SearchSelect';
import {
  ArrowLeft, RefreshCw, Map as MapIcon, Pencil, Eye, Save, Trash2, ZoomIn, ZoomOut, Maximize,
  Upload, MapPin, ChevronRight, X, CheckCircle2, ImageUp, FileText, Trash
} from 'lucide-react';

interface FloorPlanViewProps {
  session: GLPISession;
  locationId: number | null;     // piso/área del croquis; null = elegir
  focusLocationId?: number | null; // ubicación a resaltar (p. ej. la del activo)
  backLabel: string;
  onBack: () => void;
  // Sin esta función (p. ej. desde un proyecto) los activos de cada marca solo se listan
  onOpenAsset?: (itemtype: string, id: number, fromName: string) => void;
}

interface View { tx: number; ty: number; s: number }

const MAX_ZOOM = 8;
const TAP_SLOP_PX = 8;
const shortName = (node?: LocationNode) => node?.name || '';

// Croquis de un piso: visor con zoom/arrastre y editor de marcas (ubicación → punto en la imagen)
export const FloorPlanView: React.FC<FloorPlanViewProps> = ({ session, locationId, focusLocationId, backLabel, onBack, onOpenAsset }) => {
  const [locations, setLocations] = useState<LocationNode[]>([]);
  const [floorId, setFloorId] = useState<number | null>(locationId);
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [planLoaded, setPlanLoaded] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [markers, setMarkers] = useState<FloorMarker[]>([]);
  const [existingPlans, setExistingPlans] = useState<{ locationId: number; name: string }[]>([]);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [selected, setSelected] = useState<number | null>(focusLocationId ?? null);
  const [placing, setPlacing] = useState<number>(0);
  const [view, setView] = useState<View>({ tx: 0, ty: 0, s: 1 });
  const [fit, setFit] = useState<number>(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assetsHere, setAssetsHere] = useState<(AssetSummary & { itemtype: string })[] | null>(null);
  // Permisos del perfil en GLPI: sin ellos el croquis solo se consulta
  const [perms, setPerms] = useState<PlanPermissions>({ canUpload: false, canEdit: false, canDelete: false });
  // PDF con varias páginas: se pregunta cuál es el croquis
  const [pdfChoice, setPdfChoice] = useState<{ pages: number; resolve: (page: number | null) => void } | null>(null);
  const uploadKind = useRef<'create' | 'replace'>('create');

  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; moved: number; pinchDist?: number; dragMarker?: number } | null>(null);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  const byId = new Map(locations.map(l => [l.id, l]));
  const floor = floorId ? byId.get(floorId) : undefined;
  const dirty = plan ? JSON.stringify(markers) !== JSON.stringify(plan.markers) : false;

  // Ubicaciones y croquis existentes
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      FloorPlanService.getLocations(session),
      FloorPlanService.listPlans(session).catch(() => []),
      FloorPlanService.getPermissions(session)
    ])
      .then(([locs, plans, permissions]) => {
        if (cancelled) return;
        setLocations(locs);
        setPerms(permissions);
        setExistingPlans(plans.map(p => ({ locationId: p.locationId, name: p.name })));
      })
      .catch(err => { if (!cancelled) setError(err.message || 'No se pudieron cargar las ubicaciones.'); });
    return () => { cancelled = true; };
  }, [session]);

  // Croquis del piso elegido (+ imagen)
  useEffect(() => {
    if (!floorId) return;
    let cancelled = false;
    let url: string | null = null;
    FloorPlanService.getPlan(session, floorId)
      .then(async p => {
        if (cancelled) return;
        setPlan(p);
        setMarkers(p ? p.markers : []);
        setPlanLoaded(true);
        if (p) {
          url = await FloorPlanService.getImageUrl(session, p);
          if (!cancelled) setImageUrl(url);
        }
      })
      .catch(err => { if (!cancelled) { setError(err.message || 'No se pudo cargar el croquis.'); setPlanLoaded(true); } });
    return () => { cancelled = true; if (url && !session.isMock) URL.revokeObjectURL(url); };
  }, [session, floorId]);

  // Encajar la imagen en el visor y, si hay una ubicación a resaltar, acercarse a ella
  const fitToView = useCallback((focusMarker?: FloorMarker) => {
    const el = containerRef.current;
    if (!el || !natural) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const f = Math.min(cw / natural.w, ch / natural.h);
    setFit(f);
    if (focusMarker) {
      const s = Math.min(f * 3, f * MAX_ZOOM);
      setView({ s, tx: cw / 2 - focusMarker.x * natural.w * s, ty: ch / 2 - focusMarker.y * natural.h * s });
    } else {
      setView({ s: f, tx: (cw - natural.w * f) / 2, ty: (ch - natural.h * f) / 2 });
    }
  }, [natural]);

  useEffect(() => {
    if (!natural) return;
    const focus = selected !== null ? markers.find(m => m.l === selected) : undefined;
    fitToView(focus);
    // Solo al cargar la imagen: después el usuario controla el zoom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural]);

  // Activos de la ubicación seleccionada (modo ver)
  useEffect(() => {
    if (mode !== 'view' || selected === null) return;
    let cancelled = false;
    AssetService.listAssetsAtLocation(session, selected)
      .then(list => { if (!cancelled) setAssetsHere(list); })
      .catch(() => { if (!cancelled) setAssetsHere([]); });
    return () => { cancelled = true; };
  }, [session, selected, mode]);

  // ── Zoom y arrastre ──────────────────────────────────────────────────────
  const zoomAt = (factor: number, cx: number, cy: number) => {
    setView(v => {
      const s = Math.min(fit * MAX_ZOOM, Math.max(fit * 0.8, v.s * factor));
      return { s, tx: cx - (cx - v.tx) * (s / v.s), ty: cy - (cy - v.ty) * (s / v.s) };
    });
  };

  const localPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const toImageFraction = (clientX: number, clientY: number) => {
    if (!natural) return null;
    const p = localPoint(clientX, clientY);
    const v = viewRef.current;
    const x = (p.x - v.tx) / v.s / natural.w;
    const y = (p.y - v.ty) / v.s / natural.h;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    containerRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      const markerEl = (e.target as HTMLElement).closest('[data-marker]') as HTMLElement | null;
      const markerId = markerEl ? Number(markerEl.dataset.marker) : undefined;
      gesture.current = {
        startX: e.clientX, startY: e.clientY, moved: 0,
        // En edición, arrastrar una marca la mueve en vez de mover el croquis
        dragMarker: mode === 'edit' && markerId !== undefined ? markerId : undefined
      };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (gesture.current) gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current.moved = Math.max(gesture.current.moved, Math.hypot(e.clientX - gesture.current.startX, e.clientY - gesture.current.startY));

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (gesture.current.pinchDist) zoomAt(dist / gesture.current.pinchDist, mid.x, mid.y);
      gesture.current.pinchDist = dist;
      gesture.current.moved = TAP_SLOP_PX + 1;
      return;
    }
    if (gesture.current.dragMarker !== undefined) {
      // El id se toma ahora: React aplica la actualización después, cuando el gesto pudo haber
      // terminado (gesture.current = null) y leerlo ahí rompía la pantalla al soltar el dedo
      const dragId = gesture.current.dragMarker;
      const f = toImageFraction(e.clientX, e.clientY);
      if (f) setMarkers(ms => ms.map(m => (m.l === dragId ? { ...m, ...f } : m)));
      return;
    }
    setView(v => ({ ...v, tx: v.tx + (e.clientX - prev.x), ty: v.ty + (e.clientY - prev.y) }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || g.moved > TAP_SLOP_PX) {
      if (g?.dragMarker !== undefined) setSelected(g.dragMarker);
      return;
    }
    // Toque: sobre una marca → seleccionarla; sobre el croquis → colocar (en edición)
    const markerEl = (e.target as HTMLElement).closest('[data-marker]') as HTMLElement | null;
    if (markerEl) {
      setSelected(Number(markerEl.dataset.marker));
      setAssetsHere(null);
      return;
    }
    if (mode === 'edit' && placing) {
      const f = toImageFraction(e.clientX, e.clientY);
      if (!f) return;
      setMarkers(ms => [...ms.filter(m => m.l !== placing), { l: placing, ...f }]);
      setSelected(placing);
      setPlacing(0);
      return;
    }
    setSelected(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = localPoint(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  };

  const zoomButton = (factor: number) => {
    const el = containerRef.current;
    if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  // ── Acciones ─────────────────────────────────────────────────────────────
  // Imagen lista para subir: los PDF se convierten a PNG de alta resolución (eligiendo página)
  const prepareImage = async (file: File): Promise<{ blob: Blob; filename: string; ratio: number } | null> => {
    if (isPdf(file)) {
      setBusy('Leyendo PDF...');
      const pages = await getPdfPageCount(file);
      let page = 1;
      if (pages > 1) {
        setBusy(null);
        const chosen = await new Promise<number | null>(resolve => setPdfChoice({ pages, resolve }));
        setPdfChoice(null);
        if (!chosen) return null;
        page = chosen;
      }
      setBusy('Convirtiendo PDF a imagen de alta resolución...');
      const rendered = await renderPdfPage(file, page);
      return { blob: rendered.blob, filename: `croquis_${floor!.id}.png`, ratio: rendered.width / rendered.height };
    }
    // Fotos o capturas muy pesadas se reducen sin bajar de 3000 px, para conservar detalle
    const image = file.size > 10 * 1024 * 1024 ? await GLPIService.compressPhoto(file, 3000, 0.9) : file;
    const bitmap = await createImageBitmap(image);
    const ratio = bitmap.width / bitmap.height;
    bitmap.close();
    return { blob: image, filename: `croquis_${floor!.id}.${image.type === 'image/png' ? 'png' : 'jpg'}`, ratio };
  };

  const uploadImage = async (file?: File) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file || !floor) return;
    setError(null);
    try {
      const prepared = await prepareImage(file);
      if (!prepared) return;
      if (uploadKind.current === 'replace' && plan) {
        // Las marcas son porcentajes: si cambian las proporciones, quedarían desplazadas
        const oldRatio = natural ? natural.w / natural.h : prepared.ratio;
        if (markers.length && Math.abs(prepared.ratio - oldRatio) / oldRatio > 0.03 &&
          !window.confirm('La imagen nueva tiene otras proporciones que la anterior: las marcas pueden quedar movidas y tendrás que ajustarlas. ¿Continuar?')) {
          return;
        }
        setBusy('Cambiando imagen del croquis...');
        const replaced = await FloorPlanService.replaceImage(session, plan, floor, prepared.blob, prepared.filename, markers);
        setPlan(replaced);
        setNotice('Imagen del croquis actualizada; las marcas se conservaron.');
        setTimeout(() => setNotice(null), 3000);
      } else {
        setBusy('Subiendo croquis...');
        const created = await FloorPlanService.createPlan(session, floor, prepared.blob, prepared.filename);
        setPlan(created);
        setMarkers([]);
        setMode('edit');
        setExistingPlans(prev => [...prev, { locationId: floor.id, name: created.name }]);
      }
      setNatural(null);
      setImageUrl(URL.createObjectURL(prepared.blob));
    } catch (err: any) {
      setError(err.message || 'No se pudo subir el croquis.');
    } finally {
      setBusy(null);
    }
  };

  const pickFile = (kind: 'create' | 'replace') => {
    uploadKind.current = kind;
    fileRef.current?.click();
  };

  const save = async (force = false) => {
    if (!plan) return;
    setBusy('Guardando marcas...');
    setError(null);
    try {
      const saved = await FloorPlanService.saveMarkers(session, plan, markers, force);
      setPlan(saved);
      setNotice('Marcas guardadas en GLPI.');
      setTimeout(() => setNotice(null), 2500);
    } catch (err: any) {
      if (err.message === 'CONFLICT') {
        if (window.confirm('Alguien más modificó este croquis mientras lo editabas. ¿Guardar tus marcas de todos modos (se perderán sus cambios)?')) {
          setBusy(null);
          await save(true);
          return;
        }
      } else {
        setError(err.message || 'No se pudieron guardar las marcas.');
      }
    } finally {
      setBusy(null);
    }
  };

  // Eliminar el croquis completo (imagen y marcas viven en el mismo documento de GLPI)
  const deletePlan = async () => {
    if (!plan || !floor) return;
    const total = markers.length;
    const what = total === 0 ? 'la imagen' : total === 1 ? 'la imagen y su marca' : `la imagen y sus ${total} marcas`;
    if (!window.confirm(`¿Eliminar el croquis de «${floor.completename}»?\n\nSe borran ${what}. Esta acción no se puede deshacer.`)) return;
    setBusy('Eliminando croquis...');
    setError(null);
    try {
      await FloorPlanService.deletePlan(session, plan);
      setPlan(null);
      setMarkers([]);
      setImageUrl(null);
      setNatural(null);
      setSelected(null);
      setMode('view');
      setExistingPlans(prev => prev.filter(p => p.locationId !== floor.id));
      setNotice('Croquis eliminado.');
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setError(err.message || 'No se pudo eliminar el croquis.');
    } finally {
      setBusy(null);
    }
  };

  const handleBack = () => {
    if (dirty && !window.confirm('Tienes marcas sin guardar. ¿Salir sin guardar?')) return;
    onBack();
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const descendants = floor ? FloorPlanService.descendantsOf(locations, floor.id) : [];
  const placeOptions = descendants.map(l => ({
    id: l.id,
    label: `${markers.some(m => m.l === l.id) ? '✓ ' : ''}${l.completename.replace(`${floor?.completename} > `, '')}`
  }));
  const selectedNode = selected !== null ? byId.get(selected) : undefined;
  const zoomed = view.s / fit;

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
      <button
        type="button"
        onClick={handleBack}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
      >
        <ArrowLeft size={18} /> {backLabel}
      </button>
      {plan && perms.canEdit && (
        <div style={{ display: 'flex', gap: '4px', padding: '3px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          {([['view', 'Ver', <Eye size={14} key="v" />], ['edit', 'Editar', <Pencil size={14} key="e" />]] as const).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setMode(key); setPlacing(0); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', border: 'none', borderRadius: '9px', cursor: 'pointer',
                background: mode === key ? 'var(--card-bg)' : 'transparent', boxShadow: mode === key ? 'var(--shadow-sm)' : 'none',
                color: mode === key ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem'
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Paso 1: elegir el piso/área
  if (!floorId) {
    return (
      <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
        {header}
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapIcon size={20} color="var(--primary)" /> Croquis
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
          Elige el piso o área. Si aún no tiene croquis, podrás subir la imagen y marcar sus ubicaciones.
        </p>
        {existingPlans.length > 0 && (
          <div className="card">
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Con croquis</div>
            {existingPlans.map(p => (
              <button
                key={p.locationId}
                type="button"
                onClick={() => { setPlanLoaded(false); setFloorId(p.locationId); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', border: 'none', borderTop: '1px solid var(--border-color)', background: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem' }}
              >
                <MapIcon size={16} color="var(--primary)" />
                <span style={{ flex: 1 }}>{byId.get(p.locationId)?.completename || p.name}</span>
                <ChevronRight size={16} color="var(--text-muted)" />
              </button>
            ))}
          </div>
        )}
        <div className="card">
          <label className="form-label">Piso o área</label>
          <SearchSelect
            label="Piso o área"
            value={0}
            options={locations.map(l => ({ id: l.id, label: l.completename }))}
            loading={locations.length === 0 && !error}
            onChange={id => { if (id) { setPlanLoaded(false); setFloorId(id); } }}
          />
        </div>
        {error && <div className="card" style={{ color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      {header}
      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '10px', lineHeight: 1.3 }}>
        {floor?.completename || 'Croquis'}
      </h2>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,application/pdf,.pdf" hidden onChange={e => uploadImage(e.target.files?.[0])} />

      {/* PDF con varias páginas: elegir cuál es el croquis */}
      {pdfChoice && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
            <FileText size={16} color="var(--primary)" /> El PDF tiene {pdfChoice.pages} páginas: ¿cuál es el croquis?
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {Array.from({ length: Math.min(pdfChoice.pages, 30) }, (_, i) => i + 1).map(n => (
              <button key={n} type="button" onClick={() => pdfChoice.resolve(n)}
                style={{ minWidth: '40px', padding: '7px 10px', borderRadius: '10px', border: '1px solid var(--primary)', background: 'rgba(59,130,246,0.08)', color: 'var(--primary)', fontWeight: 800, cursor: 'pointer' }}>
                {n}
              </button>
            ))}
            <button type="button" onClick={() => pdfChoice.resolve(null)}
              style={{ padding: '7px 10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!planLoaded ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
          <RefreshCw className="spin" size={22} style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: '0.85rem' }}>Buscando croquis...</div>
        </div>
      ) : !plan ? (
        <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
          {notice && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '12px', color: '#059669', fontSize: '0.82rem', fontWeight: 700 }}>
              <CheckCircle2 size={16} /> {notice}
            </div>
          )}
          <MapIcon size={36} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>Esta ubicación aún no tiene croquis</div>
          {perms.canUpload ? (
            <>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '6px 0 14px' }}>
                Sube el plano en PDF, PNG o JPG. Un PDF se convierte a imagen de alta resolución. Se guarda en GLPI como documento de esta ubicación.
              </p>
              <button type="button" className="btn-primary" onClick={() => pickFile('create')} disabled={!!busy || !!pdfChoice}>
                {busy ? <RefreshCw size={16} className="spin" /> : <Upload size={16} />} {busy || 'Subir croquis'}
              </button>
            </>
          ) : (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              Pide al administrador de GLPI que suba el croquis de este piso (se necesita permiso para crear documentos).
            </p>
          )}
          {error && <div style={{ marginTop: '10px', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>{error}</div>}
        </div>
      ) : (
        <>
          {/* Editor: qué ubicación se va a colocar */}
          {mode === 'edit' && (
            <div className="card" style={{ padding: '12px 14px' }}>
              <label className="form-label">Ubicación a marcar</label>
              <SearchSelect label="Ubicación a marcar" value={placing} options={placeOptions} onChange={setPlacing} />
              <div style={{ marginTop: '8px', fontSize: '0.75rem', color: placing ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                {placing
                  ? `Toca el croquis donde está «${shortName(byId.get(placing))}».`
                  : `Elige una ubicación y toca el croquis para marcarla. Arrastra una marca para moverla. ${markers.length} de ${descendants.length} marcadas.`}
              </div>
            </div>
          )}

          {/* Visor */}
          <div
            ref={containerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            style={{
              position: 'relative', height: '58vh', minHeight: '320px', overflow: 'hidden', touchAction: 'none',
              borderRadius: '18px', border: '1px solid var(--border-color)', background: '#e5e7eb',
              cursor: mode === 'edit' && placing ? 'crosshair' : 'grab', marginBottom: '10px'
            }}
          >
            {imageUrl ? (
              <div
                style={{
                  position: 'absolute', left: 0, top: 0, width: natural?.w, height: natural?.h,
                  transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: '0 0'
                }}
              >
                <img
                  src={imageUrl}
                  alt="Croquis"
                  draggable={false}
                  onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  style={{ display: 'block', width: natural?.w, height: natural?.h, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }}
                />
                {natural && markers.map(m => {
                  const node = byId.get(m.l);
                  const isSelected = m.l === selected;
                  const showLabel = isSelected || zoomed >= 1.8;
                  return (
                    <div
                      key={m.l}
                      data-marker={m.l}
                      style={{
                        position: 'absolute', left: m.x * natural.w, top: m.y * natural.h,
                        transform: `translate(-50%, -100%) scale(${1 / view.s})`, transformOrigin: '50% 100%',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', zIndex: isSelected ? 3 : 2
                      }}
                    >
                      {showLabel && (
                        <span style={{
                          marginBottom: '2px', padding: '2px 7px', borderRadius: '8px', whiteSpace: 'nowrap',
                          background: isSelected ? '#b45309' : 'rgba(15, 23, 42, 0.8)', color: '#fff', fontSize: '11px', fontWeight: 700
                        }}>
                          {shortName(node) || `#${m.l}`}
                        </span>
                      )}
                      <span style={{ position: 'relative', display: 'flex' }}>
                        {isSelected && mode === 'view' && <span className="pin-pulse" />}
                        <MapPin size={isSelected ? 32 : 24} color="#fff" fill={isSelected ? '#f59e0b' : '#ef4444'} strokeWidth={1.5} />
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px', fontSize: '0.85rem' }}>
                <RefreshCw size={18} className="spin" /> Cargando imagen...
              </div>
            )}

            {/* Controles de zoom */}
            <div style={{ position: 'absolute', right: '10px', bottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}
              onPointerDown={e => e.stopPropagation()}>
              {[
                { icon: <ZoomIn size={18} />, label: 'Acercar', action: () => zoomButton(1.4) },
                { icon: <ZoomOut size={18} />, label: 'Alejar', action: () => zoomButton(1 / 1.4) },
                { icon: <Maximize size={16} />, label: 'Ver completo', action: () => fitToView() }
              ].map(b => (
                <button key={b.label} type="button" onClick={b.action} aria-label={b.label} title={b.label}
                  style={{ display: 'flex', padding: '8px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer' }}>
                  {b.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Marca seleccionada */}
          {selectedNode && markers.some(m => m.l === selected) && (
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {selectedNode.completename.replace(`${floor?.completename} > `, '').split(' > ').slice(0, -1).join(' › ')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={16} color="#d97706" /> {selectedNode.name}
                </div>
                {mode === 'edit' ? (
                  <button type="button" onClick={() => { setMarkers(ms => ms.filter(m => m.l !== selected)); setSelected(null); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '10px', border: '1px solid rgba(220,38,38,0.35)', background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                    <Trash2 size={14} /> Quitar marca
                  </button>
                ) : (
                  <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar"
                    style={{ display: 'flex', padding: '5px', border: 'none', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <X size={16} />
                  </button>
                )}
              </div>

              {mode === 'view' && (
                <div style={{ marginTop: '8px' }}>
                  {assetsHere === null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <RefreshCw size={12} className="spin" /> Buscando equipos aquí...
                    </div>
                  ) : assetsHere.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No hay activos registrados en esta ubicación.</div>
                  ) : assetsHere.map(a => (
                    <button key={`${a.itemtype}-${a.id}`} type="button" disabled={!onOpenAsset} onClick={() => onOpenAsset?.(a.itemtype, a.id, floor?.name || 'Croquis')}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 0', border: 'none', borderTop: '1px solid var(--border-color)', background: 'none', textAlign: 'left', cursor: onOpenAsset ? 'pointer' : 'default' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{a.name}</span>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {[getAssetType(a.itemtype).singular, a.serial && `S/N ${a.serial}`].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {onOpenAsset && <ChevronRight size={16} color="var(--text-muted)" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'view' && focusLocationId && !markers.some(m => m.l === selected) && (
            <div className="card" style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 600 }}>
              La ubicación de este activo aún no está marcada en el croquis. Usa “Editar” para marcarla.
            </div>
          )}

          {error && <div className="card" style={{ color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>{error}</div>}
          {notice && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: '#059669', fontSize: '0.82rem', fontWeight: 700 }}>
              <CheckCircle2 size={16} /> {notice}
            </div>
          )}

          {mode === 'edit' && (
            <>
              <button type="button" className="btn-primary" onClick={() => save()} disabled={!dirty || !!busy} style={{ opacity: !dirty || busy ? 0.6 : 1 }}>
                {busy ? <RefreshCw size={18} className="spin" /> : <Save size={18} />} {busy || (dirty ? 'Guardar marcas' : 'Sin cambios por guardar')}
              </button>
              {perms.canUpload && (
                <button type="button" className="btn-secondary" onClick={() => pickFile('replace')} disabled={!!busy || !!pdfChoice} style={{ marginTop: '10px' }}>
                  <ImageUp size={18} /> Cambiar imagen (PDF, PNG o JPG) sin perder las marcas
                </button>
              )}
              {perms.canDelete && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={deletePlan}
                  disabled={!!busy}
                  style={{ marginTop: '10px', color: '#dc2626', borderColor: 'rgba(220, 38, 38, 0.35)' }}
                >
                  <Trash size={18} /> Eliminar croquis
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
