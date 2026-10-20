import React, { useState, useEffect } from 'react';
import type { GLPISession } from '../types/glpi';
import { AssetService, getAssetType, emptyAssetForm, ASSET_PHOTO_CATEGORY, CONNECTABLE_TYPES, MONITOR_PORTS } from '../services/assetService';
import { TagSelect } from './TagSelect';
import { GLPIService } from '../services/glpiService';
import type { AssetForm, DropdownOption, PluginFieldKey } from '../services/assetService';
import { SearchSelect } from './SearchSelect';
import { AssetHardwareSection, AssetNetworkSection } from './AssetInfoSections';
import { ScannerModal } from './ScannerModal';
import { ItemPhotos } from './ItemPhotos';
import { ComputerConnectionsSection, ItemConnectionSection } from './AssetConnections';
import { FloorPlanService } from '../services/floorPlanService';
import { ArrowLeft, RefreshCw, Save, CheckCircle2, Tag, Hash, Barcode, Fingerprint, CalendarPlus, CalendarX, ScanLine, Map as MapIcon, Ruler } from 'lucide-react';

export type AssetTab = 'data' | 'hardware' | 'network' | 'photos' | 'connections';

interface AssetFormViewProps {
  session: GLPISession;
  itemtype: string;
  assetId: number | null; // null = alta de un activo nuevo
  onBack: () => void;
  onSaved: (id: number) => void;
  initialTab?: AssetTab;  // al regresar de un elemento conectado se vuelve a la pestaña donde estaba
  backLabel?: string;     // texto del botón de regreso (por defecto, el tipo de activo)
  // Abrir otro activo (p. ej. un dispositivo conectado); `fromTab` es la pestaña actual
  onOpenAsset?: (itemtype: string, id: number, fromTab: AssetTab, fromName: string) => void;
  // Abrir el croquis donde está la ubicación del activo
  onOpenPlan?: (planLocationId: number, focusLocationId: number | null, fromTab: AssetTab, fromName: string) => void;
}

// Campos que se pueden llenar escaneando una etiqueta
type ScannableField = 'physicalTag' | 'serial' | 'otherserial' | 'uuid';
const SCANNABLE: ScannableField[] = ['physicalTag', 'serial', 'otherserial', 'uuid'];

interface Dropdowns {
  states: DropdownOption[];
  types: DropdownOption[];
  manufacturers: DropdownOption[];
  models: DropdownOption[];
  locations: DropdownOption[];
  users: DropdownOption[];
}

const emptyDropdowns: Dropdowns = { states: [], types: [], manufacturers: [], models: [], locations: [], users: [] };

const sectionTitle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: '12px'
};

