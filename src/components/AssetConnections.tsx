import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GLPISession } from '../types/glpi';
import { AssetService, getAssetType, CONNECTABLE_TYPES } from '../services/assetService';
import type { AssetConnection, AssetSummary } from '../services/assetService';
import { ScannerModal } from './ScannerModal';
import { RefreshCw, Plus, Unplug, Link2, Search, X, Monitor, Mouse, Phone, Printer, Laptop, ArrowRightLeft, Info, ChevronRight, ScanLine } from 'lucide-react';

interface SectionProps {
  session: GLPISession;
  itemtype: string;
  assetId: number;
  assetName: string;
  // Abrir el registro de un elemento conectado (detalles, pestañas, edición)
  onOpenAsset?: (itemtype: string, id: number) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  Computer: <Laptop size={16} />,
  Monitor: <Monitor size={16} />,
  Peripheral: <Mouse size={16} />,
  Phone: <Phone size={16} />,
  Printer: <Printer size={16} />
};

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Sin espacios ni separadores: lo escaneado ("PC-000103") coincide aunque GLPI lo tenga como "PC 000103"
const compact = (value: string) => normalize(value).replace(/[^a-z0-9]/g, '');

const matchesSearch = (asset: AssetSummary, words: string[]): boolean => {
  if (!words.length) return true;
  const fields = [asset.name, asset.physicalTag, asset.serial, asset.inventoryNumber, asset.userName, asset.location].filter(Boolean) as string[];
  const haystack = normalize(fields.join(' '));
  const compactHaystack = fields.map(compact).join(' ');
  return words.every(w => haystack.includes(w) || (compact(w).length > 0 && compactHaystack.includes(compact(w))));
};

// Computadora de la que salió un dispositivo al moverlo (para ofrecer reponerle otro)
interface MovedFrom {
  id: number;
  name: string;
}

