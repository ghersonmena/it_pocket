// Croquis interactivos de ubicaciones.
//
// GLPI no tiene planos de oficina, así que todo se guarda con lo que ya trae, sin plugins ni
// base de datos extra (cualquier GLPI con la API activa sirve):
//  - El croquis de un piso/área es un Document de GLPI (la imagen PNG/JPG) ligado a esa
//    ubicación (Document_Item → Location).
//  - Las marcas van en el campo "comentarios" de ese mismo documento, como JSON:
//      { "glpiMobileFloorPlan": 1, "markers": [ { "l": <id de ubicación>, "x": 0.63, "y": 0.28 } ] }
//    x / y son fracciones (0..1) del ancho y alto de la imagen: no dependen de la resolución
//    ni de la pantalla. Las marcas apuntan a ubicaciones por ID, así que renombrarlas no las rompe.

import type { GLPISession } from '../types/glpi';
import { GLPIService } from './glpiService';

export interface LocationNode {
  id: number;
  name: string;
  completename: string;
  parentId: number;
  level: number;
}

export interface FloorMarker {
  l: number; // id de la ubicación marcada
  x: number; // 0..1 sobre el ancho de la imagen
  y: number; // 0..1 sobre el alto
}

export interface FloorPlan {
  documentId: number;
  locationId: number;   // ubicación (piso/área) a la que pertenece el croquis
  name: string;
  markers: FloorMarker[];
  rawComment: string;   // comentario tal como se leyó (para detectar cambios de otra persona)
}

const PLAN_KEY = 'glpiMobileFloorPlan';

const headers = (session: GLPISession) => ({
  'Content-Type': 'application/json',
  'App-Token': session.appToken,
  'Session-Token': session.sessionToken
});

const parseMarkers = (comment: unknown): FloorMarker[] | null => {
  if (typeof comment !== 'string' || !comment.includes(PLAN_KEY)) return null;
  try {
    // GLPI puede devolver el comentario con entidades HTML escapadas
    const text = comment.includes('&quot;') ? GLPIService.htmlToPlainText(comment) : comment;
    const data = JSON.parse(text);
    if (!data || data[PLAN_KEY] !== 1 || !Array.isArray(data.markers)) return null;
    return data.markers
      .filter((m: any) => Number(m?.l) > 0 && Number.isFinite(m?.x) && Number.isFinite(m?.y))
      .map((m: any) => ({ l: Number(m.l), x: Math.min(1, Math.max(0, m.x)), y: Math.min(1, Math.max(0, m.y)) }));
  } catch {
    return null;
  }
};

const serialize = (markers: FloorMarker[]) => JSON.stringify({
  [PLAN_KEY]: 1,
  markers: markers.map(m => ({ l: m.l, x: Number(m.x.toFixed(4)), y: Number(m.y.toFixed(4)) }))
});

// ── Modo demo ───────────────────────────────────────────────────────────────
const MOCK_LOCATIONS: LocationNode[] = [
  { id: 10, name: 'Oficina Central', completename: 'Oficina Central', parentId: 0, level: 1 },
  { id: 11, name: 'Planta Baja', completename: 'Oficina Central > Planta Baja', parentId: 10, level: 2 },
  { id: 12, name: 'Sistemas', completename: 'Oficina Central > Planta Baja > Sistemas', parentId: 11, level: 3 },
  { id: 1, name: 'Posición 8', completename: 'Oficina Central > Planta Baja > Sistemas > Posición 8', parentId: 12, level: 4 },
  { id: 13, name: 'Recepción', completename: 'Oficina Central > Planta Baja > Recepción', parentId: 11, level: 3 },
  { id: 14, name: 'Cuarto de servidores', completename: 'Oficina Central > Planta Baja > Sistemas > Cuarto de servidores', parentId: 12, level: 4 }
];
const mockPlans: Record<number, { plan: FloorPlan; url: string }> = {};

// Permisos del perfil activo sobre documentos (derecho "document" de GLPI, en bits)
export interface PlanPermissions {
  canUpload: boolean; // crear documentos → subir/reemplazar croquis
  canEdit: boolean;   // actualizar documentos → editar marcas
  canDelete: boolean; // borrar/purgar documentos → eliminar el croquis
}
const RIGHT_UPDATE = 2;
const RIGHT_CREATE = 4;
const RIGHT_DELETE = 8;
const RIGHT_PURGE = 16;