// Alta y edición de un activo (computadora, monitor, teléfono, dispositivo, impresora, equipo de red)
export const AssetFormView: React.FC<AssetFormViewProps> = ({
  session, itemtype, assetId, onBack, onSaved, initialTab, backLabel, onOpenAsset, onOpenPlan
}) => {
  const config = getAssetType(itemtype);
  const [currentId, setCurrentId] = useState<number | null>(assetId);
  const [form, setForm] = useState<AssetForm>(emptyAssetForm());
  const [original, setOriginal] = useState<AssetForm>(emptyAssetForm());
  // Campos del plugin Campos adicionales que tiene este tipo (etiqueta física, fechas)
  const [pluginFields, setPluginFields] = useState<PluginFieldKey[]>([]);
  // Pestañas en edición: datos editables, hardware (computadoras) y red (solo lectura)
  const [tab, setTab] = useState<AssetTab>(initialTab || 'data');
  // Campo que se está escaneando con la cámara (código de barras u OCR)
  const [scanning, setScanning] = useState<{ key: ScannableField; label: string } | null>(null);
  const [dropdowns, setDropdowns] = useState<Dropdowns>(emptyDropdowns);
  const [loadingAsset, setLoadingAsset] = useState<boolean>(assetId !== null);
  const [loadingDropdowns, setLoadingDropdowns] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    AssetService.getPluginFieldOptions(session, itemtype)
      .then(options => { if (!cancelled) setPluginFields(Object.keys(options) as PluginFieldKey[]); })
      .catch(() => { /* sin campos del plugin */ });

    if (assetId !== null) {
      AssetService.getAsset(session, itemtype, assetId)
        .then(data => {
          if (cancelled) return;
          setForm(data);
          setOriginal(data);
        })
        .catch(err => { if (!cancelled) setError(err.message || 'No se pudo cargar el activo.'); })
        .finally(() => { if (!cancelled) setLoadingAsset(false); });
    }

    Promise.all([
      AssetService.getDropdown(session, 'State', config.stateVisibility),
      AssetService.getDropdown(session, config.typeItemtype),
      AssetService.getDropdown(session, 'Manufacturer'),
      AssetService.getDropdown(session, config.modelItemtype),
      AssetService.getDropdown(session, 'Location'),
      AssetService.getUserOptions(session)
    ])
      .then(([states, types, manufacturers, models, locations, users]) => {
        if (!cancelled) setDropdowns({ states, types, manufacturers, models, locations, users });
      })
      .catch(err => { if (!cancelled) setError(err.message || 'No se pudieron cargar las listas de GLPI.'); })
      .finally(() => { if (!cancelled) setLoadingDropdowns(false); });

    return () => { cancelled = true; };
  }, [session, itemtype, assetId, config.stateVisibility, config.typeItemtype, config.modelItemtype]);

  const set = <K extends keyof AssetForm>(key: K, value: AssetForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setSavedMsg(null);
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const isNew = currentId === null;

  // Abrir un elemento conectado, avisando si hay cambios sin guardar en este
  const openLinked = (linkedType: string, linkedId: number) => {
    if (dirty && !window.confirm('Tienes cambios sin guardar en este activo. ¿Abrir el otro sin guardar?')) return;
    onOpenAsset?.(linkedType, linkedId, tab, original.name || config.singular);
  };

  // "Ver en croquis": busca el croquis del piso de la ubicación (o de sus ubicaciones superiores)
  const [planLookup, setPlanLookup] = useState<string | null>(null);
  const openPlan = async () => {
    if (!onOpenPlan || !form.locations_id) return;
    setPlanLookup('Buscando croquis...');
    try {
      const found = await FloorPlanService.findPlanFor(session, form.locations_id);
      if (!found) {
        setPlanLookup('Ningún piso de esta ubicación tiene croquis todavía. Créalo en Activos › Croquis.');
        return;
      }
      setPlanLookup(null);
      onOpenPlan(found.plan.locationId, found.focus, tab, original.name || config.singular);
    } catch {
      setPlanLookup('No se pudo buscar el croquis.');
    }
  };

  const handleBack = () => {
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) return;
    onBack();
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const id = await AssetService.createAsset(session, itemtype, form, pluginFields);
        setCurrentId(id);
        setSavedMsg(`${config.singular} creado en GLPI (#${id}).`);
        onSaved(id);
      } else {
        await AssetService.updateAsset(session, itemtype, currentId, form, pluginFields);
        setSavedMsg('Cambios guardados en GLPI.');
        onSaved(currentId);
      }
      setOriginal(form);
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const textField = (key: 'name' | 'serial' | 'otherserial' | 'uuid' | 'physicalTag', label: string, icon: React.ReactNode, placeholder = '') => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="input-wrapper">
        <span className="input-icon" style={{ display: 'flex' }}>{icon}</span>
        <input
          className="form-input"
          value={form[key]}
          onChange={e => set(key, e.target.value)}
          placeholder={placeholder}
          disabled={saving}
          autoCapitalize={key === 'name' ? 'sentences' : 'characters'}
          autoCorrect="off"
          spellCheck={false}
          style={SCANNABLE.includes(key as ScannableField) ? { paddingRight: '48px' } : undefined}
        />
        {SCANNABLE.includes(key as ScannableField) && (
          <button
            type="button"
            onClick={() => setScanning({ key: key as ScannableField, label })}
            disabled={saving}
            aria-label={`Escanear ${label}`}
            title="Escanear código de barras o texto"
            style={{
              position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
              display: 'flex', padding: '7px', borderRadius: '10px', border: 'none',
              background: 'rgba(245, 165, 36, 0.12)', color: 'var(--primary)', cursor: 'pointer'
            }}
          >
            <ScanLine size={18} />
          </button>
        )}
      </div>
    </div>
  );

  const dateField = (key: 'acquisitionDate' | 'retirementDate', label: string, icon: React.ReactNode) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="input-wrapper">
        <span className="input-icon" style={{ display: 'flex' }}>{icon}</span>
        <input
          type="date"
          className="form-input"
          value={form[key]}
          onChange={e => set(key, e.target.value)}
          disabled={saving}
        />
      </div>
    </div>
  );

  const selectField = (key: 'states_id' | 'typeId' | 'manufacturers_id' | 'modelId' | 'locations_id' | 'users_id', label: string, options: DropdownOption[]) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <SearchSelect
        label={label}
        value={form[key]}
        options={options}
        loading={loadingDropdowns}
        disabled={saving}
        onChange={id => set(key, id)}
      />
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <button
          type="button"
          onClick={handleBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none',
            color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
          }}
        >
          <ArrowLeft size={18} /> {backLabel || config.label}
        </button>
        {!isNew && <span className="badge" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>#{currentId}</span>}
      </div>

      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '14px' }}>
        {isNew ? `Nuevo: ${config.singular}` : form.name || config.singular}
      </h2>

      {scanning && (
        <ScannerModal
          fieldLabel={scanning.label}
          kind={scanning.key === 'uuid' ? 'uuid' : 'alphanumeric'}
          onResult={value => set(scanning.key, value)}
          onClose={() => setScanning(null)}
        />
      )}

      {/* Pestañas (solo al editar un activo existente) */}
      {!isNew && (
        <div style={{ display: 'flex', gap: '4px', padding: '4px', marginBottom: '14px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '14px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {([
            ['data', 'Datos'],
            ...(itemtype === 'Computer' ? [['hardware', 'Hardware']] : []),
            ['network', 'Red'],
            ['photos', 'Fotos'],
            // Computadora: sus dispositivos conectados; dispositivo: la computadora a la que está conectado
            ...(itemtype === 'Computer' ? [['connections', 'Conexiones']] : CONNECTABLE_TYPES.includes(itemtype) ? [['connections', 'Conexión']] : [])
          ] as [AssetTab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                flex: '1 0 auto', padding: '8px 10px', border: 'none', borderRadius: '10px', cursor: 'pointer', whiteSpace: 'nowrap',
                background: tab === key ? 'var(--card-bg)' : 'transparent',
                boxShadow: tab === key ? 'var(--shadow-sm)' : 'none',
                color: tab === key ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.8rem'
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!isNew && tab === 'hardware' && currentId !== null && (
        <AssetHardwareSection session={session} itemtype={itemtype} assetId={currentId} />
      )}
      {!isNew && tab === 'network' && currentId !== null && (
        <AssetNetworkSection session={session} itemtype={itemtype} assetId={currentId} />
      )}
      {!isNew && tab === 'connections' && currentId !== null && (
        itemtype === 'Computer'
          ? <ComputerConnectionsSection session={session} itemtype={itemtype} assetId={currentId} assetName={original.name || `Computadora #${currentId}`} onOpenAsset={onOpenAsset ? openLinked : undefined} />
          : <ItemConnectionSection session={session} itemtype={itemtype} assetId={currentId} assetName={original.name || `${config.singular} #${currentId}`} onOpenAsset={onOpenAsset ? openLinked : undefined} />
      )}
      {!isNew && tab === 'photos' && currentId !== null && (
        <ItemPhotos
          session={session}
          sourceKey={`${itemtype}#${currentId}`}
          categories={[ASSET_PHOTO_CATEGORY]}
          loadPhotos={() => GLPIService.getItemPhotos(session, itemtype, currentId)}
          uploadPhoto={(photo, categoryId, index) => {
            // Nombre y archivo legibles en GLPI: "Foto de activo - <nombre> - <fecha> (n)"
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
            const assetName = original.name || `${config.singular} #${currentId}`;
            return GLPIService.uploadItemPhoto(session, {
              itemtype,
              itemId: currentId,
              name: `Foto de activo - ${assetName} - ${stamp} (${index + 1})`,
              filename: `activo_${itemtype.toLowerCase()}_${currentId}_${stamp.replace(/[-: ]/g, '')}_${index + 1}.jpg`,
              categoryId,
              photo
            });
          }}
        />
      )}

      {(isNew || tab === 'data') && (loadingAsset ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
          <RefreshCw className="spin" size={24} style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: '0.85rem' }}>Cargando activo de GLPI...</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div style={sectionTitle}>Identificación</div>
            {textField('name', 'Nombre *', <Tag size={18} />, `Nombre del ${config.singular.toLowerCase()}`)}
            {pluginFields.includes('physicalTag') && textField('physicalTag', 'Etiqueta física', <Barcode size={18} />, 'PC-000000')}
            {textField('serial', 'Número de serie', <Hash size={18} />)}
            {textField('otherserial', 'Número de inventario', <Hash size={18} />)}
            {textField('uuid', 'UUID', <Fingerprint size={18} />)}
          </div>

          {(pluginFields.includes('acquisitionDate') || pluginFields.includes('retirementDate')) && (
            <div className="card">
              <div style={sectionTitle}>Fechas</div>
              {pluginFields.includes('acquisitionDate') && dateField('acquisitionDate', 'Fecha de adquisición', <CalendarPlus size={18} />)}
              {pluginFields.includes('retirementDate') && dateField('retirementDate', 'Fecha de baja', <CalendarX size={18} />)}
            </div>
          )}

          {itemtype === 'Monitor' && (
            <div className="card">
              <div style={sectionTitle}>Monitor</div>
              <div className="form-group">
                <label className="form-label" htmlFor="monitor-size">Tamaño (pulgadas)</label>
                <div className="input-wrapper">
                  <span className="input-icon" style={{ display: 'flex' }}><Ruler size={18} /></span>
                  <input
                    id="monitor-size"
                    className="form-input"
                    type="text"
                    inputMode="decimal"
                    value={form.size}
                    onChange={e => set('size', e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="23.8"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Puertos y características</label>
                <TagSelect
                  options={MONITOR_PORTS.map(p => ({ value: p.field, label: p.label }))}
                  value={form.monitorPorts}
                  onChange={ports => set('monitorPorts', ports)}
                  disabled={saving}
                  emptyText="Sin puertos indicados"
                />
              </div>
            </div>
          )}

          <div className="card">
            <div style={sectionTitle}>Clasificación</div>
            {selectField('states_id', 'Estado', dropdowns.states)}
            {selectField('typeId', 'Tipo', dropdowns.types)}
            {selectField('manufacturers_id', 'Fabricante', dropdowns.manufacturers)}
            {selectField('modelId', 'Modelo', dropdowns.models)}
          </div>

          <div className="card">
            <div style={sectionTitle}>Asignación</div>
            {selectField('users_id', 'Usuario', dropdowns.users)}
            {selectField('locations_id', 'Ubicación', dropdowns.locations)}
            {onOpenPlan && form.locations_id > 0 && (
              <div style={{ marginTop: '-6px' }}>
                <button
                  type="button"
                  onClick={openPlan}
                  disabled={planLookup === 'Buscando croquis...'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '12px',
                    border: '1px solid rgba(245, 165, 36, 0.4)', background: 'rgba(245, 165, 36, 0.08)',
                    color: 'var(--primary)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
                  }}
                >
                  {planLookup === 'Buscando croquis...' ? <RefreshCw size={15} className="spin" /> : <MapIcon size={15} />} Ver en croquis
                </button>
                {planLookup && planLookup !== 'Buscando croquis...' && (
                  <div style={{ marginTop: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#b45309' }}>{planLookup}</div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div style={sectionTitle}>Comentarios</div>
            <textarea
              className="form-input"
              value={form.comment}
              onChange={e => set('comment', e.target.value)}
              rows={3}
              disabled={saving}
              style={{ resize: 'vertical', padding: '10px 12px' }}
            />
          </div>

          {error && (
            <div style={{ marginBottom: '10px', fontSize: '0.8rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>
          )}
          {savedMsg && !dirty && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>
              <CheckCircle2 size={16} /> {savedMsg}
            </div>
          )}

          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || (!dirty && !isNew)}
            style={{ opacity: saving || (!dirty && !isNew) ? 0.6 : 1 }}
          >
            {saving ? <RefreshCw size={18} className="spin" /> : <Save size={18} />}
            {isNew ? `Crear ${config.singular.toLowerCase()}` : 'Guardar cambios'}
          </button>
        </>
      ))}
    </div>
  );
};
