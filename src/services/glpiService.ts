import type { GLPIAuthConfig, GLPISession, GLPITicket, GLPIFollowup, GLPIUserSessionInfo, GLPIProject, GLPIProjectTask, GLPINote, GLPITaskPhoto, PhotoCategory, TaskParticipant, GLPIUserOption, LinkedElement, ElementDetails, ProjectHeaderForm, ProjectCatalogOption } from '../types/glpi';

// Status labels & helper functions
export const GLPI_STATUS_MAP: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: 'Nuevo', color: '#ef4444', bg: '#fef2f2' },
  2: { label: 'En curso (Asignado)', color: '#f59e0b', bg: '#fffbe6' },
  3: { label: 'En curso (Planificado)', color: '#3b82f6', bg: '#eff6ff' },
  4: { label: 'En espera', color: '#8b5cf6', bg: '#f5f3ff' },
  5: { label: 'Resuelto', color: '#10b981', bg: '#ecfdf5' },
  6: { label: 'Cerrado', color: '#6b7280', bg: '#f3f4f6' }
};

export const GLPI_PRIORITY_MAP: Record<number, { label: string; color: string }> = {
  1: { label: 'Muy Baja', color: '#9ca3af' },
  2: { label: 'Baja', color: '#3b82f6' },
  3: { label: 'Media', color: '#f59e0b' },
  4: { label: 'Alta', color: '#f97316' },
  5: { label: 'Muy Alta', color: '#ef4444' },
  6: { label: 'Urgente', color: '#b91c1c' }
};

// Mock data generator for demo/offline mode
const MOCK_TICKETS: GLPITicket[] = [
  {
    id: 101,
    name: 'Fallo de impresión en Departamento de Finanzas',
    content: 'La impresora principal HP LaserJet Pro no responde desde la mañana. Muestra error de conexión de red.',
    status: 1,
    priority: 4,
    urgency: 4,
    impact: 3,
    date: new Date(Date.now() - 3600000 * 2).toISOString(),
    date_mod: new Date(Date.now() - 3600000 * 2).toISOString(),
    category_name: 'Hardware / Impresoras',
    user_name: 'María García',
    assigned_to: 'Soporte TI - Nivel 1'
  },
  {
    id: 102,
    name: 'Solicitud de acceso a correo corporativo',
    content: 'Por favor crear cuenta de correo e instalar cliente Outlook para el nuevo integrante del equipo de ventas.',
    status: 2,
    priority: 3,
    urgency: 3,
    impact: 3,
    date: new Date(Date.now() - 3600000 * 24).toISOString(),
    date_mod: new Date(Date.now() - 3600000 * 5).toISOString(),
    category_name: 'Accesos / Usuarios',
    user_name: 'Carlos Mendoza',
    assigned_to: 'Administrador GLPI'
  },
  {
    id: 103,
    name: 'Actualización de antivirus en Servidor BD',
    content: 'Revisión programada de parches de seguridad y actualización de firmas en servidor de base de datos.',
    status: 3,
    priority: 5,
    urgency: 4,
    impact: 5,
    date: new Date(Date.now() - 3600000 * 48).toISOString(),
    date_mod: new Date(Date.now() - 3600000 * 12).toISOString(),
    category_name: 'Servidores / Mantenimiento',
    user_name: 'Sistemas Ops',
    assigned_to: 'Seguridad Informática'
  },
  {
    id: 104,
    name: 'Restablecimiento de contraseña VPN',
    content: 'El usuario intentó ingresar 5 veces y bloqueó su credencial VPN remota.',
    status: 5,
    priority: 2,
    urgency: 2,
    impact: 2,
    date: new Date(Date.now() - 3600000 * 72).toISOString(),
    date_mod: new Date(Date.now() - 3600000 * 4).toISOString(),
    category_name: 'Redes / VPN',
    user_name: 'Ana Beltrán',
    assigned_to: 'Mesa de Ayuda'
  }
];

const MOCK_FOLLOWUPS: Record<number, GLPIFollowup[]> = {
  101: [
    {
      id: 1,
      tickets_id: 101,
      content: 'Se acudió al sitio y se reinició el switch de red del departamento.',
      date: new Date(Date.now() - 3600000 * 1).toISOString(),
      date_mod: new Date(Date.now() - 3600000 * 1).toISOString(),
      user_name: 'Técnico de Turno'
    }
  ],
  102: [
    {
      id: 2,
      tickets_id: 102,
      content: 'Solicitud aprobada por Recursos Humanos. En proceso de alta en Active Directory.',
      date: new Date(Date.now() - 3600000 * 10).toISOString(),
      date_mod: new Date(Date.now() - 3600000 * 10).toISOString(),
      user_name: 'Administrador GLPI'
    }
  ]
};

/**
 * Rubros de documento (Configuración → Desplegables → Rubros de documentos) con los que se
 * clasifican las fotos de evidencia de mantenimiento:
 *   10 = PREVIO MANTENIMIENTO  (front/documentcategory.form.php?id=10)
 *   11 = POST MANTENIMIENTO    (front/documentcategory.form.php?id=11)
 */
export const PHOTO_CATEGORIES: PhotoCategory[] = [
  { id: 10, label: 'Previo mantenimiento' },
  { id: 11, label: 'Post mantenimiento' }
];

/**
 * Relación tarea → elemento del inventario. GLPI 10.0 no la trae para tareas; se guarda con el
 * plugin Campos adicionales (Fields), bloque "Elementos" en tareas de proyecto, campo
 * "Agregar un elemento". La API expone ese bloque como PluginFieldsProjecttaskelemento
 * (sin el filtro de "mis tareas" que GLPI aplica a los listados de ProjectTask).
 */
const TASK_ELEMENTS_ITEMTYPE = 'PluginFieldsProjecttaskelemento';
const TASK_ELEMENT_TYPE_FIELD = 'itemtype_agregarunelementofield';
const TASK_ELEMENT_ID_FIELD = 'items_id_agregarunelementofield';
// Campo "Etiqueta Física" del bloque "Etiqueta" en computadoras (plugin Campos adicionales)
export const PHYSICAL_TAG_FIELD = 'etiquetafisicafield';

