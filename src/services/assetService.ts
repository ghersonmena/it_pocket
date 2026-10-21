import type { GLPISession } from '../types/glpi';
import { GLPIService, PHYSICAL_TAG_FIELD } from './glpiService';
import { savedQueryToSearchParams } from './savedSearchQuery';

// Tipos de activo que maneja el módulo de Activos y los campos propios de cada uno en GLPI
export interface AssetTypeConfig {
  itemtype: string;
  label: string;       // plural, para el selector
  singular: string;
  typeField: string;   // campo FK del tipo (p. ej. computertypes_id)
  typeItemtype: string;
  modelField: string;  // campo FK del modelo
  modelItemtype: string;
  stateVisibility: string; // columna de State que indica si el estado aplica a este tipo
}

export const ASSET_TYPES: AssetTypeConfig[] = [
  { itemtype: 'Computer', label: 'Computadoras', singular: 'Computadora', typeField: 'computertypes_id', typeItemtype: 'ComputerType', modelField: 'computermodels_id', modelItemtype: 'ComputerModel', stateVisibility: 'is_visible_computer' },
  { itemtype: 'Monitor', label: 'Monitores', singular: 'Monitor', typeField: 'monitortypes_id', typeItemtype: 'MonitorType', modelField: 'monitormodels_id', modelItemtype: 'MonitorModel', stateVisibility: 'is_visible_monitor' },
  { itemtype: 'Phone', label: 'Teléfonos', singular: 'Teléfono', typeField: 'phonetypes_id', typeItemtype: 'PhoneType', modelField: 'phonemodels_id', modelItemtype: 'PhoneModel', stateVisibility: 'is_visible_phone' },
  { itemtype: 'Peripheral', label: 'Dispositivos', singular: 'Dispositivo', typeField: 'peripheraltypes_id', typeItemtype: 'PeripheralType', modelField: 'peripheralmodels_id', modelItemtype: 'PeripheralModel', stateVisibility: 'is_visible_peripheral' },
  { itemtype: 'Printer', label: 'Impresoras', singular: 'Impresora', typeField: 'printertypes_id', typeItemtype: 'PrinterType', modelField: 'printermodels_id', modelItemtype: 'PrinterModel', stateVisibility: 'is_visible_printer' },
  { itemtype: 'NetworkEquipment', label: 'Equipos de red', singular: 'Equipo de red', typeField: 'networkequipmenttypes_id', typeItemtype: 'NetworkEquipmentType', modelField: 'networkequipmentmodels_id', modelItemtype: 'NetworkEquipmentModel', stateVisibility: 'is_visible_networkequipment' }
];

// Rubro de documento con el que se clasifican las fotos del activo al inventariarlo:
// DOCUMENTACION INVENTARIO > FOTOS DE ACTIVO (front/documentcategory.form.php?id=13)
export const ASSET_PHOTO_CATEGORY = { id: 13, label: 'Fotos de activo' };

export const getAssetType = (itemtype: string): AssetTypeConfig =>
  ASSET_TYPES.find(t => t.itemtype === itemtype) || ASSET_TYPES[0];

// Fila del listado de activos
export interface AssetSummary {
  id: number;
  name: string;
  serial?: string;
  inventoryNumber?: string;
  physicalTag?: string;
  location?: string;
  state?: string;
  userName?: string; // usuario asignado: nombre completo (o login si no tiene nombre capturado)
}

// Puertos y características de un monitor: en GLPI son casillas (have_*). En la app se eligen
// como etiquetas para no llenar el formulario de casillas.
export const MONITOR_PORTS: { field: string; label: string }[] = [
  { field: 'have_hdmi', label: 'HDMI' },
  { field: 'have_displayport', label: 'DisplayPort' },
  { field: 'have_dvi', label: 'DVI' },
  { field: 'have_subd', label: 'VGA (D-Sub)' },
  { field: 'have_bnc', label: 'BNC' },
  { field: 'have_speaker', label: 'Bocinas' },
  { field: 'have_micro', label: 'Micrófono' },
  { field: 'have_pivot', label: 'Pivote' }
];

// Campos del plugin Campos adicionales (bloque "Etiqueta"). Solo se muestran y guardan en los
// tipos de activo que tienen el bloque configurado (hoy: computadoras).
export type PluginFieldKey = 'physicalTag' | 'acquisitionDate' | 'retirementDate';
const PLUGIN_FIELD_NAMES: Record<PluginFieldKey, string> = {
  physicalTag: PHYSICAL_TAG_FIELD,
  acquisitionDate: 'fechadeadquisicindeequipofield',
  retirementDate: 'fechadebajadeequipofield'
};

// Datos editables de un activo (FKs como IDs; 0 = sin valor)
export interface AssetForm {
  name: string;
  states_id: number;
  typeId: number;
  manufacturers_id: number;
  modelId: number;
  locations_id: number;
  users_id: number;
  serial: string;
  otherserial: string; // número de inventario
  uuid: string;
  physicalTag: string;     // campos del plugin: solo si el tipo los tiene
  acquisitionDate: string; // "YYYY-MM-DD" o ""
  retirementDate: string;  // "YYYY-MM-DD" o ""
  comment: string;
  // Solo monitores
  size: string;            // pulgadas ("23.8"); "" = sin capturar
  monitorPorts: string[];  // campos have_* marcados, en el orden de MONITOR_PORTS
}

