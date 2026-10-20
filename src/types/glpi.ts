export interface GLPIAuthConfig {
  baseUrl: string;
  appToken: string;
  username?: string;
  password?: string;
  userToken?: string;
  useMock?: boolean;
}

export interface GLPISession {
  sessionToken: string;
  baseUrl: string;
  appToken: string;
  userToken?: string;
  username?: string;
  realname?: string;
  firstname?: string;
  userId?: number;
  activeProfile?: string;
  activeEntity?: string;
  isMock?: boolean;
}

export interface GLPITicket {
  id: number;
  name: string;
  content: string;
  status: number; // 1: Nuevo, 2: En curso, 3: Planificado, 4: En espera, 5: Resuelto, 6: Cerrado
  priority: number;
  urgency: number;
  impact: number;
  date: string;
  date_mod: string;
  solvedate?: string;
  closedate?: string;
  users_id_recipient?: number;
  users_id_lastupdater?: number;
  itilcategories_id?: number;
  category_name?: string;
  user_name?: string;
  assigned_to?: string;
}

export interface GLPIFollowup {
  id: number;
  tickets_id: number;
  content: string;
  date: string;
  date_mod: string;
  users_id?: number;
  user_name?: string;
  is_private?: number;
}

export interface GLPIUserSessionInfo {
  session: {
    glpi_plugins?: any;
    glpiID?: number;
    glpiname?: string;
    glpirealname?: string;
    glpifirstname?: string;
    glpiactiveprofile?: {
      id: number;
      name: string;
    };
    glpiactive_entity?: {
      id: number;
      name: string;
    };
  };
}

// Modelos para Proyectos y Tareas de GLPI (WBS Tree Hierarchy)
export interface GLPIProject {
  id: number;
  name: string;
  content?: string;
  percent_done: number; // 0 - 100
  date: string;
  date_mod: string;
  code?: string;
  projectstates_id?: number;
  state_name?: string;
  tasks_count?: number;
}

// Cabecera de un proyecto nuevo (fechas en formato del input datetime-local: "YYYY-MM-DDTHH:MM")
export interface ProjectHeaderForm {
  name: string;
  priority: number;
  projectstates_id: number;
  projecttypes_id: number;  // 0 = sin tipo
  users_id: number;         // administrador del proyecto
  plan_start_date: string;
  real_start_date: string;
  content: string;
  members: number[];        // usuarios integrantes (equipo del proyecto)
}

export interface ProjectCatalogOption {
  id: number;
  label: string;
}

export interface GLPIProjectTask {
  id: number;
  projects_id: number;
  projecttasks_id: number; // ID de la tarea padre (0 si es tarea raíz)
  parent_name_ref?: string; // Referencia por nombre si GLPI devuelve el dropdown expandido
  name: string;
  content?: string;
  percent_done: number; // 0 - 100
  is_milestone: boolean; // Flag de Hito / Milestone
  state: number; // 1: No iniciada, 2: En proceso, 3: Concluida/Cerrada
  plan_start_date?: string;
  plan_end_date?: string;
  real_start_date?: string;
  real_end_date?: string;
  state_name?: string;
  projectstates_id?: number;
  planned_duration?: number;   // segundos
  effective_duration?: number; // segundos
}

export interface ProjectTaskNode extends GLPIProjectTask {
  children: ProjectTaskNode[];
  level: number;
  isExpanded?: boolean;
}

// Nota (Notepad) de GLPI asociada a un elemento: historial de comentarios de una tarea
export interface GLPINote {
  id: number;
  content: string; // texto plano (ya sin HTML)
  date: string;
  user_name?: string;
}

// Foto (Document de GLPI) ligada a una tarea de proyecto
export interface GLPITaskPhoto {
  id: number; // documents_id
  name: string;
  filename: string;
  date: string;
  categoryId?: number; // documentcategories_id (Previo / Post mantenimiento)
  mime?: string;
  url?: string; // object URL local para mostrar la imagen (se descarga con la sesión)
}

// Rubro de documento de GLPI con el que se clasifican las fotos de evidencia
export interface PhotoCategory {
  id: number; // documentcategories_id
  label: string;
}

// Participante (ProjectTaskTeam) de una tarea de proyecto, ya con su nombre resuelto
export interface TaskParticipant {
  itemtype: string; // User, Group, Supplier o Contact
  id: number;
  name: string;
  rowId?: number; // id del registro ProjectTaskTeam (para poder quitarlo)
}

// Usuario de GLPI que se puede asignar como responsable
export interface GLPIUserOption {
  id: number;
  name: string; // "Nombre Apellido" o login
  login: string;
}

// Elemento del inventario (computadora, monitor...) relacionado con un proyecto o una tarea
export interface LinkedElement {
  itemtype: string; // Computer, Monitor, Printer...
  id: number;
}

// Datos que se muestran al ver un elemento relacionado
export interface ElementDetails {
  itemtype: string;
  id: number;
  name: string;
  physicalTag?: string; // "Etiqueta Física" (plugin Campos adicionales, solo computadoras)
  serial?: string;      // número de serie
  userName?: string;    // usuario que tiene asignado el equipo
  location?: string;    // ruta completa de la ubicación
  locationId?: number;  // id de la ubicación (para abrirla en el croquis)
}