export class FloorPlanService {
  private static locationsCache = new Map<string, Promise<LocationNode[]>>();
  private static permissionsCache = new Map<string, Promise<PlanPermissions>>();

  /**
   * Qué puede hacer el usuario con los croquis, según los permisos de su perfil en GLPI. Así
   * cada empresa decide quién administra los croquis (normalmente sistemas) y el resto solo
   * los consulta, sin configurar nada en la app.
   */
  static getPermissions(session: GLPISession): Promise<PlanPermissions> {
    if (session.isMock) return Promise.resolve({ canUpload: true, canEdit: true, canDelete: true });
    const key = session.sessionToken;
    if (!this.permissionsCache.has(key)) {
      const promise = fetch(`${session.baseUrl}/apirest.php/getFullSession`, { headers: headers(session) })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          const rights = Number(data?.session?.glpiactiveprofile?.document) || 0;
          return {
            canUpload: (rights & RIGHT_CREATE) !== 0,
            canEdit: (rights & RIGHT_UPDATE) !== 0,
            canDelete: (rights & (RIGHT_DELETE | RIGHT_PURGE)) !== 0
          };
        })
        .catch(() => ({ canUpload: false, canEdit: false, canDelete: false }));
      this.permissionsCache.set(key, promise);
    }
    return this.permissionsCache.get(key)!;
  }

  /** Árbol de ubicaciones de GLPI (se descarga una vez por sesión). */
  static getLocations(session: GLPISession): Promise<LocationNode[]> {
    if (session.isMock) return Promise.resolve(MOCK_LOCATIONS);
    const key = session.sessionToken;
    if (!this.locationsCache.has(key)) {
      const promise = GLPIService.fetchAllPages(session, 'Location').then(rows => rows.map((r: any) => ({
        id: Number(r.id),
        name: GLPIService.htmlToPlainText(String(r.name || '')),
        completename: GLPIService.htmlToPlainText(String(r.completename || r.name || '')),
        parentId: Number(r.locations_id) || 0,
        level: Number(r.level) || 1
      })).sort((a, b) => a.completename.localeCompare(b.completename, 'es')));
      promise.catch(() => this.locationsCache.delete(key));
      this.locationsCache.set(key, promise);
    }
    return this.locationsCache.get(key)!;
  }

  /** Todas las ubicaciones debajo de una (hijas, nietas...). */
  static descendantsOf(locations: LocationNode[], rootId: number): LocationNode[] {
    const result: LocationNode[] = [];
    const walk = (id: number) => locations.filter(l => l.parentId === id).forEach(child => {
      result.push(child);
      walk(child.id);
    });
    walk(rootId);
    return result;
  }

  /** Cadena de ubicaciones desde una hasta la raíz (incluida ella misma). */
  static ancestorsOf(locations: LocationNode[], locationId: number): LocationNode[] {
    const byId = new Map(locations.map(l => [l.id, l]));
    const chain: LocationNode[] = [];
    let current = byId.get(locationId);
    while (current && chain.length < 20) {
      chain.push(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain;
  }

  /** Croquis ligado a una ubicación, o null si no tiene. */
  static async getPlan(session: GLPISession, locationId: number): Promise<FloorPlan | null> {
    if (session.isMock) return mockPlans[locationId]?.plan ? { ...mockPlans[locationId].plan, markers: [...mockPlans[locationId].plan.markers] } : null;

    const res = await fetch(`${session.baseUrl}/apirest.php/Location/${locationId}/Document_Item?range=0-200`, { headers: headers(session) });
    if (!res.ok) return null;
    const links = await res.json();
    if (!Array.isArray(links)) return null;
    for (const link of links) {
      const docRes = await fetch(`${session.baseUrl}/apirest.php/Document/${link.documents_id}`, { headers: headers(session) });
      if (!docRes.ok) continue;
      const doc = await docRes.json();
      const markers = parseMarkers(doc.comment);
      if (markers && String(doc.mime || '').startsWith('image/')) {
        return { documentId: Number(doc.id), locationId, name: GLPIService.htmlToPlainText(String(doc.name || 'Croquis')), markers, rawComment: String(doc.comment || '') };
      }
    }
    return null;
  }

  /** Todos los croquis existentes (para el selector de pisos). */
  static async listPlans(session: GLPISession): Promise<{ documentId: number; locationId: number; name: string }[]> {
    if (session.isMock) return Object.values(mockPlans).map(p => ({ documentId: p.plan.documentId, locationId: p.plan.locationId, name: p.plan.name }));

    // Documentos cuyo comentario contiene la marca del croquis
    const res = await fetch(`${session.baseUrl}/apirest.php/Document?searchText[comment]=${PLAN_KEY}&range=0-200`, { headers: headers(session) });
    if (!res.ok) return [];
    const docs = await res.json();
    if (!Array.isArray(docs)) return [];
    const plans = await Promise.all(docs.filter((d: any) => parseMarkers(d.comment)).map(async (doc: any) => {
      const linkRes = await fetch(`${session.baseUrl}/apirest.php/Document/${doc.id}/Document_Item?range=0-50`, { headers: headers(session) });
      const links = linkRes.ok ? await linkRes.json() : [];
      const location = Array.isArray(links) ? links.find((l: any) => l.itemtype === 'Location') : null;
      return location ? { documentId: Number(doc.id), locationId: Number(location.items_id), name: GLPIService.htmlToPlainText(String(doc.name || 'Croquis')) } : null;
    }));
    return plans.filter(Boolean) as { documentId: number; locationId: number; name: string }[];
  }

  /**
   * El croquis donde aparece una ubicación: el de la propia ubicación o el del ancestro más
   * cercano que tenga croquis. Devuelve también la marca a resaltar (la de la ubicación o, si
   * no está marcada, la de su ancestro marcado más cercano, p. ej. la hilera de la posición).
   */
  static async findPlanFor(session: GLPISession, locationId: number): Promise<{ plan: FloorPlan; focus: number | null } | null> {
    const locations = await this.getLocations(session);
    const chain = this.ancestorsOf(locations, locationId);
    for (const node of chain) {
      const plan = await this.getPlan(session, node.id);
      if (!plan) continue;
      const marked = chain.find(c => plan.markers.some(m => m.l === c.id));
      return { plan, focus: marked ? marked.id : null };
    }
    return null;
  }

  /** Imagen del croquis como object URL (GLPI exige la sesión para descargarla). */
  static async getImageUrl(session: GLPISession, plan: FloorPlan): Promise<string> {
    if (session.isMock) return mockPlans[plan.locationId]?.url || '';
    return GLPIService.getPhotoObjectUrl(session, { id: plan.documentId, name: '', filename: '', date: '' });
  }

  /** Crea el croquis de una ubicación subiendo la imagen (sin marcas, o con las indicadas). */
  static async createPlan(session: GLPISession, location: LocationNode, image: Blob, filename: string, markers: FloorMarker[] = []): Promise<FloorPlan> {
    const name = `Croquis - ${location.completename}`;
    const comment = serialize(markers);
    if (session.isMock) {
      const plan: FloorPlan = { documentId: Date.now(), locationId: location.id, name, markers: [...markers], rawComment: comment };
      mockPlans[location.id] = { plan, url: URL.createObjectURL(image) };
      return plan;
    }

    const form = new FormData();
    form.append('uploadManifest', JSON.stringify({ input: { name, comment, _filename: [filename] } }));
    form.append('filename[0]', image, filename);
    const docRes = await fetch(`${session.baseUrl}/apirest.php/Document`, {
      method: 'POST',
      headers: { 'App-Token': session.appToken, 'Session-Token': session.sessionToken },
      body: form
    });
    const created = await docRes.json().catch(() => null);
    const documentId = Number(created?.id);
    if (!docRes.ok || !documentId) {
      throw new Error(`No se pudo subir el croquis (${docRes.status})${Array.isArray(created) && created[1] ? `: ${created[1]}` : ''}`);
    }
    const linkRes = await fetch(`${session.baseUrl}/apirest.php/Document_Item`, {
      method: 'POST',
      headers: headers(session),
      body: JSON.stringify({ input: { documents_id: documentId, itemtype: 'Location', items_id: location.id } })
    });
    if (!linkRes.ok) throw new Error(`El croquis se subió (documento #${documentId}) pero no se pudo ligar a la ubicación (${linkRes.status})`);
    return { documentId, locationId: location.id, name, markers: [...markers], rawComment: comment };
  }

  /**
   * Cambia la imagen del croquis conservando las marcas (son porcentajes de la imagen, así que
   * siguen en su lugar si la nueva tiene las mismas proporciones). Se crea el documento nuevo
   * y luego se elimina el anterior; si no se puede eliminar, al menos se desliga de la ubicación.
   */
  static async replaceImage(session: GLPISession, plan: FloorPlan, location: LocationNode, image: Blob, filename: string, markers: FloorMarker[]): Promise<FloorPlan> {
    const created = await this.createPlan(session, location, image, filename, markers);
    if (session.isMock) return created;

    const purge = await fetch(`${session.baseUrl}/apirest.php/Document/${plan.documentId}?force_purge=true`, { method: 'DELETE', headers: headers(session) });
    if (!purge.ok) {
      const linksRes = await fetch(`${session.baseUrl}/apirest.php/Document/${plan.documentId}/Document_Item?range=0-50`, { headers: headers(session) });
      const links = linksRes.ok ? await linksRes.json() : [];
      for (const link of Array.isArray(links) ? links : []) {
        if (link.itemtype === 'Location' && Number(link.items_id) === location.id) {
          await fetch(`${session.baseUrl}/apirest.php/Document_Item/${link.id}?force_purge=true`, { method: 'DELETE', headers: headers(session) });
        }
      }
    }
    return created;
  }

  /**
   * Elimina el croquis de una ubicación: el documento completo (imagen y marcas, que viven en
   * él). Se purga; si el perfil solo puede mandarlo a la papelera, se manda ahí y se desliga
   * de la ubicación para que deje de aparecer.
   */
  static async deletePlan(session: GLPISession, plan: FloorPlan): Promise<void> {
    if (session.isMock) {
      delete mockPlans[plan.locationId];
      return;
    }
    const purge = await fetch(`${session.baseUrl}/apirest.php/Document/${plan.documentId}?force_purge=true`, { method: 'DELETE', headers: headers(session) });
    if (purge.ok) return;

    const trash = await fetch(`${session.baseUrl}/apirest.php/Document/${plan.documentId}`, { method: 'DELETE', headers: headers(session) });
    const linksRes = await fetch(`${session.baseUrl}/apirest.php/Document/${plan.documentId}/Document_Item?range=0-50`, { headers: headers(session) });
    const links = linksRes.ok ? await linksRes.json() : [];
    let unlinked = false;
    for (const link of Array.isArray(links) ? links : []) {
      if (link.itemtype === 'Location' && Number(link.items_id) === plan.locationId) {
        const res = await fetch(`${session.baseUrl}/apirest.php/Document_Item/${link.id}?force_purge=true`, { method: 'DELETE', headers: headers(session) });
        unlinked = unlinked || res.ok;
      }
    }
    if (!trash.ok && !unlinked) throw new Error(`No se pudo eliminar el croquis (${purge.status})`);
  }

  /**
   * Guarda las marcas. Si alguien más cambió el croquis desde que se abrió, se avisa en lugar
   * de sobrescribir (salvo `force`).
   */
  static async saveMarkers(session: GLPISession, plan: FloorPlan, markers: FloorMarker[], force = false): Promise<FloorPlan> {
    const comment = serialize(markers);
    if (session.isMock) {
      const entry = mockPlans[plan.locationId];
      if (entry) entry.plan = { ...entry.plan, markers: [...markers], rawComment: comment };
      return { ...plan, markers, rawComment: comment };
    }

    if (!force) {
      const res = await fetch(`${session.baseUrl}/apirest.php/Document/${plan.documentId}`, { headers: headers(session) });
      const current = res.ok ? await res.json() : null;
      if (current && String(current.comment || '') !== plan.rawComment) {
        throw new Error('CONFLICT');
      }
    }
    await GLPIService.putItem(session, 'Document', plan.documentId, { comment }, 'las marcas del croquis');
    return { ...plan, markers, rawComment: comment };
  }
}