// Aviso de lo que GLPI hace al conectar (configuración de la instancia)
const AutoUpdateHint: React.FC = () => (
  <div style={{ display: 'flex', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
    <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
    <span>Al conectar, GLPI copia al dispositivo el usuario, grupo, contacto y ubicación de la computadora.</span>
  </div>
);

const ConnectionRow: React.FC<{
  icon: React.ReactNode; name: string; detail?: string; typeLabel: string; busy: boolean;
  onDisconnect: () => void; onOpen?: () => void;
}> = ({ icon, name, detail, typeLabel, busy, onDisconnect, onOpen }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: '1px solid var(--border-color)' }}>
    {/* Tocar el elemento abre su registro completo */}
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      title={onOpen ? `Ver ${name}` : undefined}
      style={{
        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px', padding: 0, border: 'none',
        background: 'none', textAlign: 'left', fontFamily: 'inherit', cursor: onOpen ? 'pointer' : 'default'
      }}
    >
      <span style={{ color: 'var(--primary)', display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-main)', wordBreak: 'break-word' }}>{name}</span>
        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>{[typeLabel, detail].filter(Boolean).join(' · ')}</span>
      </span>
      {onOpen && <ChevronRight size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
    </button>
    <button
      type="button"
      onClick={onDisconnect}
      disabled={busy}
      title="Desconectar"
      aria-label={`Desconectar ${name}`}
      style={{
        display: 'flex', padding: '7px', borderRadius: '10px', border: '1px solid rgba(220, 38, 38, 0.35)',
        background: 'rgba(220, 38, 38, 0.08)', color: '#dc2626', cursor: busy ? 'wait' : 'pointer', flexShrink: 0
      }}
    >
      {busy ? <RefreshCw size={15} className="spin" /> : <Unplug size={15} />}
    </button>
  </div>
);

// ── Selector: elegir qué conectar (dispositivo para una computadora, o computadora para un dispositivo)

interface PickerProps {
  session: GLPISession;
  title: string;
  types: string[];                 // tipos entre los que se elige (pestañas)
  excludeComputerId?: number;      // computadora actual: sus dispositivos ya conectados no se ofrecen
  currentComputerIds?: number[];   // para un dispositivo: la computadora a la que ya está conectado
  // `from`: la computadora que se queda sin el dispositivo, si estaba conectado en otra
  onPick: (itemtype: string, asset: AssetSummary, from?: MovedFrom) => Promise<void>;
  onClose: () => void;
  offersRefill?: boolean;          // después de mover se preguntará qué conectar en la otra computadora
}

const ConnectPicker: React.FC<PickerProps> = ({ session, title, types, excludeComputerId, currentComputerIds = [], onPick, onClose, offersRefill = true }) => {
  const [type, setType] = useState<string>(types[0]);
  const [assets, setAssets] = useState<AssetSummary[] | null>(null);
  const [links, setLinks] = useState<{ itemtype: string; itemId: number; computerId: number }[]>([]);
  const [computerNames, setComputerNames] = useState<Map<number, string>>(new Map());
  const [search, setSearch] = useState<string>('');
  const [confirming, setConfirming] = useState<{ asset: AssetSummary; from: string } | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Escanear la etiqueta del dispositivo (código de barras, QR o texto) para filtrar la lista
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanInfo, setScanInfo] = useState<string | null>(null);
  // Listas ya cargadas por tipo: al escanear se busca también en los demás tipos sin recargar
  const listCache = React.useRef<Map<string, AssetSummary[]>>(new Map());
  const typeRowRef = React.useRef<HTMLDivElement>(null);

  // La pestaña elegida (también cuando el escaneo cambia de tipo) siempre a la vista
  useEffect(() => {
    typeRowRef.current?.querySelector<HTMLElement>(`[data-type="${type}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [type]);

  useEffect(() => {
    let cancelled = false;
    const cached = listCache.current.get(type);
    Promise.all([
      cached ? Promise.resolve(cached) : AssetService.listAssets(session, type),
      AssetService.getAllConnections(session),
      AssetService.listAssets(session, 'Computer')
    ])
      .then(([list, allLinks, computers]) => {
        if (cancelled) return;
        listCache.current.set(type, list);
        setAssets(list);
        setLinks(allLinks);
        setComputerNames(new Map(computers.map(c => [c.id, c.name])));
      })
      .catch(err => { if (!cancelled) setError(err.message || 'No se pudo cargar la lista.'); });
    return () => { cancelled = true; };
  }, [session, type]);

  // A qué computadora está conectado cada dispositivo (para avisar y mover)
  const connectedTo = (asset: AssetSummary): number | undefined =>
    type === 'Computer' ? undefined : links.find(l => l.itemtype === type && l.itemId === asset.id)?.computerId;

  const words = normalize(search.trim()).split(/\s+/).filter(Boolean);
  const filtered = (assets || [])
    // No ofrecer lo que ya está conectado aquí
    .filter(a => !(excludeComputerId !== undefined && connectedTo(a) === excludeComputerId))
    .filter(a => !(type === 'Computer' && currentComputerIds.includes(a.id)))
    .filter(a => matchesSearch(a, words));

  // Lo escaneado filtra la lista; si no está en el tipo elegido se busca en los demás y se cambia
  const applyScan = async (value: string) => {
    setSearch(value);
    setScanInfo(null);
    const scanWords = normalize(value.trim()).split(/\s+/).filter(Boolean);
    const order = [type, ...types.filter(t => t !== type)];
    try {
      for (const t of order) {
        let list = listCache.current.get(t);
        if (!list) {
          list = await AssetService.listAssets(session, t);
          listCache.current.set(t, list);
        }
        if (list.some(a => matchesSearch(a, scanWords))) {
          if (t !== type) {
            setScanInfo(`Encontrado en ${getAssetType(t).label.toLowerCase()}.`);
            setAssets(null);
            setType(t);
          }
          return;
        }
      }
      setScanInfo(`Ningún ${types.length > 1 ? 'dispositivo' : getAssetType(type).singular.toLowerCase()} coincide con «${value}». Revisa el texto o búscalo a mano.`);
    } catch {
      /* sin conexión: queda el filtro en el tipo actual */
    }
  };

  // Computadora que se queda sin el dispositivo al moverlo
  const movedFrom = (asset: AssetSummary): MovedFrom | undefined => {
    const id = type === 'Computer' ? currentComputerIds[0] : connectedTo(asset);
    return id === undefined ? undefined : { id, name: computerNames.get(id) || `Computadora #${id}` };
  };

  const choose = async (asset: AssetSummary, confirmed = false) => {
    const computerId = connectedTo(asset);
    if (!confirmed && computerId !== undefined) {
      setConfirming({ asset, from: computerNames.get(computerId) || `Computadora #${computerId}` });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onPick(type, asset, movedFrom(asset));
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo conectar.');
      setSaving(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="modal-pop"
        style={{
          width: '100%', maxWidth: '420px', height: 'min(620px, 100%)', display: 'flex', flexDirection: 'column',
          background: 'var(--card-bg)', borderRadius: '24px', border: '1px solid var(--border-color)',
          boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.45)', overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'var(--bg-main)', border: 'none', borderRadius: '50%', padding: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {confirming ? (
          <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', padding: '12px', borderRadius: '16px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
              <ArrowRightLeft size={18} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                <strong>{confirming.asset.name}</strong> ya está conectado a <strong>{confirming.from}</strong>.
                En GLPI solo puede estar en una computadora: se desconectará de {confirming.from} y se conectará aquí.
                {offersRefill && ` Después podrás elegir qué le conectas a ${confirming.from} en su lugar.`}
              </div>
            </div>
            <AutoUpdateHint />
            {error && <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirming(null)} disabled={saving} style={{ flex: 1 }}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={() => choose(confirming.asset, true)} disabled={saving} style={{ flex: 1 }}>
                {saving ? <RefreshCw size={16} className="spin" /> : <ArrowRightLeft size={16} />} Mover aquí
              </button>
            </div>
          </div>
        ) : (
          <>
            {types.length > 1 && (
              <div ref={typeRowRef} style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '0 16px 10px', scrollbarWidth: 'none' }}>
                {types.map(t => (
                  <button
                    key={t}
                    data-type={t}
                    type="button"
                    onClick={() => { if (t !== type) { setAssets(null); setType(t); } }}
                    style={{
                      flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 11px', borderRadius: '999px',
                      border: `1.5px solid ${t === type ? 'var(--primary)' : 'var(--border-color)'}`,
                      background: t === type ? 'rgba(245, 165, 36, 0.12)' : 'var(--card-bg)',
                      color: t === type ? 'var(--primary)' : 'var(--text-main)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer'
                    }}
                  >
                    {TYPE_ICONS[t]} {getAssetType(t).label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ padding: '0 16px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
                <Search size={14} color="var(--text-muted)" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => { setSearch(e.target.value); setScanInfo(null); }}
                  placeholder="Nombre, etiqueta, serie, usuario..."
                  style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '0.88rem', fontFamily: 'inherit' }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setScanInfo(null); }}
                    aria-label="Limpiar búsqueda"
                    style={{ display: 'flex', padding: '2px', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <X size={15} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  aria-label="Escanear etiqueta"
                  title="Escanear código de barras, QR o texto"
                  style={{
                    display: 'flex', padding: '6px', margin: '-4px -6px -4px 0', borderRadius: '10px', border: 'none',
                    background: 'rgba(245, 165, 36, 0.12)', color: 'var(--primary)', cursor: 'pointer'
                  }}
                >
                  <ScanLine size={17} />
                </button>
              </div>
              {scanInfo && <div style={{ marginTop: '8px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{scanInfo}</div>}
              {error && <div style={{ marginTop: '8px', fontSize: '0.78rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
              {assets === null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <RefreshCw size={14} className="spin" /> Cargando {getAssetType(type).label.toLowerCase()}...
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin coincidencias.</div>
              ) : filtered.map(asset => {
                const computerId = connectedTo(asset);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    disabled={saving}
                    onClick={() => choose(asset)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', border: 'none',
                      borderRadius: '12px', background: 'transparent', textAlign: 'left', cursor: saving ? 'wait' : 'pointer'
                    }}
                  >
                    <span style={{ color: 'var(--primary)', display: 'flex', flexShrink: 0 }}>{TYPE_ICONS[type]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', wordBreak: 'break-word' }}>{asset.name}</span>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {[asset.physicalTag, asset.serial && `S/N ${asset.serial}`, asset.userName].filter(Boolean).join(' · ') || 'Sin datos de identificación'}
                      </span>
                    </span>
                    {type !== 'Computer' && (
                      <span className="badge" style={{
                        flexShrink: 0, fontSize: '0.62rem', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        background: computerId !== undefined ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                        color: computerId !== undefined ? '#b45309' : '#059669'
                      }}>
                        {computerId !== undefined ? `En ${computerNames.get(computerId) || `#${computerId}`}` : 'Libre'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--border-color)' }}>
              <AutoUpdateHint />
            </div>
          </>
        )}
      </div>

      {scanning && (
        <ScannerModal
          fieldLabel={types.length > 1 ? 'Buscar dispositivo' : `Buscar ${getAssetType(types[0]).singular.toLowerCase()}`}
          kind="alphanumeric"
          onResult={value => { applyScan(value); }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>,
    document.body
  );
};

// ── Después de mover un dispositivo: ¿la computadora de donde salió necesita otro?
// Si fue un intercambio entre los dos equipos, se le pasa el del mismo tipo que tenía el destino.

interface RefillProps {
  session: GLPISession;
  itemtype: string;       // tipo del dispositivo movido
  movedId: number;
  movedName: string;
  to: MovedFrom;          // computadora a la que llegó
  from: MovedFrom;        // computadora que se quedó sin él
  onChanged: () => void;
  onClose: () => void;
}

const RefillPrompt: React.FC<RefillProps> = ({ session, itemtype, movedId, movedName, to, from, onChanged, onClose }) => {
  const singular = getAssetType(itemtype).singular.toLowerCase();
  // Del mismo tipo que ya tenía la computadora destino: candidatos para el intercambio
  const [swapOptions, setSwapOptions] = useState<AssetConnection[] | null>(null);
  const [picking, setPicking] = useState<boolean>(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    AssetService.getComputerConnections(session, to.id)
      .then(list => { if (!cancelled) setSwapOptions(list.filter(c => c.itemtype === itemtype && c.itemId !== movedId)); })
      .catch(() => { if (!cancelled) setSwapOptions([]); });
    return () => { cancelled = true; };
  }, [session, to.id, itemtype, movedId]);

  const swap = async (conn: AssetConnection) => {
    setSaving(conn.itemId);
    setError(null);
    try {
      await AssetService.moveConnection(session, from.id, conn.itemtype, conn.itemId);
      onChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo conectar.');
      setSaving(null);
    }
  };

  if (picking) {
    return (
      <ConnectPicker
        session={session}
        title={`Conectar a ${from.name}`}
        types={[itemtype]}
        excludeComputerId={from.id}
        offersRefill={false}
        onPick={(type, asset) => AssetService.moveConnection(session, from.id, type, asset.id).then(onChanged)}
        onClose={onClose}
      />
    );
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="refill-title"
        className="modal-pop"
        style={{
          width: '100%', maxWidth: '420px', maxHeight: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px',
          padding: '16px', background: 'var(--card-bg)', borderRadius: '24px', border: '1px solid var(--border-color)',
          boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.45)'
        }}
      >
        <div id="refill-title" style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>
          ¿{from.name} necesita otro {singular}?
        </div>
        <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
          <strong>{movedName}</strong> pasó de <strong>{from.name}</strong> a <strong>{to.name}</strong>.
          Si fue un cambio entre los dos equipos, conecta a {from.name} el que tenía {to.name}.
        </div>

        {swapOptions === null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={14} className="spin" /> Revisando {to.name}...
          </div>
        ) : swapOptions.map(conn => (
          <button
            key={conn.linkId}
            type="button"
            className="btn-primary"
            onClick={() => swap(conn)}
            disabled={saving !== null}
            style={{ padding: '12px 14px', justifyContent: 'flex-start', textAlign: 'left' }}
          >
            {saving === conn.itemId ? <RefreshCw size={16} className="spin" /> : <ArrowRightLeft size={16} style={{ flexShrink: 0 }} />}
            <span style={{ minWidth: 0 }}>
              Intercambiar: pasar <strong>{conn.name}</strong> a {from.name}
            </span>
          </button>
        ))}

        {error && <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#dc2626' }}>{error}</div>}

        <button type="button" className="btn-secondary" onClick={() => setPicking(true)} disabled={saving !== null} style={{ marginTop: 0 }}>
          <Plus size={16} /> Elegir otro {singular} para {from.name}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving !== null}
          style={{ padding: '8px', border: 'none', background: 'none', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          No, dejarlo así
        </button>
      </div>
    </div>,
    document.body
  );
};

// Datos para preguntar si se repone el dispositivo en la computadora de donde salió
interface RefillState {
  itemtype: string;
  movedId: number;
  movedName: string;
  to: MovedFrom;
  from: MovedFrom;
}

// ── Pestaña "Conexiones" de una computadora: sus monitores, dispositivos, teléfonos e impresoras
export const ComputerConnectionsSection: React.FC<SectionProps> = ({ session, assetId, assetName, onOpenAsset }) => {
  const [connections, setConnections] = useState<AssetConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyLink, setBusyLink] = useState<number | null>(null);
  const [picking, setPicking] = useState<boolean>(false);
  const [refill, setRefill] = useState<RefillState | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    AssetService.getComputerConnections(session, assetId)
      .then(list => { if (!cancelled) { setConnections(list); setError(null); } })
      .catch(err => { if (!cancelled) setError(err.message || 'No se pudieron cargar las conexiones.'); });
    return () => { cancelled = true; };
  }, [session, assetId, reloadKey]);

  const disconnect = async (conn: AssetConnection) => {
    if (!window.confirm(`¿Desconectar ${conn.name} de ${assetName}?`)) return;
    setBusyLink(conn.linkId);
    try {
      await AssetService.disconnect(session, conn.linkId);
      setConnections(prev => (prev || []).filter(c => c.linkId !== conn.linkId));
    } catch (err: any) {
      setError(err.message || 'No se pudo desconectar.');
    } finally {
      setBusyLink(null);
    }
  };

  const grouped = CONNECTABLE_TYPES
    .map(t => ({ type: t, items: (connections || []).filter(c => c.itemtype === t) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setPicking(true)} style={{ marginBottom: '14px' }}>
        <Plus size={18} /> Conectar dispositivo
      </button>

      {error && <div className="card" style={{ color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>{error}</div>}

      {connections === null ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
          <RefreshCw className="spin" size={22} style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: '0.85rem' }}>Consultando conexiones...</div>
        </div>
      ) : grouped.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Esta computadora no tiene monitores, dispositivos, teléfonos ni impresoras conectados.
        </div>
      ) : grouped.map(group => (
        <div key={group.type} className="card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{ color: 'var(--primary)', display: 'flex' }}>{TYPE_ICONS[group.type]}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {getAssetType(group.type).label} ({group.items.length})
            </span>
          </div>
          {group.items.map(conn => (
            <ConnectionRow
              key={conn.linkId}
              icon={<Link2 size={16} />}
              name={conn.name}
              detail={conn.detail}
              typeLabel={getAssetType(conn.itemtype).singular}
              busy={busyLink === conn.linkId}
              onDisconnect={() => disconnect(conn)}
              onOpen={onOpenAsset ? () => onOpenAsset(conn.itemtype, conn.itemId) : undefined}
            />
          ))}
        </div>
      ))}

      {picking && (
        <ConnectPicker
          session={session}
          title={`Conectar a ${assetName}`}
          types={CONNECTABLE_TYPES}
          excludeComputerId={assetId}
          onPick={(itemtype, asset, from) => AssetService.moveConnection(session, assetId, itemtype, asset.id).then(() => {
            setReloadKey(k => k + 1);
            if (from) setRefill({ itemtype, movedId: asset.id, movedName: asset.name, to: { id: assetId, name: assetName }, from });
          })}
          onClose={() => setPicking(false)}
        />
      )}

      {refill && (
        <RefillPrompt
          session={session}
          {...refill}
          onChanged={() => setReloadKey(k => k + 1)}
          onClose={() => setRefill(null)}
        />
      )}
    </>
  );
};

// ── Pestaña "Conexión" de un dispositivo: la computadora a la que está conectado
export const ItemConnectionSection: React.FC<SectionProps> = ({ session, itemtype, assetId, assetName, onOpenAsset }) => {
  const [connections, setConnections] = useState<AssetConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyLink, setBusyLink] = useState<number | null>(null);
  const [picking, setPicking] = useState<boolean>(false);
  const [refill, setRefill] = useState<RefillState | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    AssetService.getItemConnections(session, itemtype, assetId)
      .then(list => { if (!cancelled) { setConnections(list); setError(null); } })
      .catch(err => { if (!cancelled) setError(err.message || 'No se pudo consultar la conexión.'); });
    return () => { cancelled = true; };
  }, [session, itemtype, assetId, reloadKey]);

  const disconnect = async (conn: AssetConnection) => {
    if (!window.confirm(`¿Desconectar ${assetName} de ${conn.name}?`)) return;
    setBusyLink(conn.linkId);
    try {
      await AssetService.disconnect(session, conn.linkId);
      setConnections(prev => (prev || []).filter(c => c.linkId !== conn.linkId));
    } catch (err: any) {
      setError(err.message || 'No se pudo desconectar.');
    } finally {
      setBusyLink(null);
    }
  };

  const connected = connections && connections.length > 0;

  return (
    <>
      {error && <div className="card" style={{ color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>{error}</div>}

      {connections === null ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
          <RefreshCw className="spin" size={22} style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: '0.85rem' }}>Consultando conexión...</div>
        </div>
      ) : (
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            Conectado a
          </div>
          {connected ? connections!.map(conn => (
            <ConnectionRow
              key={conn.linkId}
              icon={TYPE_ICONS.Computer}
              name={conn.name}
              detail={conn.detail}
              typeLabel="Computadora"
              busy={busyLink === conn.linkId}
              onDisconnect={() => disconnect(conn)}
              onOpen={onOpenAsset ? () => onOpenAsset('Computer', conn.computerId) : undefined}
            />
          )) : (
            <div style={{ padding: '10px 0 2px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              No está conectado a ninguna computadora.
            </div>
          )}
        </div>
      )}

      {connections !== null && (
        <button type="button" className="btn-primary" onClick={() => setPicking(true)} style={{ marginBottom: '14px' }}>
          {connected ? <ArrowRightLeft size={18} /> : <Link2 size={18} />} {connected ? 'Cambiar de computadora' : 'Conectar a una computadora'}
        </button>
      )}

      {picking && (
        <ConnectPicker
          session={session}
          title={`Conectar ${assetName} a...`}
          types={['Computer']}
          currentComputerIds={(connections || []).map(c => c.computerId)}
          onPick={(_type, computer, from) => AssetService.moveConnection(session, computer.id, itemtype, assetId).then(() => {
            setReloadKey(k => k + 1);
            if (from) setRefill({ itemtype, movedId: assetId, movedName: assetName, to: { id: computer.id, name: computer.name }, from });
          })}
          onClose={() => setPicking(false)}
        />
      )}

      {refill && (
        <RefillPrompt
          session={session}
          {...refill}
          onChanged={() => setReloadKey(k => k + 1)}
          onClose={() => setRefill(null)}
        />
      )}
    </>
  );
};