export const emptyAssetForm = (): AssetForm => ({
  name: '', states_id: 0, typeId: 0, manufacturers_id: 0, modelId: 0, locations_id: 0,
  users_id: 0, serial: '', otherserial: '', uuid: '', physicalTag: '', acquisitionDate: '', retirementDate: '', comment: '',
  size: '', monitorPorts: []
});

// Sistema operativo y hardware de un equipo (lo que llena el inventario automático de GLPI)
export interface AssetTechInfo {
  os?: { name: string; version?: string; architecture?: string; kernel?: string; installDate?: string };
  processors: { name: string; cores?: number; threads?: number; frequencyMHz?: number }[];
  memory: { totalMB: number; modules: { type: string; sizeMB: number }[] };
  disks: { name: string; mountpoint: string; filesystem?: string; totalMB: number; freeMB: number }[];
}

export interface IpAddressInfo {
  address: string;
  version: number;   // 4 o 6
  useful: boolean;   // false para loopback y link-local (127.0.0.1, ::1, fe80::, 169.254.x.x)
}

export interface NetworkPortInfo {
  id: number;
  name: string;
  mac?: string;
  ips: IpAddressInfo[];
  virtual: boolean;  // interfaz virtual (loopback, Docker, puentes, VPN...): se muestra al final
}

// Interfaces que no son tarjetas de red físicas
const VIRTUAL_PORT = /^(lo|loopback|docker\d*|br-|virbr|veth|vmnet|vboxnet|tun|tap|wg|zt|tailscale|cni|flannel|kube)/i;

// Tipos que se conectan a una computadora (pestaña "Conexiones" de GLPI, tabla Computer_Item).
// Los equipos de red no: se enlazan por puertos de red.
export const CONNECTABLE_TYPES = ['Monitor', 'Peripheral', 'Phone', 'Printer'];

// Conexión computadora ↔ dispositivo
export interface AssetConnection {
  linkId: number;     // id del registro Computer_Item (para desconectar)
  itemtype: string;   // tipo del dispositivo (Monitor, Peripheral...)
  itemId: number;
  computerId: number;
  name: string;       // nombre del otro extremo (dispositivo o computadora, según desde dónde se mire)
  detail?: string;    // etiqueta / serie / usuario, para reconocerlo
}

// Búsqueda guardada de GLPI ("filtro") para un tipo de activo
export interface SavedFilter {
  id: number;
  name: string;
  query: string;       // consulta tal como la guarda GLPI
  isPrivate: boolean;  // solo visible para quien la creó
  isDefault: boolean;  // la predeterminada (⭐) del usuario para este tipo
}

export interface DropdownOption {
  id: number;
  label: string;
}

// Opciones de búsqueda estándar de GLPI para activos
const SO = { name: '1', id: '2', location: '3', serial: '5', inventory: '6', state: '31', user: '70' };

// Un activo por ID (defensa extra: un repetido confunde a React y deja tarjetas fantasma)
const dedupeById = <T extends { id: number }>(list: T[]): T[] => {
  const seen = new Set<number>();
  return list.filter(item => (seen.has(item.id) ? false : (seen.add(item.id), true)));
};

// Por nombre, con números en orden natural ("PC-2" antes que "PC-10"); empates por ID
const sortByName = <T extends { id: number; name: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }) || a.id - b.id);

const authHeaders = (session: GLPISession) => ({
  'Content-Type': 'application/json',
  'App-Token': session.appToken,
  'Session-Token': session.sessionToken
});

const readError = async (res: Response): Promise<string> => {
  try {
    const err = await res.json();
    if (Array.isArray(err) && err[1]) return `: ${err[1]}`;
  } catch { /* respuesta sin JSON */ }
  return '';
};

// ── Datos de ejemplo (modo demo) ────────────────────────────────────────────
let mockSeq = 1000;
const MOCK_ASSETS: Record<string, (AssetForm & { id: number })[]> = {
  Computer: [
    { ...emptyAssetForm(), id: 89, name: 'PC-SIS-01', serial: 'MXL1234ABC', otherserial: 'INV-0103', physicalTag: 'PC-000103', locations_id: 2, states_id: 1, users_id: 2 }
  ],
  Monitor: [{ ...emptyAssetForm(), id: 12, name: 'MON-SIS-01', serial: 'CN0ABC123', locations_id: 1, states_id: 1 }]
};
const MOCK_DROPDOWNS: Record<string, DropdownOption[]> = {
  Location: [
    { id: 1, label: 'Oficina Central > Planta Baja > Sistemas > Posición 8' },
    { id: 2, label: 'Oficina Central > Planta Alta > Ventas > Fila 3 > Posición 4' }
  ],
  State: [{ id: 1, label: 'En uso' }, { id: 2, label: 'En almacén' }],
  Manufacturer: [{ id: 1, label: 'Dell' }, { id: 2, label: 'HP' }, { id: 3, label: 'Lenovo' }]
};