export class GLPIService {
  private static cleanUrl(url: string): string {
    let cleaned = url.trim();
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = 'https://' + cleaned;
    }
    // Remove trailing slashes and /apirest.php if present
    cleaned = cleaned.replace(/\/+$/, '');
    if (cleaned.endsWith('/apirest.php')) {
      cleaned = cleaned.substring(0, cleaned.length - '/apirest.php'.length);
    }
    return cleaned;
  }

  private static appendQueryParams(urlStr: string, params: Record<string, string | undefined>): string {
    try {
      const url = new URL(urlStr);
      Object.entries(params).forEach(([key, value]) => {
        if (value) {
          url.searchParams.set(key, value);
        }
      });
      return url.toString();
    } catch (_) {
      let result = urlStr;
      Object.entries(params).forEach(([key, value]) => {
        if (value) {
          const sep = result.includes('?') ? '&' : '?';
          result += `${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        }
      });
      return result;
    }
  }

  /**
   * Inicia sesión en la API de GLPI
   */
  static async initSession(config: GLPIAuthConfig): Promise<GLPISession> {
    if (config.useMock) {
      // Retornar sesión simulada para pruebas
      return {
        sessionToken: 'demo_session_token_' + Date.now(),
        baseUrl: config.baseUrl || 'http://localhost/glpi',
        appToken: config.appToken || 'demo_app_token',
        username: config.username || 'Usuario Demo GLPI',
        realname: 'Demo',
        firstname: 'GLPI',
        userId: 1,
        activeProfile: 'Super-Admin',
        activeEntity: 'Entidad Raíz',
        isMock: true
      };
    }

    const baseUrl = this.cleanUrl(config.baseUrl);
    const cleanAppToken = config.appToken.trim();
    const apiUrl = this.appendQueryParams(`${baseUrl}/apirest.php/initSession`, {
      app_token: cleanAppToken
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'App-Token': cleanAppToken
    };

    if (config.userToken && config.userToken.trim() !== '') {
      headers['Authorization'] = `user_token ${config.userToken.trim()}`;
    } else if (config.username && config.password) {
      const authStr = `${config.username.trim()}:${config.password}`;
      headers['Authorization'] = `Basic ${btoa(unescape(encodeURIComponent(authStr)))}`;
    } else {
      throw new Error('Debes proporcionar usuario/contraseña o Token de Usuario GLPI');
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        let errorMsg = `Error de autenticación (${response.status})`;
        try {
          const errData = await response.json();
          if (Array.isArray(errData) && errData[1]) {
            errorMsg = errData[1];
          } else if (errData.message) {
            errorMsg = errData.message;
          }
        } catch (_) {}

        if (response.status === 400) {
          throw new Error(`Glpi API: ${errorMsg}. Revisa que el App-Token esté activo ("Activo = SÍ") en la configuración de Clientes API de tu GLPI.`);
        } else if (response.status === 401) {
          throw new Error(`Credenciales incorrectas: ${errorMsg}`);
        } else {
          throw new Error(errorMsg);
        }
      }

      const data = await response.json();
      const sessionToken = data.session_token;

      if (!sessionToken) {
        throw new Error('Respuesta inválida de GLPI: no se recibió session_token');
      }

      // Obtener detalles del usuario autenticado
      let userInfo: Partial<GLPISession> = {};
      try {
        const fullSessionUrl = this.appendQueryParams(`${baseUrl}/apirest.php/getFullSession`, {
          app_token: cleanAppToken,
          session_token: sessionToken
        });
        const fullSessionRes = await fetch(fullSessionUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'App-Token': cleanAppToken,
            'Session-Token': sessionToken
          }
        });
        if (fullSessionRes.ok) {
          const fullData: GLPIUserSessionInfo = await fullSessionRes.json();
          userInfo = {
            username: fullData.session?.glpiname || config.username,
            realname: fullData.session?.glpirealname,
            firstname: fullData.session?.glpifirstname,
            userId: fullData.session?.glpiID,
            activeProfile: fullData.session?.glpiactiveprofile?.name,
            activeEntity: fullData.session?.glpiactive_entity?.name
          };
        }
      } catch (e) {
        console.warn('No se pudo obtener información detallada del perfil GLPI:', e);
      }

      return {
        sessionToken,
        baseUrl,
        appToken: cleanAppToken,
        userToken: config.userToken,
        username: userInfo.username || config.username || 'Usuario GLPI',
        realname: userInfo.realname,
        firstname: userInfo.firstname,
        userId: userInfo.userId,
        activeProfile: userInfo.activeProfile || 'Usuario de API',
        activeEntity: userInfo.activeEntity || 'Entidad Principal',
        isMock: false
      };
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error(`Error de Red / CORS: No se pudo conectar a ${apiUrl}. Verifica la URL, conexión de red o habilita solicitudes CORS en tu servidor GLPI.`);
      }
      throw err;
    }
  }

  /**
   * Obtiene la lista de Tickets de GLPI
   */
  static async getTickets(session: GLPISession): Promise<GLPITicket[]> {
    if (session.isMock) {
      return [...MOCK_TICKETS];
    }

    const url = this.appendQueryParams(
      `${session.baseUrl}/apirest.php/Ticket?expand_dropdowns=true&order=DESC&sort=date_mod&range=0-50`,
      { app_token: session.appToken, session_token: session.sessionToken }
    );
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      }
    });

    if (!response.ok) {
      throw new Error(`Error obteniendo tickets: ${response.statusText}`);
    }

    const rawData = await response.json();
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map((item: any) => ({
      id: item.id,
      name: item.name || 'Sin título',
      content: item.content || '',
      status: Number(item.status) || 1,
      priority: Number(item.priority) || 3,
      urgency: Number(item.urgency) || 3,
      impact: Number(item.impact) || 3,
      date: item.date || item.date_mod || new Date().toISOString(),
      date_mod: item.date_mod || new Date().toISOString(),
      category_name: typeof item.itilcategories_id === 'string' ? item.itilcategories_id : (item.itilcategories_id?.name || 'General'),
      user_name: item.users_id_recipient || 'Usuario GLPI',
      assigned_to: item.users_id_lastupdater || 'Técnico asignado'
    }));
  }

  /**
   * Obtener detalle de un Ticket específico
   */
  static async getTicketById(session: GLPISession, ticketId: number): Promise<GLPITicket> {
    if (session.isMock) {
      const found = MOCK_TICKETS.find(t => t.id === ticketId);
      if (found) return found;
      throw new Error('Ticket no encontrado');
    }

    const url = `${session.baseUrl}/apirest.php/Ticket/${ticketId}?expand_dropdowns=true`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      }
    });

    if (!response.ok) {
      throw new Error(`No se pudo obtener el ticket ${ticketId}`);
    }

    const item = await response.json();
    return {
      id: item.id,
      name: item.name || 'Sin título',
      content: item.content || '',
      status: Number(item.status) || 1,
      priority: Number(item.priority) || 3,
      urgency: Number(item.urgency) || 3,
      impact: Number(item.impact) || 3,
      date: item.date || new Date().toISOString(),
      date_mod: item.date_mod || new Date().toISOString(),
      category_name: typeof item.itilcategories_id === 'string' ? item.itilcategories_id : (item.itilcategories_id?.name || 'General'),
      user_name: item.users_id_recipient || 'Usuario GLPI',
      assigned_to: item.users_id_lastupdater || 'Soporte'
    };
  }

  /**
   * Obtiene los seguimientos / comentarios de un Ticket
   */
  static async getFollowups(session: GLPISession, ticketId: number): Promise<GLPIFollowup[]> {
    if (session.isMock) {
      return MOCK_FOLLOWUPS[ticketId] || [];
    }

    const url = `${session.baseUrl}/apirest.php/Ticket/${ticketId}/ITILFollowup?expand_dropdowns=true`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      }
    });

    if (!response.ok) {
      return [];
    }

    const raw = await response.json();
    if (!Array.isArray(raw)) return [];

    return raw.map((item: any) => ({
      id: item.id,
      tickets_id: ticketId,
      content: item.content || '',
      date: item.date || new Date().toISOString(),
      date_mod: item.date_mod || new Date().toISOString(),
      user_name: item.users_id || 'Técnico GLPI',
      is_private: Number(item.is_private) || 0
    }));
  }

  /**
   * Crea un nuevo Ticket en GLPI
   */
  static async createTicket(session: GLPISession, ticketData: { name: string; content: string; urgency: number }): Promise<GLPITicket> {
    if (session.isMock) {
      const newMockTicket: GLPITicket = {
        id: Math.floor(105 + Math.random() * 900),
        name: ticketData.name,
        content: ticketData.content,
        status: 1, // Nuevo
        priority: ticketData.urgency,
        urgency: ticketData.urgency,
        impact: 3,
        date: new Date().toISOString(),
        date_mod: new Date().toISOString(),
        category_name: 'Soporte General',
        user_name: session.username || 'Usuario Actual',
        assigned_to: 'Pendiente de Asignar'
      };
      MOCK_TICKETS.unshift(newMockTicket);
      return newMockTicket;
    }

    const url = `${session.baseUrl}/apirest.php/Ticket`;
    const payload = {
      input: {
        name: ticketData.name,
        content: ticketData.content,
        urgency: ticketData.urgency
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Error al crear ticket en GLPI (${response.status})`);
    }

    const resData = await response.json();
    const createdId = resData.id || resData[0]?.id;

    if (createdId) {
      return this.getTicketById(session, createdId);
    }

    return {
      id: 0,
      name: ticketData.name,
      content: ticketData.content,
      status: 1,
      priority: ticketData.urgency,
      urgency: ticketData.urgency,
      impact: 3,
      date: new Date().toISOString(),
      date_mod: new Date().toISOString()
    };
  }

  /**
   * Añadir un seguimiento / comentario a un Ticket
   */
  static async addFollowup(session: GLPISession, ticketId: number, content: string): Promise<GLPIFollowup> {
    if (session.isMock) {
      const newFollowup: GLPIFollowup = {
        id: Date.now(),
        tickets_id: ticketId,
        content: content,
        date: new Date().toISOString(),
        date_mod: new Date().toISOString(),
        user_name: session.username || 'Técnico GLPI'
      };
      if (!MOCK_FOLLOWUPS[ticketId]) {
        MOCK_FOLLOWUPS[ticketId] = [];
      }
      MOCK_FOLLOWUPS[ticketId].push(newFollowup);
      return newFollowup;
    }

    const url = `${session.baseUrl}/apirest.php/Ticket/${ticketId}/ITILFollowup`;
    const payload = {
      input: {
        tickets_id: ticketId,
        content: content
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('No se pudo enviar el comentario al ticket');
    }

    return {
      id: Date.now(),
      tickets_id: ticketId,
      content,
      date: new Date().toISOString(),
      date_mod: new Date().toISOString(),
      user_name: session.username || 'Usuario GLPI'
    };
  }

  /**
   * Cierra sesión en GLPI
   */
  /**
   * Comprueba que la sesión de GLPI siga viva (y la mantiene activa en el servidor).
   * Devuelve false solo si GLPI la rechaza (401); ante errores de red devuelve true para
   * no cerrar la sesión por una caída momentánea de conexión.
   */
  static async pingSession(session: GLPISession): Promise<boolean> {
    if (session.isMock) return true;
    try {
      const response = await fetch(`${session.baseUrl}/apirest.php/getActiveProfile`, {
        headers: {
          'Content-Type': 'application/json',
          'App-Token': session.appToken,
          'Session-Token': session.sessionToken
        }
      });
      return response.status !== 401;
    } catch {
      return true;
    }
  }

  static async killSession(session: GLPISession): Promise<void> {
    if (session.isMock) return;

    try {
      await fetch(`${session.baseUrl}/apirest.php/killSession`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': session.appToken,
          'Session-Token': session.sessionToken
        }
      });
    } catch (e) {
      console.warn('Error al cerrar sesión en GLPI:', e);
    }
  }

  /**
   * Obtiene la lista de Proyectos de GLPI
   */
  static async getProjects(session: GLPISession): Promise<GLPIProject[]> {
    if (session.isMock) {
      return [...MOCK_PROJECTS];
    }

    const url = this.appendQueryParams(
      `${session.baseUrl}/apirest.php/Project?expand_dropdowns=true&order=DESC&sort=date_mod&range=0-100`,
      { app_token: session.appToken, session_token: session.sessionToken }
    );

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': session.appToken,
          'Session-Token': session.sessionToken
        }
      });

      if (!response.ok) {
        return [...MOCK_PROJECTS];
      }

      const raw = await response.json();
      if (!Array.isArray(raw)) return [...MOCK_PROJECTS];

      return raw.map((item: any) => ({
        id: Number(item.id),
        name: item.name || 'Proyecto sin nombre',
        content: item.content || '',
        percent_done: Number(item.percent_done) || 0,
        date: item.date || new Date().toISOString(),
        date_mod: item.date_mod || new Date().toISOString(),
        code: item.code || `PRJ-${item.id}`,
        state_name: typeof item.projectstates_id === 'string' ? item.projectstates_id : (item.projectstates_id?.name || 'Activo')
      }));
    } catch (err) {
      console.warn('Error fetching real projects, falling back to mock:', err);
      return [...MOCK_PROJECTS];
    }
  }

  /**
   * Estados de proyecto para crear uno: los del catálogo ProjectState de GLPI, sin los que
   * marcan el proyecto como terminado (un proyecto nuevo no nace cerrado).
   */
  static async getOpenProjectStates(session: GLPISession): Promise<ProjectCatalogOption[]> {
    if (session.isMock) return [{ id: 1, label: 'New' }, { id: 2, label: 'Processing' }];
    const rows = await this.fetchAllPages(session, 'ProjectState');
    return rows
      .filter((r: any) => Number(r.is_finished) !== 1)
      .map((r: any) => ({ id: Number(r.id), label: this.htmlToPlainText(String(r.name || `#${r.id}`)) }))
      .sort((a, b) => a.id - b.id);
  }

  /** Tipos de proyecto (catálogo ProjectType de GLPI). */
  static async getProjectTypes(session: GLPISession): Promise<ProjectCatalogOption[]> {
    if (session.isMock) return [{ id: 1, label: 'MANTENIMIENTOS PROGRAMADOS' }, { id: 2, label: 'DESARROLLOS' }];
    const rows = await this.fetchAllPages(session, 'ProjectType');
    return rows
      .map((r: any) => ({ id: Number(r.id), label: this.htmlToPlainText(String(r.name || `#${r.id}`)) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }

  /** "YYYY-MM-DDTHH:MM" (input datetime-local) → "YYYY-MM-DD HH:MM:00" de GLPI; vacío → null. */
  static inputToGlpiDateTime(value: string): string | null {
    return value ? `${value.replace('T', ' ').slice(0, 16)}:00` : null;
  }

  /**
   * Crea la cabecera de un proyecto. La fecha del proyecto es el momento de creación, el avance
   * se calcula solo a partir de las tareas (auto_percent_done), el fin previsto lo da la tarea
   * que termina más tarde (ProjectTaskService.syncRollups) y la fecha de fin real no se captura. Los integrantes se registran en el equipo del proyecto (ProjectTeam).
   */
  static async createProject(session: GLPISession, form: ProjectHeaderForm): Promise<GLPIProject> {
    const now = this.toGlpiDateTime(new Date());
    if (session.isMock) {
      const project: GLPIProject = {
        id: Math.max(0, ...MOCK_PROJECTS.map(p => p.id)) + 1,
        name: form.name.trim(),
        content: form.content.trim(),
        percent_done: 0,
        date: now,
        date_mod: now,
        state_name: 'New'
      };
      MOCK_PROJECTS.unshift(project);
      return { ...project };
    }

    const headers = {
      'Content-Type': 'application/json',
      'App-Token': session.appToken,
      'Session-Token': session.sessionToken
    };
    const input: Record<string, unknown> = {
      name: form.name.trim(),
      date: now,
      priority: form.priority,
      projectstates_id: form.projectstates_id,
      projecttypes_id: form.projecttypes_id,
      users_id: form.users_id,
      percent_done: 0,
      auto_percent_done: 1,
      plan_start_date: this.inputToGlpiDateTime(form.plan_start_date),
      // plan_end_date queda vacío: lo calcula ProjectTaskService.syncRollups con las tareas
      real_start_date: this.inputToGlpiDateTime(form.real_start_date),
      content: form.content.trim() ? this.plainTextToHtml(form.content.trim()) : ''
    };
    const res = await fetch(`${session.baseUrl}/apirest.php/Project`, { method: 'POST', headers, body: JSON.stringify({ input }) });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.id) {
      const detail = Array.isArray(body) ? body.slice(1).join(' ') : '';
      throw new Error(`GLPI no creó el proyecto (${res.status})${detail ? `: ${detail}` : ''}`);
    }
    const projectId = Number(body.id);

    // Integrantes: una fila de ProjectTeam por usuario, en una sola petición
    const members = [...new Set(form.members)];
    if (members.length > 0) {
      const teamRes = await fetch(`${session.baseUrl}/apirest.php/ProjectTeam`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: members.map(id => ({ projects_id: projectId, itemtype: 'User', items_id: id })) })
      });
      const results = await teamRes.json().catch(() => null);
      const failed = !teamRes.ok || (Array.isArray(results) && results.some((r: any) => !r?.id));
      if (failed) {
        throw new Error(`El proyecto #${projectId} se creó, pero no se pudieron registrar todos los integrantes (${teamRes.status}). Agrégalos desde GLPI.`);
      }
    }

    return {
      id: projectId,
      name: form.name.trim(),
      content: form.content.trim(),
      percent_done: 0,
      date: now,
      date_mod: now,
      state_name: ''
    };
  }

  /**
   * Obtiene la lista COMPLETA de tareas de un proyecto en GLPI.
   *
   * Estrategia correcta para GLPI:
   * 1. Cargar TODOS los ProjectTask globalmente (paginado)
   * 2. Identificar las tareas que pertenecen directamente al proyecto (projects_id === projectId)
   * 3. Construir un índice de hijos por parentId
   * 4. Recolectar recursivamente todos los descendientes de las tareas raíz
   *    (Las sub-tareas anidadas tienen projects_id=0 en GLPI — solo el padre directo lo tiene)
   */
  static async getProjectTasks(session: GLPISession, projectId: number): Promise<GLPIProjectTask[]> {
    if (session.isMock) {
      return [...this.mockProjectTasks(projectId)];
    }
    return this.tasksOfProject(await this.loadAllProjectTasks(session), projectId);
  }

  /** Tareas de todos los proyectos, agrupadas por proyecto, con una sola carga de tareas. */
  static async getAllProjectTasks(session: GLPISession): Promise<Map<number, GLPIProjectTask[]>> {
    if (session.isMock) {
      return new Map(Object.entries(MOCK_PROJECT_TASKS).map(([id, tasks]) => [Number(id), [...tasks]]));
    }
    const globalMap = await this.loadAllProjectTasks(session);
    const projectIds = new Set([...globalMap.values()].map(t => t.projects_id).filter(id => id > 0));
    return new Map([...projectIds].map(id => [id, this.tasksOfProject(globalMap, id)]));
  }

  /** TODAS las tareas de proyecto del sistema (GLPI filtra los listados; ver PASO 1). */
  private static async loadAllProjectTasks(session: GLPISession): Promise<Map<number, GLPIProjectTask>> {
    const globalMap = new Map<number, GLPIProjectTask>(); // TODAS las tareas del sistema

    try {
      // ═══ PASO 1: Cargar las tareas ═══
      // GLPI filtra los LISTADOS de ProjectTask (ProjectTask, Project/X/ProjectTask, search,
      // sub-items) a las tareas donde el usuario es creador o miembro del equipo, aun con
      // perfil Super-Admin. La lectura por ID sí devuelve cualquier tarea, así que:
      //  a) el listado (filtrado) da una cota del ID más alto conocido
      //  b) se recorren todos los IDs en lotes con getMultipleItems
      const listed = await this.fetchAllPages(session, 'ProjectTask');
      const maxListedId = listed.reduce((max: number, item: any) => Math.max(max, Number(item.id) || 0), 0);
      const scanned = await this.fetchProjectTasksById(session, maxListedId);

      [...scanned, ...listed].forEach((item: any) => {
        const mapped = this.mapRawTask(item);
        if (!globalMap.has(mapped.id)) globalMap.set(mapped.id, mapped);
      });

      console.log(`[GLPI] Tareas visibles en listado: ${listed.length}, recuperadas por ID: ${scanned.length}`);
      console.log(`[GLPI] Total tareas en sistema: ${globalMap.size}`);
      return globalMap;
    } catch (err: any) {
      console.error('Error cargando tareas de GLPI:', err);
      throw new Error(`Error al conectar con la API de GLPI: ${err.message || err}`);
    }
  }

  /** Tareas de un proyecto: sus raíces y todos sus descendientes. */
  private static tasksOfProject(globalMap: Map<number, GLPIProjectTask>, projectId: number): GLPIProjectTask[] {
    // ═══ PASO 2: Construir índice de hijos por parentId ═══
    const childrenIndex = new Map<number, number[]>(); // parentId → [childId, ...]
    globalMap.forEach((task) => {
      const pid = task.projecttasks_id || 0;
      if (!childrenIndex.has(pid)) childrenIndex.set(pid, []);
      childrenIndex.get(pid)!.push(task.id);
    });

    // ═══ PASO 3: Identificar raíces del proyecto ═══
    // En GLPI, las tareas raíz tienen projects_id === projectId y projecttasks_id === 0
    // (o cualquier valor que no existe en el mapa = orphan)
    const projectRootIds: number[] = [];
    globalMap.forEach((task) => {
      if (task.projects_id === projectId) {
        // Verificar si su padre también pertenece al proyecto
        const parentInProject = task.projecttasks_id > 0 && globalMap.get(task.projecttasks_id)?.projects_id === projectId;
        if (!parentInProject) {
          projectRootIds.push(task.id);
        }
      }
    });

    console.log(`[GLPI] Raíces del proyecto ${projectId}: ${projectRootIds.length}`, projectRootIds);

    // ═══ PASO 4: Recolectar recursivamente todos los descendientes ═══
    const result = new Map<number, GLPIProjectTask>();

    const collectDescendants = (taskId: number) => {
      const task = globalMap.get(taskId);
      if (!task || result.has(taskId)) return;
      result.set(taskId, task);
      // Recolectar hijos (aunque tengan projects_id=0, son parte del árbol)
      const children = childrenIndex.get(taskId) || [];
      children.forEach(childId => collectDescendants(childId));
    };

    projectRootIds.forEach(rootId => collectDescendants(rootId));

    const tasksList = Array.from(result.values());
    console.log(`[GLPI] Tareas del proyecto ${projectId}: ${tasksList.length} (de ${globalMap.size} totales en el sistema)`);
    return tasksList;
  }


  /**
   * Recupera TODAS las tareas de proyecto leyéndolas por ID con getMultipleItems.
   *
   * - getMultipleItems falla completo (404) si algún ID del lote no existe (tareas borradas);
   *   en ese caso el lote se divide (ver fetchIds).
   * - El servidor procesa ~40 peticiones/s, así que lo que cuesta es el NÚMERO de peticiones.
   *   Como MySQL no reutiliza IDs, los IDs borrados se recuerdan en localStorage y se omiten
   *   en las siguientes cargas: así todos los lotes aciertan a la primera.
   * - Más allá del ID más alto conocido se sigue explorando hasta encontrar varios lotes vacíos
   *   seguidos (tareas creadas desde la última carga).
   */
  private static taskScanCacheKey(session: GLPISession): string {
    return `glpi_projecttask_scan:${session.baseUrl}`;
  }

  /**
   * Recuerda los IDs de tareas creadas desde la app. GLPI no las incluye en el listado de quien
   * las crea (solo en el de los integrantes de su equipo), así que sin esto la búsqueda por ID
   * podría no llegar a ellas si antes hay un hueco grande de tareas borradas.
   */
  static rememberProjectTaskIds(session: GLPISession, ids: number[]): void {
    if (session.isMock || ids.length === 0) return;
    try {
      const key = this.taskScanCacheKey(session);
      const raw = localStorage.getItem(key);
      const cached: { maxId: number; missing: number[] } = raw ? JSON.parse(raw) : { maxId: 0, missing: [] };
      const created = new Set(ids);
      localStorage.setItem(key, JSON.stringify({
        maxId: Math.max(cached.maxId, ...ids),
        missing: cached.missing.filter(id => !created.has(id))
      }));
    } catch { /* sin localStorage: la búsqueda explora sin caché */ }
  }

  private static async fetchProjectTasksById(session: GLPISession, minMaxId: number): Promise<any[]> {
    const batchSize = 25;
    const tailBatchSize = 10;
    // Huecos de IDs por tareas borradas: se toleran hasta 30 IDs seguidos inexistentes
    const emptyTailBatchesToStop = 3;
    const cacheKey = this.taskScanCacheKey(session);
    const headers = {
      'Content-Type': 'application/json',
      'App-Token': session.appToken,
      'Session-Token': session.sessionToken
    };

    let cached: { maxId: number; missing: number[] } = { maxId: 0, missing: [] };
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) cached = JSON.parse(raw);
    } catch { /* sin localStorage (modo privado, Node): explorar sin caché */ }
    const knownMissing = new Set(cached.missing);

    // Si el lote falla: 'bisect' lo parte en mitades (barato cuando faltan pocos IDs, caso del
    // rango conocido); 'singles' pide cada ID por separado (barato cuando faltan casi todos, caso
    // de la exploración final).
    const fetchIds = async (ids: number[], onMissing: 'bisect' | 'singles' = 'bisect'): Promise<any[]> => {
      if (ids.length === 0) return [];
      const qs = ids
        .map((id, i) => `items[${i}][itemtype]=ProjectTask&items[${i}][items_id]=${id}`)
        .join('&');
      const response = await fetch(`${session.baseUrl}/apirest.php/getMultipleItems?${qs}`, { headers });
      if (response.ok) {
        const data = await response.json();
        return Array.isArray(data) ? data.filter((x: any) => x && typeof x === 'object' && x.id) : [];
      }
      if (response.status !== 404 || ids.length === 1) return [];
      const parts = onMissing === 'singles'
        ? ids.map(id => [id])
        : [ids.slice(0, Math.ceil(ids.length / 2)), ids.slice(Math.ceil(ids.length / 2))];
      return (await Promise.all(parts.map(part => fetchIds(part, onMissing)))).flat();
    };

    // Fase 1: rango conocido, omitiendo los IDs que ya sabemos borrados
    const knownMax = Math.max(minMaxId, cached.maxId);
    const candidates: number[] = [];
    for (let id = 1; id <= knownMax; id++) {
      if (!knownMissing.has(id)) candidates.push(id);
    }
    const batches: number[][] = [];
    for (let i = 0; i < candidates.length; i += batchSize) {
      batches.push(candidates.slice(i, i + batchSize));
    }
    const items: any[] = (await Promise.all(batches.map(batch => fetchIds(batch)))).flat();

    // Fase 2: explorar más allá del máximo conocido
    let nextId = knownMax + 1;
    let emptyInARow = 0;
    while (emptyInARow < emptyTailBatchesToStop && nextId < 100000) {
      const found = await fetchIds(Array.from({ length: tailBatchSize }, (_, i) => nextId + i), 'singles');
      nextId += tailBatchSize;
      items.push(...found);
      emptyInARow = found.length === 0 ? emptyInARow + 1 : 0;
    }

    // Fase 3: un hueco grande de tareas borradas puede esconder tareas más nuevas. Se sondean IDs
    // a saltos más allá del hueco (+50, +100, +200, +400); si aparece alguna, se recorre el tramo
    // y se sigue explorando desde ahí.
    for (let round = 0; round < 10; round++) {
      const probes = [50, 100, 200, 400].map(step => nextId + step);
      const found = (await Promise.all(probes.map(id => fetchIds([id], 'singles')))).flat();
      if (found.length === 0) break;
      const target = Math.max(...found.map((x: any) => Number(x.id)));
      const gap: number[] = [];
      for (let id = nextId; id <= target; id++) gap.push(id);
      const gapBatches: number[][] = [];
      for (let i = 0; i < gap.length; i += batchSize) gapBatches.push(gap.slice(i, i + batchSize));
      items.push(...(await Promise.all(gapBatches.map(batch => fetchIds(batch)))).flat());
      nextId = target + 1;
      emptyInARow = 0;
      while (emptyInARow < emptyTailBatchesToStop && nextId < 100000) {
        const more = await fetchIds(Array.from({ length: tailBatchSize }, (_, i) => nextId + i), 'singles');
        nextId += tailBatchSize;
        items.push(...more);
        emptyInARow = more.length === 0 ? emptyInARow + 1 : 0;
      }
    }

    // Guardar los IDs inexistentes por debajo del máximo encontrado (borrados definitivamente)
    try {
      const foundIds = new Set(items.map((x: any) => Number(x.id)));
      const maxFound = Math.max(0, ...foundIds);
      const missing: number[] = [];
      for (let id = 1; id <= maxFound; id++) {
        if (!foundIds.has(id)) missing.push(id);
      }
      localStorage.setItem(cacheKey, JSON.stringify({ maxId: maxFound, missing }));
    } catch { /* sin localStorage: la próxima carga volverá a explorar completa */ }

    return items;
  }

  /**
   * Descarga todas las páginas de un endpoint de listado de GLPI.
   * GLPI recorta cada respuesta a "list_limit_max" (50 por defecto) sin importar el
   * rango pedido, así que se avanza según lo realmente recibido y se sigue pidiendo
   * hasta obtener una página vacía o un error (400 = rango fuera del total: fin normal).
   */
  static async fetchAllPages(session: GLPISession, path: string): Promise<any[]> {
    const pageSize = 50;
    const items: any[] = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total && offset < 20000) {
      const url = `${session.baseUrl}/apirest.php/${path}?range=${offset}-${offset + pageSize - 1}&order=ASC&sort=id`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': session.appToken,
          'Session-Token': session.sessionToken
        }
      });

      if (!response.ok) {
        if (offset === 0) console.warn(`[GLPI] Error cargando ${path} (${response.status})`);
        break;
      }

      const raw = await response.json();
      if (!Array.isArray(raw) || raw.length === 0) break;
      items.push(...raw);
      offset += raw.length;

      // "Content-Range: 0-49/350" — solo legible si el servidor expone la cabecera (CORS)
      const range = response.headers.get('Content-Range');
      const parsedTotal = range ? Number(range.split('/')[1]) : NaN;
      if (!isNaN(parsedTotal)) total = parsedTotal;

      console.log(`[GLPI] ${path}: offset=${offset}, total=${isFinite(total) ? total : '?'}`);
    }

    return items;
  }

  private static mapRawTask(item: any): GLPIProjectTask {
    const taskName = (item.name || 'Tarea sin nombre').trim();

    // Parsear projecttasks_id (soporta entero, string de ID, string de Nombre o objeto dropdown { id: XX, name: "..." })
    let parentTaskId = 0;
    let parentNameRef = '';

    if (typeof item.projecttasks_id === 'number') {
      parentTaskId = item.projecttasks_id;
    } else if (typeof item.projecttasks_id === 'string') {
      const str = item.projecttasks_id.trim();
      const parsed = parseInt(str, 10);
      if (!isNaN(parsed) && parsed > 0) {
        parentTaskId = parsed;
        // Si la cadena es puramente numérica, es un ID (no un nombre)
        if (!/^\d+$/.test(str)) {
          // Tiene texto además de números — podría ser un nombre
          const cleanName = str.replace(/^\d+\s*[-_:]\s*/, '').trim();
          if (cleanName && cleanName !== str) parentNameRef = cleanName;
        }
      } else if (str && !/^\d+$/.test(str)) {
        // Es un nombre (vino como expand_dropdowns)
        const cleanName = str.replace(/^\d+\s*[-_:]\s*/, '').trim();
        parentNameRef = cleanName || str;
      }
    } else if (item.projecttasks_id && typeof item.projecttasks_id === 'object') {
      if (item.projecttasks_id.id) {
        parentTaskId = Number(item.projecttasks_id.id) || 0;
      }
      if (item.projecttasks_id.name) {
        const nameStr = String(item.projecttasks_id.name).trim();
        const cleanName = nameStr.replace(/^\d+\s*[-_:]\s*/, '').trim();
        parentNameRef = cleanName || nameStr;
      }
    }

    // Parsear projects_id
    let projectId = 0;
    if (typeof item.projects_id === 'number') {
      projectId = item.projects_id;
    } else if (typeof item.projects_id === 'string') {
      const parsedPrj = parseInt(item.projects_id, 10);
      if (!isNaN(parsedPrj) && parsedPrj > 0) projectId = parsedPrj;
    } else if (item.projects_id && typeof item.projects_id === 'object') {
      if (item.projects_id.id) {
        projectId = Number(item.projects_id.id) || 0;
      }
    }

    // Parsear is_milestone estrictamente desde GLPI (1, true, "1", "true")
    const isMilestone = Boolean(
      item.is_milestone === 1 || 
      item.is_milestone === true || 
      item.is_milestone === '1' || 
      item.is_milestone === 'true'
    );

    return {
      id: Number(item.id),
      projects_id: projectId,
      projecttasks_id: parentTaskId,
      parent_name_ref: parentNameRef,
      name: taskName,
      content: item.content || '',
      percent_done: Number(item.percent_done) || 0,
      is_milestone: isMilestone,
      state: Number(item.state || item.projectstates_id) || (Number(item.percent_done) === 100 ? 3 : 1),
      plan_start_date: item.plan_start_date,
      plan_end_date: item.plan_end_date,
      real_start_date: item.real_start_date,
      real_end_date: item.real_end_date,
      state_name: item.state_name || (Number(item.percent_done) === 100 ? 'Concluida' : 'En proceso'),
      projectstates_id: Number(item.projectstates_id) || 0,
      planned_duration: Number(item.planned_duration) || 0,
      effective_duration: Number(item.effective_duration) || 0
    };
  }

  /**
   * Concluye un Hito o Tarea con 1 solo clic:
   * Guarda automáticamente en GLPI: percent_done = 100%, state = 3 (closed), real_end_date = fecha actual
   */
  /**
   * GLPI guarda el contenido de las notas como HTML (a veces con las entidades escapadas,
   * p. ej. "&lt;p&gt;"). Se convierte a texto plano sin interpretar el HTML en la página.
   */
  static htmlToPlainText(html: string): string {
    if (!html) return '';
    // DOMParser no ejecuta scripts ni carga recursos: solo se usa para extraer texto
    const textOf = (value: string) =>
      new DOMParser().parseFromString(value, 'text/html').documentElement.textContent || '';
    // Si las etiquetas vienen escapadas ("&lt;p&gt;" o "&#60;p&#62;", como guarda GLPI 10 los
    // campos de texto enriquecido), primero se decodifican
    const source = /&(lt|#60);[a-z/]/i.test(html) ? textOf(html) : html;
    const withBreaks = source.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
    return textOf(withBreaks).replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Texto plano → HTML seguro para GLPI (escapa caracteres y respeta saltos de línea). */
  static plainTextToHtml(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return escaped
      .split(/\n{2,}/)
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  private static mapRawNote(item: any): GLPINote {
    const user = item.users_id;
    return {
      id: Number(item.id),
      content: this.htmlToPlainText(String(item.content || '')),
      date: item.date || item.date_creation || item.date_mod || '',
      // Con expand_dropdowns, users_id llega como nombre; si llega como número no hay nombre
      user_name: typeof user === 'string' && !/^\d+$/.test(user) ? user : undefined
    };
  }

  /**
   * Notas (Notepad) de una tarea de proyecto, de la más reciente a la más antigua.
   * Las notas se guardan como registros independientes en GLPI, así que forman un historial.
   */
  /** Notas de una tarea (o del proyecto, con itemtype 'Project'). No se heredan entre niveles. */
  static async getTaskNotes(session: GLPISession, taskId: number, itemtype: 'ProjectTask' | 'Project' = 'ProjectTask'): Promise<GLPINote[]> {
    if (session.isMock) {
      return [...(MOCK_TASK_NOTES[itemtype === 'Project' ? -taskId : taskId] || [])].sort((a, b) => b.date.localeCompare(a.date));
    }

    const response = await fetch(
      `${session.baseUrl}/apirest.php/${itemtype}/${taskId}/Notepad?expand_dropdowns=true&range=0-999`,
      {
        headers: {
          'Content-Type': 'application/json',
          'App-Token': session.appToken,
          'Session-Token': session.sessionToken
        }
      }
    );

    if (!response.ok) {
      throw new Error(`No se pudieron cargar las notas de la tarea (${response.status})`);
    }

    const raw = await response.json();
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any) => this.mapRawNote(item))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }

  /** Agrega una nota a una tarea de proyecto. */
  static async addTaskNote(session: GLPISession, taskId: number, text: string, itemtype: 'ProjectTask' | 'Project' = 'ProjectTask'): Promise<GLPINote> {
    const nowStr = this.toGlpiDateTime(new Date());

    if (session.isMock) {
      const note: GLPINote = {
        id: Date.now(),
        content: text,
        date: nowStr,
        user_name: session.username || 'Usuario Demo'
      };
      (MOCK_TASK_NOTES[itemtype === 'Project' ? -taskId : taskId] ||= []).push(note);
      return note;
    }

    const response = await fetch(`${session.baseUrl}/apirest.php/Notepad`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      },
      body: JSON.stringify({
        input: {
          itemtype,
          items_id: taskId,
          content: this.plainTextToHtml(text)
        }
      })
    });

    if (!response.ok) {
      let detail = '';
      try {
        const err = await response.json();
        if (Array.isArray(err) && err[1]) detail = `: ${err[1]}`;
      } catch { /* respuesta sin JSON */ }
      throw new Error(`No se pudo guardar la nota en GLPI (${response.status})${detail}`);
    }

    return {
      id: Date.now(),
      content: text,
      date: nowStr,
      user_name: [session.firstname, session.realname].filter(Boolean).join(' ') || session.username
    };
  }

  /**
   * Reduce una foto de la cámara (4-10 MB) a JPEG de máx. 1600 px por lado (~300-600 KB).
   * GLPI suele limitar las subidas a 2 MB (upload_max_filesize de PHP) y en el sitio la
   * señal móvil puede ser mala. createImageBitmap respeta la orientación EXIF del teléfono.
   */
  static async compressPhoto(file: Blob, maxSide = 1600, quality = 0.8): Promise<Blob> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no permite procesar la imagen');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen'))),
        'image/jpeg',
        quality
      );
    });
  }

  /** Fotos (Documents de imagen) ligadas a una tarea, de la más reciente a la más antigua. */
  static async getTaskPhotos(session: GLPISession, taskId: number): Promise<GLPITaskPhoto[]> {
    if (session.isMock) {
      return [...(MOCK_TASK_PHOTOS[taskId] || [])].sort((a, b) => b.date.localeCompare(a.date));
    }
    return this.getItemPhotos(session, 'ProjectTask', taskId);
  }

  /**
   * Fotos (Documents de imagen) ligadas a cualquier elemento de GLPI (tarea, computadora,
   * monitor...), de la más reciente a la más antigua.
   */
  static async getItemPhotos(session: GLPISession, itemtype: string, itemId: number): Promise<GLPITaskPhoto[]> {
    return this.getItemDocumentsOfKind(session, itemtype, itemId, 'image');
  }

  /** Documentos que no son imágenes (PDF, Office, etc.) ligados al elemento. */
  static async getItemDocuments(session: GLPISession, itemtype: string, itemId: number): Promise<GLPITaskPhoto[]> {
    return this.getItemDocumentsOfKind(session, itemtype, itemId, 'file');
  }

  private static async getItemDocumentsOfKind(session: GLPISession, itemtype: string, itemId: number, kind: 'image' | 'file'): Promise<GLPITaskPhoto[]> {
    if (session.isMock) {
      return [...(MOCK_ITEM_PHOTOS[`${itemtype}#${itemId}`] || [])]
        .filter(d => (d.mime ? d.mime.startsWith('image/') : true) === (kind === 'image'))
        .sort((a, b) => b.date.localeCompare(a.date));
    }

    const headers = {
      'Content-Type': 'application/json',
      'App-Token': session.appToken,
      'Session-Token': session.sessionToken
    };

    const linksRes = await fetch(
      `${session.baseUrl}/apirest.php/${itemtype}/${itemId}/Document_Item?range=0-999`,
      { headers }
    );
    if (!linksRes.ok) {
      throw new Error(`No se pudieron cargar ${kind === 'image' ? 'las fotos' : 'los documentos'} (${linksRes.status})`);
    }
    const links = await linksRes.json();
    if (!Array.isArray(links) || links.length === 0) return [];

    const documentIds = [...new Set(links.map((l: any) => Number(l.documents_id)).filter(Boolean))];
    const documents = await Promise.all(documentIds.map(async id => {
      const res = await fetch(`${session.baseUrl}/apirest.php/Document/${id}`, { headers });
      return res.ok ? res.json() : null;
    }));

    return documents
      .filter((doc: any) => doc && String(doc.mime || '').startsWith('image/') === (kind === 'image'))
      .map((doc: any) => ({
        id: Number(doc.id),
        name: doc.name || doc.filename || `${kind === 'image' ? 'Foto' : 'Documento'} ${doc.id}`,
        filename: doc.filename || '',
        mime: String(doc.mime || ''),
        date: doc.date_creation || doc.date_mod || '',
        categoryId: Number(doc.documentcategories_id) || undefined
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }

  /**
   * Descarga el archivo de una foto y devuelve un object URL para mostrarla.
   * GLPI exige los encabezados de sesión, así que no se puede usar la URL directo en <img>.
   * Quien lo llama debe liberar la URL con URL.revokeObjectURL al dejar de mostrarla.
   */
  /** Contenido de un documento de GLPI (para verlo dentro de la app). */
  static async getDocumentBlob(session: GLPISession, documentId: number): Promise<Blob> {
    if (session.isMock) {
      const doc = Object.values(MOCK_ITEM_PHOTOS).flat().find(d => d.id === documentId);
      if (!doc?.url) throw new Error('Documento demo no disponible');
      return (await fetch(doc.url)).blob();
    }
    const res = await fetch(`${session.baseUrl}/apirest.php/Document/${documentId}`, {
      headers: { 'Accept': 'application/octet-stream', 'App-Token': session.appToken, 'Session-Token': session.sessionToken }
    });
    if (!res.ok) throw new Error(`No se pudo descargar el documento (${res.status})`);
    return res.blob();
  }

  static async getPhotoObjectUrl(session: GLPISession, photo: GLPITaskPhoto): Promise<string> {
    if (session.isMock) return photo.url || '';

    const res = await fetch(`${session.baseUrl}/apirest.php/Document/${photo.id}`, {
      headers: {
        'Accept': 'application/octet-stream',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      }
    });
    if (!res.ok) throw new Error(`No se pudo descargar la foto (${res.status})`);
    return URL.createObjectURL(await res.blob());
  }

  /**
   * Sube una foto (ya comprimida) como Document de GLPI con su rubro (Previo/Post) y la liga
   * a la tarea. `index` distingue los nombres de archivo de fotos subidas en el mismo segundo.
   */
  static async uploadTaskPhoto(
    session: GLPISession,
    taskId: number,
    taskName: string,
    photo: Blob,
    categoryId: number,
    index = 0
  ): Promise<GLPITaskPhoto> {
    const stamp = this.toGlpiDateTime(new Date());
    const category = PHOTO_CATEGORIES.find(c => c.id === categoryId);
    const categorySlug = category ? category.label.split(' ')[0].toLowerCase() : 'foto';

    if (session.isMock) {
      const name = `${category?.label || 'Foto'} - ${taskName} - ${stamp} (${index + 1})`;
      const photoEntry: GLPITaskPhoto = { id: Date.now() + index, name, filename: `${name}.jpg`, date: stamp, categoryId, url: URL.createObjectURL(photo) };
      (MOCK_TASK_PHOTOS[taskId] ||= []).push(photoEntry);
      return photoEntry;
    }

    return this.uploadItemPhoto(session, {
      itemtype: 'ProjectTask',
      itemId: taskId,
      name: `${category?.label || 'Foto'} - ${taskName} - ${stamp} (${index + 1})`,
      filename: `mantenimiento_${taskId}_${categorySlug}_${stamp.replace(/[-: ]/g, '')}_${index + 1}.jpg`,
      categoryId,
      photo
    });
  }

  /**
   * Sube una foto (ya comprimida) como Document de GLPI con su rubro y la liga a cualquier
   * elemento (tarea, computadora, monitor...). Dos pasos: crear el Document y el Document_Item.
   */
  static async uploadItemPhoto(
    session: GLPISession,
    params: { itemtype: string; itemId: number; name: string; filename: string; categoryId: number; photo: Blob }
  ): Promise<GLPITaskPhoto> {
    const { itemtype, itemId, name, filename, categoryId, photo } = params;
    const stamp = this.toGlpiDateTime(new Date());

    if (session.isMock) {
      const entry: GLPITaskPhoto = { id: Date.now() + Math.floor(Math.random() * 1000), name, filename, date: stamp, categoryId, mime: photo.type, url: URL.createObjectURL(photo) };
      (MOCK_ITEM_PHOTOS[`${itemtype}#${itemId}`] ||= []).push(entry);
      return entry;
    }

    const authHeaders = {
      'App-Token': session.appToken,
      'Session-Token': session.sessionToken
    };
    const readError = async (res: Response) => {
      try {
        const err = await res.json();
        return Array.isArray(err) && err[1] ? `: ${err[1]}` : '';
      } catch {
        return '';
      }
    };

    // 1) Crear el Document con el archivo (multipart: uploadManifest + filename[0])
    const form = new FormData();
    form.append('uploadManifest', JSON.stringify({
      input: { name, documentcategories_id: categoryId, _filename: [filename] }
    }));
    form.append('filename[0]', photo, filename);
    // Sin Content-Type: el navegador lo pone con el boundary del multipart
    const docRes = await fetch(`${session.baseUrl}/apirest.php/Document`, {
      method: 'POST',
      headers: authHeaders,
      body: form
    });
    if (!docRes.ok) {
      throw new Error(`No se pudo subir la foto a GLPI (${docRes.status})${await readError(docRes)}`);
    }
    const created = await docRes.json();
    const documentId = Number(created?.id);
    if (!documentId) throw new Error('GLPI no devolvió el ID del documento creado');

    // 2) Ligar el Document al elemento
    const linkRes = await fetch(`${session.baseUrl}/apirest.php/Document_Item`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { documents_id: documentId, itemtype, items_id: itemId } })
    });
    if (!linkRes.ok) {
      throw new Error(`La foto se subió (documento #${documentId}) pero no se pudo ligar (${linkRes.status})${await readError(linkRes)}`);
    }

    return { id: documentId, name, filename, date: stamp, categoryId, url: URL.createObjectURL(photo) };
  }

  /**
   * Participantes (pestaña "Equipo" de cada tarea) de un conjunto de tareas, ya con nombre.
   * Se descarga toda la tabla ProjectTaskTeam de una vez (pocas peticiones) en lugar de
   * pedirla tarea por tarea, y luego se resuelve el nombre de cada usuario/grupo una sola vez.
   */
  static async getTaskParticipants(session: GLPISession, taskIds: number[]): Promise<Record<number, TaskParticipant[]>> {
    const wanted = new Set(taskIds);

    if (session.isMock) {
      const result: Record<number, TaskParticipant[]> = {};
      Object.entries(MOCK_TASK_PARTICIPANTS).forEach(([taskId, list]) => {
        if (wanted.has(Number(taskId))) result[Number(taskId)] = [...list];
      });
      return result;
    }

    const rows = (await this.fetchAllPages(session, 'ProjectTaskTeam'))
      .filter((row: any) => wanted.has(Number(row.projecttasks_id)));

    // Resolver nombres: una petición por participante distinto (normalmente pocos)
    const headers = {
      'Content-Type': 'application/json',
      'App-Token': session.appToken,
      'Session-Token': session.sessionToken
    };
    const nameCache = new Map<string, Promise<string>>();
    const resolveName = (itemtype: string, id: number): Promise<string> => {
      const key = `${itemtype}#${id}`;
      if (!nameCache.has(key)) {
        nameCache.set(key, (async () => {
          try {
            const res = await fetch(`${session.baseUrl}/apirest.php/${itemtype}/${id}`, { headers });
            if (!res.ok) return `${itemtype} #${id}`;
            const item = await res.json();
            // Usuarios: nombre de pila + apellidos; si no están capturados, el login
            if (itemtype === 'User') return this.userDisplayName(item);
            return item.completename || item.name || `${itemtype} #${id}`;
          } catch {
            return `${itemtype} #${id}`;
          }
        })());
      }
      return nameCache.get(key)!;
    };

    const resolved = await Promise.all(rows.map(async (row: any) => ({
      taskId: Number(row.projecttasks_id),
      participant: {
        itemtype: String(row.itemtype),
        id: Number(row.items_id),
        name: await resolveName(String(row.itemtype), Number(row.items_id)),
        rowId: Number(row.id)
      }
    })));

    const result: Record<number, TaskParticipant[]> = {};
    resolved.forEach(({ taskId, participant }) => {
      (result[taskId] ||= []).push(participant);
    });
    return result;
  }

  static userDisplayName(item: any): string {
    const fullName = [item.firstname, item.realname].filter(Boolean).join(' ').trim();
    return fullName || item.name || `Usuario #${item.id}`;
  }

  private static activeUsersCache = new Map<string, Promise<GLPIUserOption[]>>();

  /** Usuarios activos de GLPI, ordenados por nombre (se cachea durante la sesión). */
  static getActiveUsers(session: GLPISession): Promise<GLPIUserOption[]> {
    if (session.isMock) return Promise.resolve(MOCK_USERS);

    const key = session.sessionToken;
    if (!this.activeUsersCache.has(key)) {
      const promise = this.fetchAllPages(session, 'User').then(rows =>
        rows
          .filter((u: any) => Number(u.is_active) === 1 && !Number(u.is_deleted))
          .map((u: any) => ({ id: Number(u.id), name: this.userDisplayName(u), login: String(u.name || '') }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      );
      // Si falla, no dejar el error en caché: el siguiente intento vuelve a pedirlos
      promise.catch(() => this.activeUsersCache.delete(key));
      this.activeUsersCache.set(key, promise);
    }
    return this.activeUsersCache.get(key)!;
  }

  /** Asigna un usuario como participante (pestaña "Equipo") de la tarea. */
  static async addTaskParticipant(session: GLPISession, taskId: number, user: GLPIUserOption): Promise<TaskParticipant> {
    if (session.isMock) {
      const participant = { itemtype: 'User', id: user.id, name: user.name, rowId: Date.now() };
      (MOCK_TASK_PARTICIPANTS[taskId] ||= []).push(participant);
      return participant;
    }

    const res = await fetch(`${session.baseUrl}/apirest.php/ProjectTaskTeam`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      },
      body: JSON.stringify({ input: { projecttasks_id: taskId, itemtype: 'User', items_id: user.id } })
    });
    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        if (Array.isArray(err) && err[1]) detail = `: ${err[1]}`;
      } catch { /* respuesta sin JSON */ }
      throw new Error(`No se pudo asignar a ${user.name} (${res.status})${detail}`);
    }
    const created = await res.json();
    return { itemtype: 'User', id: user.id, name: user.name, rowId: Number(created?.id) || undefined };
  }

  /** Quita un participante de la tarea (borra su registro ProjectTaskTeam). */
  static async removeTaskParticipant(session: GLPISession, taskId: number, participant: TaskParticipant): Promise<void> {
    if (session.isMock) {
      MOCK_TASK_PARTICIPANTS[taskId] = (MOCK_TASK_PARTICIPANTS[taskId] || []).filter(p => p.rowId !== participant.rowId);
      return;
    }
    if (!participant.rowId) throw new Error(`No se encontró el registro de ${participant.name} en GLPI`);

    const res = await fetch(`${session.baseUrl}/apirest.php/ProjectTaskTeam/${participant.rowId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      }
    });
    if (!res.ok) throw new Error(`No se pudo quitar a ${participant.name} (${res.status})`);
  }

  static async putItem(session: GLPISession, itemtype: string, id: number, input: Record<string, unknown>, what: string): Promise<void> {
    const res = await fetch(`${session.baseUrl}/apirest.php/${itemtype}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      },
      body: JSON.stringify({ input: { id, ...input } })
    });
    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        if (Array.isArray(err) && err[1]) detail = `: ${err[1]}`;
      } catch { /* respuesta sin JSON */ }
      throw new Error(`No se pudo guardar ${what} en GLPI (${res.status})${detail}`);
    }
    // GLPI responde 200 aunque rechace el cambio (p. ej. sin permiso): viene [{ "<id>": false, message }]
    try {
      const body = await res.json();
      const result = Array.isArray(body) ? body[0] : body;
      if (result && result[String(id)] === false) {
        throw new Error(`GLPI rechazó el cambio de ${what}${result.message ? `: ${result.message}` : ''}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('GLPI rechazó')) throw err;
    }
  }

  /** Edita el nombre y/o la tarea padre ("Debajo de", 0 = nivel superior) de una tarea. */
  static async updateProjectTask(
    session: GLPISession,
    taskId: number,
    changes: { name?: string; projecttasks_id?: number }
  ): Promise<void> {
    if (session.isMock) {
      Object.values(MOCK_PROJECT_TASKS).flat()
        .filter(t => t.id === taskId)
        .forEach(t => Object.assign(t, changes));
      return;
    }
    await this.putItem(session, 'ProjectTask', taskId, changes, 'la tarea');
  }

  /** Edita el nombre de un proyecto. */
  static async updateProjectName(session: GLPISession, projectId: number, name: string): Promise<void> {
    if (session.isMock) {
      MOCK_PROJECTS.filter(p => p.id === projectId).forEach(p => { p.name = name; });
      return;
    }
    await this.putItem(session, 'Project', projectId, { name }, 'el proyecto');
  }

  /** Elemento relacionado por tarea (key: id de tarea), según el plugin Campos adicionales. */
  static async getTaskElements(session: GLPISession, taskIds: number[]): Promise<Record<number, LinkedElement>> {
    const wanted = new Set(taskIds);
    if (session.isMock) {
      const result: Record<number, LinkedElement> = {};
      Object.entries(MOCK_TASK_ELEMENTS).forEach(([taskId, el]) => {
        if (wanted.has(Number(taskId))) result[Number(taskId)] = el;
      });
      return result;
    }

    const rows = await this.fetchAllPages(session, TASK_ELEMENTS_ITEMTYPE);
    const result: Record<number, LinkedElement> = {};
    rows.forEach((row: any) => {
      const taskId = Number(row.items_id);
      const itemtype = String(row[TASK_ELEMENT_TYPE_FIELD] || '');
      const id = Number(row[TASK_ELEMENT_ID_FIELD]) || 0;
      if (row.itemtype === 'ProjectTask' && wanted.has(taskId) && itemtype && id > 0) {
        result[taskId] = { itemtype, id };
      }
    });
    return result;
  }

  /** Elementos relacionados con un proyecto (pestaña "Elementos" nativa de GLPI, Item_Project). */
  static async getProjectElements(session: GLPISession, projectId: number): Promise<LinkedElement[]> {
    if (session.isMock) return MOCK_PROJECT_ELEMENTS[projectId] || [];

    const rows = await this.fetchAllPages(session, `Project/${projectId}/Item_Project`);
    return rows
      .map((row: any) => ({ itemtype: String(row.itemtype), id: Number(row.items_id) }))
      .filter(el => el.itemtype && el.id > 0);
  }

  private static physicalTagOptionCache = new Map<string, Promise<string | null>>();

  /**
   * Número de opción de búsqueda del campo "Etiqueta Física" para un tipo de activo (lo asigna
   * el plugin; se busca por nombre de campo). null si ese tipo no tiene el campo configurado.
   */
  static getPhysicalTagOption(session: GLPISession, itemtype = 'Computer'): Promise<string | null> {
    const key = `${session.baseUrl}#${itemtype}`;
    if (!this.physicalTagOptionCache.has(key)) {
      const promise = (async () => {
        const res = await fetch(`${session.baseUrl}/apirest.php/listSearchOptions/${itemtype}`, {
          headers: { 'App-Token': session.appToken, 'Session-Token': session.sessionToken }
        });
        if (!res.ok) return null;
        const options = await res.json();
        const found = Object.entries(options || {}).find(([, opt]: [string, any]) => opt?.field === PHYSICAL_TAG_FIELD);
        return found ? found[0] : null;
      })();
      promise.catch(() => this.physicalTagOptionCache.delete(key));
      this.physicalTagOptionCache.set(key, promise);
    }
    return this.physicalTagOptionCache.get(key)!;
  }

  /** Nombre, etiqueta física y ubicación de un elemento del inventario. */
  static async getElementDetails(session: GLPISession, element: LinkedElement): Promise<ElementDetails> {
    if (session.isMock) {
      return MOCK_ELEMENT_DETAILS[`${element.itemtype}#${element.id}`]
        || { ...element, name: `${element.itemtype} #${element.id}` };
    }

    const headers = { 'App-Token': session.appToken, 'Session-Token': session.sessionToken };

    // De la ficha sin expandir salen los IDs: el del usuario asignado (para su nombre completo:
    // el buscador solo da el login) y el de la ubicación (para abrirla en el croquis)
    const resolveRefs = async (): Promise<{ userName?: string; locationId?: number }> => {
      try {
        const itemRes = await fetch(`${session.baseUrl}/apirest.php/${element.itemtype}/${element.id}`, { headers });
        if (!itemRes.ok) return {};
        const raw = await itemRes.json();
        const locationId = Number(raw?.locations_id) || undefined;
        const userId = Number(raw?.users_id) || 0;
        if (!userId) return { locationId };
        const userRes = await fetch(`${session.baseUrl}/apirest.php/User/${userId}`, { headers });
        return { locationId, userName: userRes.ok ? this.userDisplayName(await userRes.json()) : undefined };
      } catch {
        return {};
      }
    };

    // Computadoras: el buscador de GLPI trae nombre (1), ubicación completa (3), número de
    // serie (5) y la etiqueta del plugin en una sola consulta; el usuario se resuelve en paralelo
    if (element.itemtype === 'Computer') {
      const tagOption = await this.getPhysicalTagOption(session).catch(() => null);
      const params = new URLSearchParams({
        'criteria[0][field]': '2',
        'criteria[0][searchtype]': 'equals',
        'criteria[0][value]': String(element.id),
        'forcedisplay[0]': '1',
        'forcedisplay[1]': '3',
        'forcedisplay[2]': '5'
      });
      if (tagOption) params.set('forcedisplay[3]', tagOption);
      const [res, refs] = await Promise.all([
        fetch(`${session.baseUrl}/apirest.php/search/Computer?${params}`, { headers }),
        resolveRefs()
      ]);
      if (res.ok) {
        const row = (await res.json())?.data?.[0];
        if (row) {
          return {
            ...element,
            name: row['1'] || `Computadora #${element.id}`,
            location: row['3'] || undefined,
            locationId: refs.locationId,
            serial: row['5'] || undefined,
            userName: refs.userName,
            physicalTag: tagOption ? row[tagOption] || undefined : undefined
          };
        }
      }
    }

    // Otros tipos (o si el buscador falla): ficha directa con la ubicación expandida
    const [res, refs] = await Promise.all([
      fetch(`${session.baseUrl}/apirest.php/${element.itemtype}/${element.id}?expand_dropdowns=true`, { headers }),
      resolveRefs()
    ]);
    if (!res.ok) throw new Error(`No se pudo consultar el elemento (${res.status})`);
    const item = await res.json();
    const location = typeof item.locations_id === 'string' && item.locations_id !== '0'
      ? this.htmlToPlainText(item.locations_id)
      : undefined;
    return {
      ...element,
      name: item.name || `${element.itemtype} #${element.id}`,
      serial: item.serial || undefined,
      userName: refs.userName,
      location,
      locationId: refs.locationId
    };
  }

  /** Fecha/hora LOCAL en formato GLPI ("YYYY-MM-DD HH:MM:SS"). toISOString() daría UTC (+6 h en México). */
  static toGlpiDateTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private static closedStateIdCache = new Map<string, number>();

  /**
   * ID del estado de proyecto "terminado" (Closed). Se busca el ProjectState con
   * is_finished = 1 en vez de fijarlo en el código, porque el ID depende de cada instalación.
   */
  /** Tareas demo de un proyecto (para crear tareas en modo demo). */
  static mockProjectTasks(projectId: number): GLPIProjectTask[] {
    // Los proyectos demo sin tareas propias reciben una copia de las del proyecto 1
    return (MOCK_PROJECT_TASKS[projectId] ||= (MOCK_PROJECT_TASKS[1] || []).map(t => ({ ...t, projects_id: projectId })));
  }

  static async getClosedProjectStateId(session: GLPISession): Promise<number> {
    const cached = this.closedStateIdCache.get(session.baseUrl);
    if (cached) return cached;

    const fallbackId = 3; // "Closed" en una instalación por defecto de GLPI
    try {
      const response = await fetch(`${session.baseUrl}/apirest.php/ProjectState?range=0-100`, {
        headers: {
          'Content-Type': 'application/json',
          'App-Token': session.appToken,
          'Session-Token': session.sessionToken
        }
      });
      if (response.ok) {
        const states = await response.json();
        const finished = Array.isArray(states)
          ? states.find((st: any) => Number(st.is_finished) === 1)
          : null;
        if (finished?.id) {
          this.closedStateIdCache.set(session.baseUrl, Number(finished.id));
          return Number(finished.id);
        }
      }
    } catch (err) {
      console.warn('[GLPI] No se pudo consultar ProjectState, se usa el estado por defecto:', err);
    }
    return fallbackId;
  }

  /**
   * Concluye un hito con 1 clic: percent_done = 100, estado Closed y su marca de tiempo en
   * real_start_date. Un hito es un instante: no lleva fin real (las tareas padre calculan sus
   * fechas reales a partir de estas marcas, ver ProjectTaskService.syncRollups).
   */
  static async completeTaskMilestone(session: GLPISession, taskId: number, currentProjectId: number = 1): Promise<GLPIProjectTask> {
    const nowStr = this.toGlpiDateTime(new Date());

    if (session.isMock) {
      const found = this.mockProjectTasks(currentProjectId).find(t => t.id === taskId);
      if (found) {
        found.percent_done = 100;
        found.state = 3;
        found.real_start_date = nowStr;
        found.state_name = 'Concluida';
        return { ...found };
      }
    }

    const url = this.appendQueryParams(
      `${session.baseUrl}/apirest.php/ProjectTask/${taskId}`,
      { app_token: session.appToken, session_token: session.sessionToken }
    );

    const closedStateId = await this.getClosedProjectStateId(session);
    const payload = {
      input: {
        id: taskId,
        percent_done: 100,
        // El estado de una ProjectTask es projectstates_id; un campo "state" GLPI lo ignora
        projectstates_id: closedStateId,
        // Un hito es un instante: su marca de tiempo es el inicio real. No se toca
        // plan_end_date: es la planificación original y sobrescribirla alteraba el orden
        // de las tareas en el árbol.
        real_start_date: nowStr
      }
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': session.appToken,
        'Session-Token': session.sessionToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Error al actualizar el hito en GLPI (${response.status})`);
    }

    // Actualizar mock o retorno local
    const tasks = MOCK_PROJECT_TASKS[currentProjectId] || MOCK_PROJECT_TASKS[1] || [];
    const found = tasks.find(t => t.id === taskId);
    if (found) {
      found.percent_done = 100;
      found.state = 3;
      found.real_start_date = nowStr;
      found.state_name = 'Concluida';
      return { ...found };
    }

    return {
      id: taskId,
      projects_id: currentProjectId,
      projecttasks_id: 0,
      name: '',
      percent_done: 100,
      is_milestone: true,
      state: 3,
      real_start_date: nowStr,
      state_name: 'Concluida'
    };
  }
}

// Datos MOCK para Proyectos y Tareas en Estructura de Árbol
const MOCK_PROJECTS: GLPIProject[] = [
  {
    id: 1,
    name: 'MANTENIMIENTO SEMESTRAL DE EQUIPOS DE COMPUTO (2DO SEMESTRE)',
    content: 'Proyecto de mantenimiento preventivo y correctivo para equipos de cómputo.',
    percent_done: 64,
    date: '2026-08-01 09:00:00',
    date_mod: new Date().toISOString(),
    code: 'PRJ-2026-MNT2',
    state_name: 'En curso',
    tasks_count: 13
  },
  {
    id: 2,
    name: 'MIGRACIÓN DE INFRAESTRUCTURA Y SERVIDORES',
    content: 'Actualización y migración de hipervisores y servidores.',
    percent_done: 20,
    date: '2026-09-15 10:00:00',
    date_mod: new Date().toISOString(),
    code: 'PRJ-2026-INFRA',
    state_name: 'En curso',
    tasks_count: 5
  }
];

const MOCK_TASK_PHOTOS: Record<number, GLPITaskPhoto[]> = {};
const MOCK_ITEM_PHOTOS: Record<string, GLPITaskPhoto[]> = {};

const MOCK_TASK_ELEMENTS: Record<number, LinkedElement> = {
  21: { itemtype: 'Computer', id: 89 }
};

const MOCK_PROJECT_ELEMENTS: Record<number, LinkedElement[]> = {
  1: [{ itemtype: 'Computer', id: 89 }]
};

const MOCK_ELEMENT_DETAILS: Record<string, ElementDetails> = {
  'Computer#89': {
    itemtype: 'Computer',
    id: 89,
    name: 'GhersonMenaPC',
    physicalTag: 'PC-000103',
    serial: 'MXL1234ABC',
    userName: 'Gherson Eliezer Mena Alvarado',
    location: 'Oficinas ACERO > Planta Baja > Sistemas > 8 Posicion',
    locationId: 1
  }
};

const MOCK_USERS: GLPIUserOption[] = [
  { id: 1, name: 'GLPI Demo', login: 'demo' }, // el usuario de la sesión demo
  { id: 3, name: 'Ana López', login: 'alopez' },
  { id: 4, name: 'Carlos Ruiz', login: 'cruiz' },
  { id: 2, name: 'Juan Pérez', login: 'jperez' }
];

const MOCK_TASK_PARTICIPANTS: Record<number, TaskParticipant[]> = {
  21: [{ itemtype: 'User', id: 2, name: 'Juan Pérez', rowId: 1 }],
  24: [{ itemtype: 'User', id: 2, name: 'Juan Pérez', rowId: 2 }],
  25: [
    { itemtype: 'User', id: 2, name: 'Juan Pérez', rowId: 3 },
    { itemtype: 'User', id: 3, name: 'Ana López', rowId: 4 }
  ],
  27: [{ itemtype: 'Group', id: 1, name: 'Soporte Técnico', rowId: 5 }]
};

const MOCK_TASK_NOTES: Record<number, GLPINote[]> = {
  22: [
    { id: 1, content: 'Se agendó con el usuario para el sábado 10 a las 9:00.', date: '2026-10-08 17:45:00', user_name: 'Usuario Demo' }
  ]
};

const MOCK_PROJECT_TASKS: Record<number, GLPIProjectTask[]> = {
  1: [
    // --- RAMA 1: 5 DE SEPTIEMBRE ---
    {
      id: 10,
      projects_id: 1,
      projecttasks_id: 0,
      name: 'MANTENIMIENTO PROGRAMADOS PARA 5 DE SEPTIEMBRE DEL 2026',
      percent_done: 100,
      is_milestone: false,
      state: 3,
      plan_start_date: '2026-09-05 08:00:00',
      plan_end_date: '2026-09-05 18:00:00',
      real_end_date: '2026-09-05 17:30:00',
      state_name: 'Concluida'
    },
    {
      id: 11,
      projects_id: 1,
      projecttasks_id: 10,
      name: 'MANTENIMIENTO EQUIPO DE BERENICE',
      percent_done: 100,
      is_milestone: false,
      state: 3,
      real_end_date: '2026-09-05 10:00:00',
      state_name: 'Concluida'
    },
    {
      id: 12,
      projects_id: 1,
      projecttasks_id: 10,
      name: 'MANTENIMIENTO DE EQUIPO JOAQUIN GIL GARCIA',
      percent_done: 100,
      is_milestone: false,
      state: 3,
      real_end_date: '2026-09-05 12:00:00',
      state_name: 'Concluida'
    },
    {
      id: 13,
      projects_id: 1,
      projecttasks_id: 10,
      name: 'MANTENIMIENTO DE EQUIPO DE ENRIQUE VALLADARES',
      percent_done: 100,
      is_milestone: false,
      state: 3,
      real_end_date: '2026-09-05 14:30:00',
      state_name: 'Concluida'
    },
    {
      id: 14,
      projects_id: 1,
      projecttasks_id: 10,
      name: 'MANTENIMIENTO DE EQUIPO ROBERTO RODALL',
      percent_done: 100,
      is_milestone: false,
      state: 3,
      real_end_date: '2026-09-05 17:00:00',
      state_name: 'Concluida'
    },

    // --- RAMA 2: 10 DE OCTUBRE ---
    {
      id: 20,
      projects_id: 1,
      projecttasks_id: 0,
      name: 'MANTENIMIENTO PROGRAMADOS PARA 10 DE OCTUBRE DEL 2026',
      percent_done: 28,
      is_milestone: false,
      state: 2,
      plan_start_date: '2026-10-10 08:00:00',
      plan_end_date: '2026-10-10 18:00:00',
      state_name: 'En proceso'
    },
    {
      id: 21,
      projects_id: 1,
      projecttasks_id: 20,
      name: 'MANTENIMIENTO DE EQUIPO DE GHERSON MENA',
      percent_done: 28,
      is_milestone: false,
      state: 2,
      state_name: 'En proceso'
    },
    {
      id: 22,
      projects_id: 1,
      projecttasks_id: 21,
      name: 'PROGRAMACIÓN MANTENIMIENTO',
      percent_done: 100,
      is_milestone: true,
      state: 3,
      real_end_date: '2026-10-09 09:00:00',
      state_name: 'Concluida'
    },
    {
      id: 23,
      projects_id: 1,
      projecttasks_id: 21,
      name: 'AVISO A USUARIO DE MANTENIMIENTO',
      percent_done: 100,
      is_milestone: false,
      state: 3,
      real_end_date: '2026-10-09 10:30:00',
      state_name: 'Concluida'
    },
    {
      id: 24,
      projects_id: 1,
      projecttasks_id: 21,
      name: 'MANTENIMIENTO INICIADO',
      percent_done: 0,
      is_milestone: true,
      state: 1,
      state_name: 'No iniciada'
    },
    {
      id: 25,
      projects_id: 1,
      projecttasks_id: 21,
      name: 'MANTENIMIENTO TERMINADO',
      percent_done: 0,
      is_milestone: true,
      state: 1,
      state_name: 'No iniciada'
    },
    {
      id: 26,
      projects_id: 1,
      projecttasks_id: 21,
      name: 'SUBIDA DE EVIDENCIAS',
      percent_done: 0,
      is_milestone: true,
      state: 1,
      state_name: 'No iniciada'
    },
    {
      id: 27,
      projects_id: 1,
      projecttasks_id: 21,
      name: 'RESPONSIVA CREADA',
      percent_done: 0,
      is_milestone: true,
      state: 1,
      state_name: 'No iniciada'
    },
    {
      id: 28,
      projects_id: 1,
      projecttasks_id: 21,
      name: 'RESPONSIVA FIRMADA',
      percent_done: 0,
      is_milestone: true,
      state: 1,
      state_name: 'No iniciada'
    }
  ]
};