const MOCK_TECH: AssetTechInfo = {
  os: { name: 'Windows 11 Pro', version: '23H2', architecture: '64-bit', installDate: '2025-02-10' },
  processors: [{ name: 'Intel(R) Core(TM) i5-12400', cores: 6, threads: 12 }],
  memory: { totalMB: 16384, modules: [{ type: 'DDR4 - DIMM', sizeMB: 8192 }, { type: 'DDR4 - DIMM', sizeMB: 8192 }] },
  disks: [{ name: 'C:', mountpoint: 'C:', filesystem: 'NTFS', totalMB: 487000, freeMB: 212000 }]
};

const MOCK_NETWORK: NetworkPortInfo[] = [
  { id: 1, name: 'Ethernet', mac: '00:1a:2b:3c:4d:5e', ips: [{ address: '192.168.1.50', version: 4, useful: true }], virtual: false },
  { id: 2, name: 'Loopback', ips: [{ address: '127.0.0.1', version: 4, useful: false }], virtual: true }
];

const MOCK_CONNECTIONS: { linkId: number; itemtype: string; itemId: number; computerId: number }[] = [
  { linkId: 1, itemtype: 'Monitor', itemId: 12, computerId: 89 }
];

const MOCK_FILTERS: (SavedFilter & { itemtype: string })[] = [
  { id: 1, itemtype: 'Computer', name: 'EQUIPOS EN USO', query: 'criteria[0][field]=31&criteria[0][searchtype]=equals&criteria[0][value]=1', isPrivate: false, isDefault: true },
  { id: 2, itemtype: 'Computer', name: 'EQUIPOS EN ALMACÉN', query: 'criteria[0][field]=31&criteria[0][searchtype]=equals&criteria[0][value]=2', isPrivate: true, isDefault: false }
];

export class AssetService {
  private static dropdownCache = new Map<string, Promise<DropdownOption[]>>();

  private static pluginOptionsCache = new Map<string, Promise<Partial<Record<PluginFieldKey, string>>>>();

  /**
   * Campos del plugin que tiene este tipo de activo y su número de opción de búsqueda (el plugin
   * lo asigna al crear el campo; se busca por nombre de campo). Vacío si el tipo no tiene el bloque.
   */
  static getPluginFieldOptions(session: GLPISession, itemtype: string): Promise<Partial<Record<PluginFieldKey, string>>> {
    if (session.isMock) {
      return Promise.resolve(itemtype === 'Computer' ? { physicalTag: '1', acquisitionDate: '2', retirementDate: '3' } : {});
    }
    const key = `${session.baseUrl}#${itemtype}`;
    if (!this.pluginOptionsCache.has(key)) {
      const promise = (async () => {
        const res = await fetch(`${session.baseUrl}/apirest.php/listSearchOptions/${itemtype}`, { headers: authHeaders(session) });
        if (!res.ok) return {};
        const options: Record<string, any> = await res.json();
        const found: Partial<Record<PluginFieldKey, string>> = {};
        (Object.keys(PLUGIN_FIELD_NAMES) as PluginFieldKey[]).forEach(fieldKey => {
          const entry = Object.entries(options || {}).find(([, opt]) => opt?.field === PLUGIN_FIELD_NAMES[fieldKey]);
          if (entry) found[fieldKey] = entry[0];
        });
        return found;
      })();
      promise.catch(() => this.pluginOptionsCache.delete(key));
      this.pluginOptionsCache.set(key, promise);
    }
    return this.pluginOptionsCache.get(key)!;
  }

  /**
   * Búsquedas guardadas de GLPI para un tipo de activo. GLPI devuelve las del usuario de la
   * sesión (incluidas sus privadas) más las públicas de otros, así que cada usuario ve las suyas.
   */
  static async getSavedFilters(session: GLPISession, itemtype: string): Promise<SavedFilter[]> {
    if (session.isMock) return MOCK_FILTERS.filter(f => f.itemtype === itemtype);

    const [searches, defaults] = await Promise.all([
      GLPIService.fetchAllPages(session, 'SavedSearch'),
      // Predeterminada por usuario y tipo (la ⭐ en GLPI); si falla, simplemente no hay ⭐
      GLPIService.fetchAllPages(session, 'SavedSearch_User').catch(() => [])
    ]);
    const defaultIds = new Set(
      defaults
        .filter((d: any) => d.itemtype === itemtype && Number(d.users_id) === Number(session.userId))
        .map((d: any) => Number(d.savedsearches_id))
    );
    return searches
      .filter((s: any) => s.itemtype === itemtype && Number(s.type) === 1) // type 1 = búsqueda
      .map((s: any) => ({
        id: Number(s.id),
        name: String(s.name || `Búsqueda #${s.id}`),
        query: String(s.query || ''),
        isPrivate: Number(s.is_private) === 1,
        isDefault: defaultIds.has(Number(s.id))
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, 'es'));
  }

  /** Cuántos activos devuelve una búsqueda guardada (el número que GLPI muestra junto a cada una). */
  static async countSavedFilter(session: GLPISession, itemtype: string, filter: SavedFilter): Promise<number> {
    if (session.isMock) return (await this.listAssets(session, itemtype, filter)).length;
    const params = savedQueryToSearchParams(filter.query);
    params.set('range', '0-0');
    params.append('forcedisplay[0]', SO.id);
    const res = await fetch(`${session.baseUrl}/apirest.php/search/${itemtype}?${params}`, { headers: authHeaders(session) });
    if (!res.ok) throw new Error(`La búsqueda "${filter.name}" no se pudo ejecutar (${res.status})${await readError(res)}`);
    return Number((await res.json())?.totalcount) || 0;
  }

  /**
   * Activos de un tipo (excluye papelera y plantillas), ordenados por nombre. Con `filter`, solo
   * los que cumplen esa búsqueda guardada de GLPI.
   */
  static async listAssets(session: GLPISession, itemtype: string, filter?: SavedFilter | null): Promise<AssetSummary[]> {
    if (session.isMock) {
      const locations = MOCK_DROPDOWNS.Location;
      return (MOCK_ASSETS[itemtype] || []).filter(a => !filter || a.states_id === Number(new URLSearchParams(filter.query).get('criteria[0][value]'))).map(a => ({
        id: a.id, name: a.name, serial: a.serial, inventoryNumber: a.otherserial, physicalTag: a.physicalTag,
        location: locations.find(l => l.id === a.locations_id)?.label,
        state: MOCK_DROPDOWNS.State.find(s => s.id === a.states_id)?.label,
        userName: a.users_id === 2 ? 'Juan Pérez' : undefined
      }));
    }

    // El buscador da el login del usuario (opción 70); se traduce a nombre completo con el
    // directorio de usuarios. Si el directorio falla, se muestra el login.
    const [tagOption, users] = await Promise.all([
      GLPIService.getPhysicalTagOption(session, itemtype).catch(() => null),
      this.getAllUsers(session).catch(() => [] as any[])
    ]);
    const fullNameByLogin = new Map<string, string>(
      users.map((u: any) => [String(u.name || '').toLowerCase(), GLPIService.userDisplayName(u)])
    );
    const display = [SO.name, SO.id, SO.location, SO.serial, SO.inventory, SO.state, SO.user, ...(tagOption ? [tagOption] : [])];
    const result: AssetSummary[] = [];
    const pageSize = 50; // GLPI recorta cada respuesta a list_limit_max (50 por defecto)

    for (let start = 0; start < 20000; start += pageSize) {
      // Criterios de la búsqueda guardada (si hay) + columnas, orden y página de la app.
      // Se pagina ordenando por ID (único): ordenar por nombre con nombres repetidos (25
      // "Teclado Inalámbrico K220") hacía que un activo saliera en dos páginas y otro en ninguna
      const params = filter ? savedQueryToSearchParams(filter.query) : new URLSearchParams();
      params.set('sort', SO.id);
      params.set('order', 'ASC');
      params.set('range', `${start}-${start + pageSize - 1}`);
      display.forEach((opt, i) => params.set(`forcedisplay[${i}]`, opt));
      const res = await fetch(`${session.baseUrl}/apirest.php/search/${itemtype}?${params}`, { headers: authHeaders(session) });
      if (!res.ok) {
        if (start === 0) {
          throw new Error(filter
            ? `La búsqueda "${filter.name}" no se pudo ejecutar (${res.status})${await readError(res)}`
            : `No se pudieron cargar los activos (${res.status})${await readError(res)}`);
        }
        break;
      }
      const body = await res.json();
      const rows: any[] = Array.isArray(body?.data) ? body.data : [];
      rows.forEach(row => result.push({
        id: Number(row[SO.id]),
        name: row[SO.name] || `${getAssetType(itemtype).singular} #${row[SO.id]}`,
        serial: row[SO.serial] || undefined,
        inventoryNumber: row[SO.inventory] || undefined,
        physicalTag: tagOption ? row[tagOption] || undefined : undefined,
        location: row[SO.location] || undefined,
        state: row[SO.state] || undefined,
        userName: row[SO.user]
          ? fullNameByLogin.get(String(row[SO.user]).toLowerCase()) || String(row[SO.user])
          : undefined
      }));
      const total = Number(body?.totalcount) || 0;
      if (rows.length === 0 || result.length >= total) break;
    }
    return sortByName(dedupeById(result));
  }

  /** Datos editables de un activo. */
  static async getAsset(session: GLPISession, itemtype: string, id: number): Promise<AssetForm> {
    const config = getAssetType(itemtype);
    if (session.isMock) {
      const found = (MOCK_ASSETS[itemtype] || []).find(a => a.id === id);
      if (!found) throw new Error('Activo no encontrado');
      return { ...found };
    }

    // Los campos del plugin no vienen en la ficha: se leen con el buscador, en paralelo
    const pluginOptions = await this.getPluginFieldOptions(session, itemtype).catch(() => ({}));
    const optionIds = Object.values(pluginOptions) as string[];
    const pluginParams = new URLSearchParams({
      'criteria[0][field]': SO.id, 'criteria[0][searchtype]': 'equals', 'criteria[0][value]': String(id)
    });
    optionIds.forEach((opt, i) => pluginParams.set(`forcedisplay[${i}]`, opt));
    const [itemRes, pluginRes] = await Promise.all([
      fetch(`${session.baseUrl}/apirest.php/${itemtype}/${id}`, { headers: authHeaders(session) }),
      optionIds.length
        ? fetch(`${session.baseUrl}/apirest.php/search/${itemtype}?${pluginParams}`, { headers: authHeaders(session) })
        : Promise.resolve(null)
    ]);
    if (!itemRes.ok) throw new Error(`No se pudo cargar el activo (${itemRes.status})${await readError(itemRes)}`);
    const item = await itemRes.json();
    const pluginRow = pluginRes && pluginRes.ok ? (await pluginRes.json())?.data?.[0] : null;
    const pluginValue = (fieldKey: PluginFieldKey) => {
      const opt = (pluginOptions as Partial<Record<PluginFieldKey, string>>)[fieldKey];
      return (opt && pluginRow?.[opt]) ? String(pluginRow[opt]) : '';
    };

    return {
      name: item.name || '',
      states_id: Number(item.states_id) || 0,
      typeId: Number(item[config.typeField]) || 0,
      manufacturers_id: Number(item.manufacturers_id) || 0,
      modelId: Number(item[config.modelField]) || 0,
      locations_id: Number(item.locations_id) || 0,
      users_id: Number(item.users_id) || 0,
      serial: item.serial || '',
      otherserial: item.otherserial || '',
      uuid: item.uuid || '',
      physicalTag: pluginValue('physicalTag'),
      acquisitionDate: pluginValue('acquisitionDate').slice(0, 10),
      retirementDate: pluginValue('retirementDate').slice(0, 10),
      comment: item.comment || '',
      // GLPI guarda el tamaño como decimal ("23.80"); 0 significa sin capturar
      size: Number(item.size) > 0 ? String(Number(item.size)) : '',
      monitorPorts: itemtype === 'Monitor' ? MONITOR_PORTS.filter(p => Number(item[p.field]) === 1).map(p => p.field) : []
    };
  }

  private static toInput(itemtype: string, form: AssetForm, pluginFields: PluginFieldKey[]): Record<string, unknown> {
    const config = getAssetType(itemtype);
    const input: Record<string, unknown> = {
      name: form.name.trim(),
      states_id: form.states_id,
      [config.typeField]: form.typeId,
      manufacturers_id: form.manufacturers_id,
      [config.modelField]: form.modelId,
      locations_id: form.locations_id,
      users_id: form.users_id,
      serial: form.serial.trim(),
      otherserial: form.otherserial.trim(),
      uuid: form.uuid.trim(),
      comment: form.comment
    };
    if (itemtype === 'Monitor') {
      const inches = Number(form.size.replace(',', '.'));
      input.size = Number.isFinite(inches) && inches > 0 ? inches : 0;
      MONITOR_PORTS.forEach(p => { input[p.field] = form.monitorPorts.includes(p.field) ? 1 : 0; });
    }
    // El plugin Campos adicionales guarda sus campos si vienen junto con los datos del activo
    pluginFields.forEach(fieldKey => {
      input[PLUGIN_FIELD_NAMES[fieldKey]] = form[fieldKey].trim();
    });
    return input;
  }

  /** Crea un activo y devuelve su ID. */
  static async createAsset(session: GLPISession, itemtype: string, form: AssetForm, pluginFields: PluginFieldKey[]): Promise<number> {
    if (session.isMock) {
      const id = ++mockSeq;
      (MOCK_ASSETS[itemtype] ||= []).push({ ...form, id });
      return id;
    }
    const res = await fetch(`${session.baseUrl}/apirest.php/${itemtype}`, {
      method: 'POST',
      headers: authHeaders(session),
      body: JSON.stringify({ input: this.toInput(itemtype, form, pluginFields) })
    });
    if (!res.ok) throw new Error(`No se pudo crear el activo (${res.status})${await readError(res)}`);
    const created = await res.json();
    const id = Number(created?.id);
    if (!id) throw new Error(`GLPI no creó el activo${created?.message ? `: ${created.message}` : ''}`);
    return id;
  }

  /** Guarda los cambios de un activo existente. */
  static async updateAsset(session: GLPISession, itemtype: string, id: number, form: AssetForm, pluginFields: PluginFieldKey[]): Promise<void> {
    if (session.isMock) {
      const list = MOCK_ASSETS[itemtype] || [];
      const index = list.findIndex(a => a.id === id);
      if (index >= 0) list[index] = { ...form, id };
      return;
    }
    await GLPIService.putItem(session, itemtype, id, this.toInput(itemtype, form, pluginFields), 'el activo');
  }

  /** Sistema operativo, procesador, memoria RAM y discos de un equipo. */
  static async getTechInfo(session: GLPISession, itemtype: string, id: number): Promise<AssetTechInfo> {
    if (session.isMock) return MOCK_TECH;

    const text = (value: unknown) => (typeof value === 'string' && value !== '0' ? GLPIService.htmlToPlainText(value) : undefined);
    // expand_dropdowns trae los nombres (SO, procesador, tipo de memoria) en lugar de IDs
    const expanded = (path: string) =>
      fetch(`${session.baseUrl}/apirest.php/${itemtype}/${id}/${path}?expand_dropdowns=true&range=0-200`, { headers: authHeaders(session) })
        .then(res => (res.ok ? res.json() : []))
        .then(rows => (Array.isArray(rows) ? rows.filter((r: any) => !Number(r.is_deleted)) : []))
        .catch(() => [] as any[]);

    const [osRows, cpuRows, memRows, diskRows] = await Promise.all([
      expanded('Item_OperatingSystem'),
      expanded('Item_DeviceProcessor'),
      expanded('Item_DeviceMemory'),
      expanded('Item_Disk')
    ]);

    const os = osRows[0];
    const modules = memRows.map((m: any) => ({ type: text(m.devicememories_id) || 'Memoria', sizeMB: Number(m.size) || 0 }));
    return {
      os: os ? {
        name: text(os.operatingsystems_id) || 'Sistema operativo',
        version: text(os.operatingsystemversions_id),
        architecture: text(os.operatingsystemarchitectures_id),
        kernel: text(os.operatingsystemkernelversions_id),
        installDate: os.install_date || undefined
      } : undefined,
      processors: cpuRows.map((c: any) => ({
        name: text(c.deviceprocessors_id) || 'Procesador',
        cores: Number(c.nbcores) || undefined,
        threads: Number(c.nbthreads) || undefined,
        frequencyMHz: Number(c.frequency) || undefined
      })),
      memory: { totalMB: modules.reduce((sum, m) => sum + m.sizeMB, 0), modules },
      // Solo discos reales: los sistemas de archivos virtuales (efivars, tmpfs...) reportan 0 MB
      disks: diskRows
        .filter((d: any) => !Number(d.is_deleted) && Number(d.totalsize) > 0)
        .map((d: any) => ({
          name: d.name || d.mountpoint || d.device || 'Disco',
          mountpoint: d.mountpoint || '',
          filesystem: text(d.filesystems_id),
          totalMB: Number(d.totalsize) || 0,
          freeMB: Number(d.freesize) || 0
        }))
    };
  }

  /**
   * Puertos de red del activo con sus IPs. GLPI guarda Puerto → Nombre de red → IP; las IPs se
   * traen en una sola consulta (por mainitems_id) y se asignan a su puerto por el nombre de red.
   */
  static async getNetwork(session: GLPISession, itemtype: string, id: number): Promise<NetworkPortInfo[]> {
    if (session.isMock) return MOCK_NETWORK;

    const isUseful = (ip: string) =>
      !/^127\./.test(ip) && ip !== '::1' && !/^fe80:/i.test(ip) && !/^169\.254\./.test(ip);

    const ports = (await GLPIService.fetchAllPages(session, `${itemtype}/${id}/NetworkPort`))
      .filter((p: any) => !Number(p.is_deleted));

    // Nombre de red (NetworkName) de cada puerto → id de puerto
    const portOfName = new Map<number, number>();
    await Promise.all(ports.map(async (port: any) => {
      const names = await GLPIService.fetchAllPages(session, `NetworkPort/${port.id}/NetworkName`).catch(() => [] as any[]);
      names.forEach((n: any) => portOfName.set(Number(n.id), Number(port.id)));
    }));

    // Todas las IPs del activo. searchText es "contiene", así que se filtra el id exacto
    const ips: any[] = [];
    for (let start = 0; start < 5000; start += 50) {
      const res = await fetch(
        `${session.baseUrl}/apirest.php/IPAddress?searchText[mainitems_id]=${id}&range=${start}-${start + 49}`,
        { headers: authHeaders(session) }
      );
      if (!res.ok) break;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      ips.push(...rows);
      if (rows.length < 50 && res.status === 200) break;
    }

    const byPort = new Map<number, IpAddressInfo[]>();
    ips
      .filter((ip: any) => ip.mainitemtype === itemtype && Number(ip.mainitems_id) === id && !Number(ip.is_deleted))
      .forEach((ip: any) => {
        const portId = portOfName.get(Number(ip.items_id)) ?? 0;
        if (!byPort.has(portId)) byPort.set(portId, []);
        byPort.get(portId)!.push({ address: String(ip.name), version: Number(ip.version) || 4, useful: isUseful(String(ip.name)) });
      });

    const sortIps = (list: IpAddressInfo[]) =>
      list.sort((a, b) => Number(b.useful) - Number(a.useful) || a.version - b.version || a.address.localeCompare(b.address));

    const result: NetworkPortInfo[] = ports.map((p: any) => ({
      id: Number(p.id),
      name: p.name || `Puerto ${p.logical_number ?? p.id}`,
      mac: p.mac && p.mac !== '00:00:00:00:00:00' ? p.mac : undefined,
      ips: sortIps(byPort.get(Number(p.id)) || []),
      virtual: VIRTUAL_PORT.test(String(p.name || ''))
    }));
    // IPs sin puerto identificado (p. ej. capturadas a mano)
    if (byPort.has(0)) result.push({ id: 0, name: 'Sin puerto', ips: sortIps(byPort.get(0)!), virtual: false });

    // Primero las tarjetas físicas con IPs útiles; al final las virtuales y las que no tienen IP
    const rank = (p: NetworkPortInfo) => (p.virtual ? 2 : 0) + (p.ips.some(ip => ip.useful) ? 0 : 1);
    return result.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }

  // ── Conexiones (Computer_Item) ─────────────────────────────────────────────

  private static describe(asset?: AssetSummary): string | undefined {
    if (!asset) return undefined;
    return [asset.physicalTag, asset.serial && `S/N ${asset.serial}`, asset.userName].filter(Boolean).join(' · ') || undefined;
  }

  /** Todas las conexiones del sistema (son pocas: se descargan completas de una vez). */
  static async getAllConnections(session: GLPISession): Promise<{ linkId: number; itemtype: string; itemId: number; computerId: number }[]> {
    if (session.isMock) return MOCK_CONNECTIONS.map(c => ({ ...c }));
    const rows = await GLPIService.fetchAllPages(session, 'Computer_Item');
    return rows
      .filter((r: any) => !Number(r.is_deleted))
      .map((r: any) => ({ linkId: Number(r.id), itemtype: String(r.itemtype), itemId: Number(r.items_id), computerId: Number(r.computers_id) }));
  }

  /** Dispositivos conectados a una computadora, con nombre y datos para reconocerlos. */
  static async getComputerConnections(session: GLPISession, computerId: number): Promise<AssetConnection[]> {
    const links = (await this.getAllConnections(session)).filter(c => c.computerId === computerId);
    const types = [...new Set(links.map(l => l.itemtype))];
    const listsByType = new Map<string, AssetSummary[]>();
    await Promise.all(types.map(async t => {
      listsByType.set(t, await this.listAssets(session, t).catch(() => [] as AssetSummary[]));
    }));
    return links.map(link => {
      const asset = listsByType.get(link.itemtype)?.find(a => a.id === link.itemId);
      return { ...link, name: asset?.name || `${getAssetType(link.itemtype).singular} #${link.itemId}`, detail: this.describe(asset) };
    });
  }

  /** Computadora(s) a la(s) que está conectado un dispositivo. */
  static async getItemConnections(session: GLPISession, itemtype: string, itemId: number): Promise<AssetConnection[]> {
    const links = (await this.getAllConnections(session)).filter(c => c.itemtype === itemtype && c.itemId === itemId);
    if (links.length === 0) return [];
    const computers = await this.listAssets(session, 'Computer').catch(() => [] as AssetSummary[]);
    return links.map(link => {
      const computer = computers.find(c => c.id === link.computerId);
      return { ...link, name: computer?.name || `Computadora #${link.computerId}`, detail: this.describe(computer) };
    });
  }

  /** Conecta un dispositivo a una computadora. */
  static async connect(session: GLPISession, computerId: number, itemtype: string, itemId: number): Promise<void> {
    if (session.isMock) {
      MOCK_CONNECTIONS.push({ linkId: Date.now(), itemtype, itemId, computerId });
      return;
    }
    const res = await fetch(`${session.baseUrl}/apirest.php/Computer_Item`, {
      method: 'POST',
      headers: authHeaders(session),
      body: JSON.stringify({ input: { computers_id: computerId, itemtype, items_id: itemId } })
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !Number(body?.id)) {
      const detail = Array.isArray(body) && body[1] ? `: ${body[1]}` : body?.message ? `: ${body.message}` : '';
      throw new Error(`No se pudo conectar (${res.status})${detail}`);
    }
  }

  /** Quita una conexión (borra el registro Computer_Item). */
  static async disconnect(session: GLPISession, linkId: number): Promise<void> {
    if (session.isMock) {
      const i = MOCK_CONNECTIONS.findIndex(c => c.linkId === linkId);
      if (i >= 0) MOCK_CONNECTIONS.splice(i, 1);
      return;
    }
    const res = await fetch(`${session.baseUrl}/apirest.php/Computer_Item/${linkId}?force_purge=true`, {
      method: 'DELETE',
      headers: authHeaders(session)
    });
    if (!res.ok) throw new Error(`No se pudo desconectar (${res.status})${await readError(res)}`);
  }

  /**
   * Conecta un dispositivo a una computadora; si ya estaba conectado a otra, primero lo
   * desconecta de ella (en GLPI un monitor/dispositivo "unitario" solo puede estar en una).
   */
  static async moveConnection(session: GLPISession, computerId: number, itemtype: string, itemId: number): Promise<void> {
    const current = (await this.getAllConnections(session)).filter(c => c.itemtype === itemtype && c.itemId === itemId);
    if (current.some(c => c.computerId === computerId)) return; // ya está conectado aquí
    for (const link of current) await this.disconnect(session, link.linkId);
    await this.connect(session, computerId, itemtype, itemId);
  }

  /**
   * Activos de todos los tipos que están en una ubicación o debajo de ella (búsqueda "under" de
   * GLPI: una marca de "Hilera 5" muestra lo de sus posiciones).
   */
  static async listAssetsAtLocation(session: GLPISession, locationId: number): Promise<(AssetSummary & { itemtype: string })[]> {
    if (session.isMock) {
      return ASSET_TYPES.flatMap(t => (MOCK_ASSETS[t.itemtype] || [])
        .filter(a => a.locations_id === locationId)
        .map(a => ({ id: a.id, name: a.name, serial: a.serial, physicalTag: a.physicalTag, itemtype: t.itemtype })));
    }
    const lists = await Promise.all(ASSET_TYPES.map(async t => {
      const found: (AssetSummary & { itemtype: string })[] = [];
      // GLPI entrega máximo 50 por respuesta: se recorren las páginas, ordenadas por ID (único)
      for (let start = 0; start < 5000; start += 50) {
        const params = new URLSearchParams({
          'criteria[0][field]': SO.location,
          'criteria[0][searchtype]': 'under',
          'criteria[0][value]': String(locationId),
          'forcedisplay[0]': SO.name,
          'forcedisplay[1]': SO.id,
          'forcedisplay[2]': SO.location,
          'forcedisplay[3]': SO.serial,
          range: `${start}-${start + 49}`,
          sort: SO.id,
          order: 'ASC'
        });
        const res = await fetch(`${session.baseUrl}/apirest.php/search/${t.itemtype}?${params}`, { headers: authHeaders(session) });
        if (!res.ok) break;
        const body = await res.json();
        const rows: any[] = body?.data || [];
        rows.forEach(row => found.push({
          itemtype: t.itemtype,
          id: Number(row[SO.id]),
          name: row[SO.name] || `${t.singular} #${row[SO.id]}`,
          serial: row[SO.serial] || undefined,
          location: row[SO.location] || undefined
        }));
        if (rows.length === 0 || found.length >= (Number(body?.totalcount) || 0)) break;
      }
      return sortByName(dedupeById(found));
    }));
    return lists.flat();
  }

  /** Opciones de un desplegable de GLPI (se cachean durante la sesión). */
  static getDropdown(session: GLPISession, dropdownItemtype: string, visibilityField?: string): Promise<DropdownOption[]> {
    if (session.isMock) return Promise.resolve(MOCK_DROPDOWNS[dropdownItemtype] || []);

    const key = `${session.sessionToken}#${dropdownItemtype}#${visibilityField || ''}`;
    if (!this.dropdownCache.has(key)) {
      const promise = GLPIService.fetchAllPages(session, dropdownItemtype).then(rows =>
        rows
          // Estados: GLPI permite limitar en qué tipos de activo se usa cada uno
          .filter((row: any) => !visibilityField || row[visibilityField] === undefined || Number(row[visibilityField]) === 1)
          .map((row: any) => ({
            id: Number(row.id),
            // Ubicaciones y estados jerárquicos traen la ruta completa en completename
            label: GLPIService.htmlToPlainText(String(row.completename || row.name || `#${row.id}`))
          }))
          .sort((a, b) => a.label.localeCompare(b.label, 'es'))
      );
      promise.catch(() => this.dropdownCache.delete(key));
      this.dropdownCache.set(key, promise);
    }
    return this.dropdownCache.get(key)!;
  }

  private static usersCache = new Map<string, Promise<any[]>>();

  /** Usuarios no borrados de GLPI (activos e inactivos), descargados una vez por sesión. */
  private static getAllUsers(session: GLPISession): Promise<any[]> {
    const key = session.sessionToken;
    if (!this.usersCache.has(key)) {
      const promise = GLPIService.fetchAllPages(session, 'User')
        .then(rows => rows.filter((u: any) => !Number(u.is_deleted)));
      promise.catch(() => this.usersCache.delete(key));
      this.usersCache.set(key, promise);
    }
    return this.usersCache.get(key)!;
  }

  /**
   * Usuarios para el campo "Usuario" del activo: TODOS los no borrados, no solo los activos.
   * En GLPI la mayoría de quienes tienen un equipo asignado son cuentas inactivas (no inician
   * sesión), así que se incluyen marcadas como "(inactivo)".
   */
  static getUserOptions(session: GLPISession): Promise<DropdownOption[]> {
    if (session.isMock) return GLPIService.getActiveUsers(session).then(users => users.map(u => ({ id: u.id, label: u.name })));

    const key = `${session.sessionToken}#User`;
    if (!this.dropdownCache.has(key)) {
      const promise = this.getAllUsers(session).then(rows =>
        rows
          .map((u: any) => ({
            id: Number(u.id),
            label: `${GLPIService.userDisplayName(u)}${Number(u.is_active) === 1 ? '' : ' (inactivo)'}`
          }))
          .sort((a, b) => a.label.localeCompare(b.label, 'es'))
      );
      promise.catch(() => this.dropdownCache.delete(key));
      this.dropdownCache.set(key, promise);
    }
    return this.dropdownCache.get(key)!;
  }
}
