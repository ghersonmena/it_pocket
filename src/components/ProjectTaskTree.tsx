import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GLPISession, GLPIProject, GLPIProjectTask, ProjectTaskNode, TaskParticipant, LinkedElement } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { ProjectTaskService } from '../services/projectTaskService';
import { TaskFormView } from './TaskFormView';
import { TaskDetailView } from './TaskDetailView';
import { TaskNotes } from './TaskNotes';
import { TaskPhotos } from './TaskPhotos';
import { AssignParticipants } from './AssignParticipants';
import { EditTaskSheet } from './EditTaskSheet';
import { ElementDetailSheet } from './ElementDetailSheet';
import { 
  Folder, 
  ChevronRight, 
  ChevronDown, 
  Square, 
  Flag, 
  CheckCircle2, 
  ArrowLeft, 
  RefreshCw, 
  Sparkles,
  Layers,
  MessageSquare,
  Camera,
  User as UserIcon,
  Users as UsersIcon,
  UserPlus,
  Pencil,
  CalendarDays,
  Monitor,
  Eye,
  Plus
} from 'lucide-react';

const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Orden del flujo de mantenimiento. Se busca por palabra clave para tolerar
// variaciones en el nombre ("MANTENIMIENTO EVIDENCIAS" / "SUBIDA DE EVIDENCIAS").
const MAINTENANCE_STEPS: RegExp[] = [
  /PROGRAMACION/,
  /AVISO/,
  /INICIAD/,
  /TERMINAD|FINALIZAD/,
  /EVIDENCIA/,
  /RESPONSIVA.*CREAD/,
  /RESPONSIVA.*FIRMAD/
];

// Solo aplica a tareas hoja, para no confundir grupos como "MANTENIMIENTO PROGRAMADOS PARA ..."
const getStepRank = (node: ProjectTaskNode): number | null => {
  if (node.children.length > 0) return null;
  const name = stripAccents(node.name);
  const idx = MAINTENANCE_STEPS.findIndex(re => re.test(name));
  return idx === -1 ? null : idx;
};

const MONTHS: Record<string, number> = {
  ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3, MAYO: 4, JUNIO: 5, JULIO: 6,
  AGOSTO: 7, SEPTIEMBRE: 8, SETIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11
};

// Extrae fechas escritas en el nombre: "5 DE SEPTIEMBRE DEL 2026", "10 DE OCTUBRE 2026"
const parseDateFromName = (name: string): number | null => {
  const m = stripAccents(name).match(/(\d{1,2})\s+DE\s+([A-Z]+)(?:\s+(?:DEL?\s+)?(\d{4}))?/);
  if (!m || MONTHS[m[2]] === undefined) return null;
  const year = m[3] ? Number(m[3]) : new Date().getFullYear();
  return new Date(year, MONTHS[m[2]], Number(m[1])).getTime();
};

const parseGlpiDate = (value?: string): number | null => {
  if (!value) return null;
  const t = new Date(value.replace(' ', 'T')).getTime();
  return isNaN(t) ? null : t;
};

const getSortDate = (node: ProjectTaskNode): number | null =>
  parseDateFromName(node.name) ?? parseGlpiDate(node.plan_start_date);

type TreeView =
  | { kind: 'tree' }
  | { kind: 'new'; parent: { id: number; name: string } | null }
  | { kind: 'task'; id: number };

const findNode = (nodes: ProjectTaskNode[], id: number): ProjectTaskNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
};

interface ProjectTaskTreeProps {
  session: GLPISession;
  project: GLPIProject;
  onBack: () => void;
}

export const ProjectTaskTree: React.FC<ProjectTaskTreeProps> = ({ session, project, onBack }) => {
  const [flatTasks, setFlatTasks] = useState<GLPIProjectTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Estado para controlar cuáles nodos del árbol están expandidos (key: task.id)
  const [expandedNodes, setExpandedNodes] = useState<Record<number, boolean>>({});

  // Panel de notas abierto por hito y conteo de notas ya cargadas (key: task.id)
  const [openNotes, setOpenNotes] = useState<Record<number, boolean>>({});
  const [noteCounts, setNoteCounts] = useState<Record<number, number>>({});
  // Panel de fotos abierto por equipo y conteo de fotos ya cargadas (key: task.id)
  const [openPhotos, setOpenPhotos] = useState<Record<number, boolean>>({});
  const [photoCounts, setPhotoCounts] = useState<Record<number, number>>({});
  // Participantes (pestaña "Equipo" de la tarea en GLPI) por tarea (key: task.id)
  const [participants, setParticipants] = useState<Record<number, TaskParticipant[]>>({});
  // Hasta que lleguen, no mostrar "Asignar responsable" en tareas que sí tienen responsables
  const [participantsLoaded, setParticipantsLoaded] = useState<boolean>(false);
  // Tarea cuyo selector de responsables está abierto
  const [assigningNode, setAssigningNode] = useState<ProjectTaskNode | null>(null);
  // Edición de nombre / "Debajo de": tarea en edición, o el propio proyecto
  const [editingNode, setEditingNode] = useState<ProjectTaskNode | null>(null);
  const [editingProject, setEditingProject] = useState<boolean>(false);
  const [projectName, setProjectName] = useState<string>(project.name);
  // Elementos del inventario relacionados: por tarea (plugin Campos adicionales) y del proyecto
  const [taskElements, setTaskElements] = useState<Record<number, LinkedElement>>({});
  const [projectElements, setProjectElements] = useState<LinkedElement[]>([]);
  const [viewingElements, setViewingElements] = useState<{ elements: LinkedElement[]; name: string } | null>(null);
  // Fin previsto del proyecto: la tarea que termina más tarde (undefined = calculando)
  const [planEnd, setPlanEnd] = useState<string | null | undefined>(undefined);
  // Pantallas dentro del proyecto: árbol (pila vacía), nueva tarea o detalle de una tarea
  const [viewStack, setViewStack] = useState<TreeView[]>([]);
  const view: TreeView = viewStack[viewStack.length - 1] || { kind: 'tree' };
  const pushView = (next: TreeView) => setViewStack(stack => [...stack, next]);
  const popView = () => setViewStack(stack => stack.slice(0, -1));
  const [projectNotesOpen, setProjectNotesOpen] = useState<boolean>(false);

  const showToast = (msg: string, ms = 3500) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), ms);
  };

  // Fechas, duraciones, avance y estado de las tareas padre y del proyecto (se guardan en GLPI)
  const runSync = async (tasks: GLPIProjectTask[], options: { reopenIfPending?: boolean } = {}) => {
    try {
      const result = await ProjectTaskService.syncRollups(session, project.id, tasks, options);
      setFlatTasks(result.tasks);
      setPlanEnd(result.planEnd);
      if (result.projectClosed) showToast('Se concluyó el último hito: el proyecto quedó cerrado con su fecha de fin real.', 5000);
      if (result.projectReopened) showToast('El proyecto estaba cerrado y tiene tareas nuevas: se reabrió (en proceso, sin fecha de fin real).', 5000);
    } catch (err) {
      console.warn('No se pudieron actualizar los cálculos del proyecto:', err);
      setPlanEnd(prev => (prev === undefined ? null : prev));
    }
  };

  const fetchTasks = async (isRefresh = false, syncOptions: { reopenIfPending?: boolean } = {}) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await GLPIService.getProjectTasks(session, project.id);
      console.log(`[ProjectTaskTree] Proyecto "${project.name}" (ID: ${project.id}) → ${data.length} tareas cargadas`);
      if (data.length > 0) {
        console.log('[ProjectTaskTree] Ejemplo tarea[0]:', JSON.stringify(data[0]));
        const roots = data.filter(t => !t.projecttasks_id || t.projecttasks_id === 0);
        console.log(`[ProjectTaskTree] Tareas raíz (sin padre): ${roots.length}`, roots.map(t => `#${t.id} "${t.name}" pid=${t.projecttasks_id} parent_name_ref="${t.parent_name_ref || ''}"`));
      }
      setFlatTasks(data);

      // Cálculos automáticos (tareas padre, fin previsto y cierre del proyecto)
      runSync(data, syncOptions);

      // Los nombres de los participantes llegan después, sin retrasar el árbol
      setParticipantsLoaded(false);
      GLPIService.getTaskParticipants(session, data.map(t => t.id))
        .then(setParticipants)
        .catch(err => console.warn('No se pudieron cargar los participantes de las tareas:', err))
        .finally(() => setParticipantsLoaded(true));

      // Elementos del inventario relacionados (también sin retrasar el árbol)
      GLPIService.getTaskElements(session, data.map(t => t.id))
        .then(setTaskElements)
        .catch(err => console.warn('No se pudieron cargar los elementos de las tareas:', err));
      GLPIService.getProjectElements(session, project.id)
        .then(setProjectElements)
        .catch(err => console.warn('No se pudieron cargar los elementos del proyecto:', err));

      // La vista inicial debe mostrar los grupos del proyecto (por ejemplo, cada
      // jornada programada), no todas las actividades individuales de golpe.
      // El usuario puede abrir el grupo que necesite consultar.
      // Al recargar se respeta lo que el usuario ya abrió; solo las tareas nuevas inician cerradas.
      setExpandedNodes(prev => {
        const next = { ...prev };
        data.forEach(t => { if (!(t.id in next)) next[t.id] = false; });
        return next;
      });
    } catch (err) {
      console.warn('Error al cargar las tareas del proyecto:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };



  useEffect(() => {
    fetchTasks();
  }, [project.id]);

  // Construir el árbol de jerarquía (WBS) dinámicamente a partir de la lista plana
  const buildTree = (tasks: GLPIProjectTask[]): ProjectTaskNode[] => {
    const taskMap: Record<number, ProjectTaskNode> = {};
    const nameMap: Record<string, ProjectTaskNode> = {};
    const rootNodes: ProjectTaskNode[] = [];
    const assignedAsChild = new Set<number>();

    const normalize = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

    // PASO 1: Crear nodos y mapas (por ID y por nombre)
    tasks.forEach(task => {
      const node: ProjectTaskNode = { ...task, children: [], level: 0 };
      taskMap[task.id] = node;
      if (task.name?.trim()) {
        nameMap[normalize(task.name)] = node;
      }
    });

    // PASO 2: Vincular cada nodo a su padre
    tasks.forEach(task => {
      const node = taskMap[task.id];
      let parentNode: ProjectTaskNode | undefined;

      // A) Por ID numérico (sin expand_dropdowns — caso normal)
      if (task.projecttasks_id && task.projecttasks_id > 0 && taskMap[task.projecttasks_id]) {
        parentNode = taskMap[task.projecttasks_id];
      }

      // B) Por nombre del padre — fallback si projecttasks_id llegó como nombre (con expand_dropdowns)
      if (!parentNode && task.parent_name_ref?.trim()) {
        const refNorm = normalize(task.parent_name_ref);
        parentNode = nameMap[refNorm];
        if (!parentNode) {
          const stripped = refNorm.replace(/^\d+(\.\d+)*\s*[-_.:]?\s*/, '');
          if (stripped) parentNode = nameMap[stripped];
        }
      }

      // Evitar auto-referencia y duplicados
      if (parentNode && parentNode.id !== node.id) {
        if (!parentNode.children.find(c => c.id === node.id)) {
          parentNode.children.push(node);
          assignedAsChild.add(task.id);
        }
      }
    });

    // PASO 3: Los nodos sin padre asignado son raíces
    tasks.forEach(task => {
      if (!assignedAsChild.has(task.id)) {
        rootNodes.push(taskMap[task.id]);
      }
    });

    const sortNodes = (nodes: ProjectTaskNode[]) => {
      // GLPI no garantiza el orden de las tareas devueltas por la API:
      // 1) Los pasos del flujo de mantenimiento van en su orden de proceso.
      // 2) Los grupos se ordenan por la fecha del nombre ("5 DE SEPTIEMBRE DEL 2026")
      //    o, si no la tiene, por la fecha planificada de inicio.
      // 3) En empate, por ID (orden de creación en GLPI).
      nodes.sort((a, b) => {
        const aStep = getStepRank(a);
        const bStep = getStepRank(b);
        if (aStep !== null && bStep !== null && aStep !== bStep) return aStep - bStep;

        const aDate = getSortDate(a);
        const bDate = getSortDate(b);
        if (aDate !== null && bDate !== null && aDate !== bDate) return aDate - bDate;
        if (aDate !== null && bDate === null) return -1;
        if (aDate === null && bDate !== null) return 1;

        return a.id - b.id;
      });
      nodes.forEach(node => sortNodes(node.children));
    };

    // PASO 4: Si la única raíz es la "tarea paraguas" del proyecto, promover sus hijos
    const calcLevels = (node: ProjectTaskNode, level: number): number => {
      node.level = level;
      if (node.children.length > 0) {
        const total = node.children.reduce((acc, child) => acc + calcLevels(child, level + 1), 0);
        // floor: un grupo solo marca 100% cuando todas sus sub-tareas están concluidas
        node.percent_done = Math.floor(total / node.children.length);
        if (node.percent_done === 100) { node.state = 3; node.state_name = 'Concluida'; }
      }
      return node.percent_done;
    };

    if (
      rootNodes.length === 1 &&
      rootNodes[0].children.length > 0 &&
      normalize(rootNodes[0].name) === normalize(project.name)
    ) {
      const promoted = rootNodes[0].children;
      promoted.forEach(r => calcLevels(r, 0));
      sortNodes(promoted);
      return promoted;
    }

    // PASO 5: Múltiples raíces — calcular niveles normalmente
    rootNodes.forEach(r => calcLevels(r, 0));
    sortNodes(rootNodes);
    return rootNodes;
  };




  const treeNodes = buildTree(flatTasks);

  // Porcentaje global = promedio de los grupos principales (cada jornada pesa igual)
  const calculateOverallProjectPercent = (): number => {
    if (treeNodes.length === 0) return project.percent_done;
    const sum = treeNodes.reduce((acc, node) => acc + node.percent_done, 0);
    return Math.floor(sum / treeNodes.length);
  };

  const overallPercent = calculateOverallProjectPercent();

  const toggleExpand = (nodeId: number) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const handleExpandAll = () => {
    const next: Record<number, boolean> = {};
    flatTasks.forEach(t => { next[t.id] = true; });
    setExpandedNodes(next);
  };

  const handleCollapseAll = () => {
    // Un objeto vacío expandía todo (los nodos sin clave se consideran abiertos)
    const next: Record<number, boolean> = {};
    flatTasks.forEach(t => { next[t.id] = false; });
    setExpandedNodes(next);
  };

  // Acción de 1-Clic para Concluir Hito / Tarea
  const handleToggleComplete = async (node: ProjectTaskNode, e?: React.MouseEvent) => {
    e?.stopPropagation();

    // Si ya está al 100%, opcionalmente no hacer nada o notificar
    if (node.percent_done === 100) {
      setToastMsg(`El hito "${node.name}" ya se encuentra 100% concluido.`);
      setTimeout(() => setToastMsg(null), 3000);
      return;
    }

    setUpdatingTaskId(node.id);

    try {
      const updated = await GLPIService.completeTaskMilestone(session, node.id, project.id);

      // Actualizar estado plano local con lo mismo que se guardó en GLPI y recalcular hacia arriba
      const next = flatTasks.map(t => (t.id === node.id
        ? { ...t, percent_done: 100, state: 3, real_start_date: updated.real_start_date, state_name: 'Concluida' }
        : t));
      setFlatTasks(next);
      await runSync(next);

      setToastMsg(`¡Hito "${node.name}" marcado al 100% y cerrado en GLPI!`);
      setTimeout(() => setToastMsg(null), 3500);
    } catch (err: any) {
      console.error('Error al completar hito:', err);
      setToastMsg('No se pudo actualizar el hito en GLPI.');
      setTimeout(() => setToastMsg(null), 3000);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Componente recursivo para renderizar cada nodo de la jerarquía
  const renderTreeNode = (node: ProjectTaskNode) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes[node.id] !== false; // por defecto expandido si no es false
    const isCompleted = node.percent_done === 100;
    const isUpdating = updatingTaskId === node.id;
    // "Equipo" = tarea de mantenimiento de un equipo (MANTENIMIENTO DE EQUIPO DE X, o con un activo
    // relacionado) cuyos hijos son hitos: ahí van las fotos del mantenimiento. En las demás tareas
    // las fotos se manejan desde su detalle.
    const isEquipment = hasChildren && node.children.some(child => child.is_milestone)
      && (!!taskElements[node.id] || /EQUIPO/i.test(node.name));
    // "Grupo" = agrupador de nivel superior (p. ej. MANTENIMIENTO PROGRAMADOS PARA <fecha>)
    const isGroup = hasChildren && !isEquipment;

    // Cada nivel tiene su color de acento, ícono y tamaño para que no se confundan entre sí
    const accentColor = isGroup ? 'var(--primary)' : isEquipment ? '#8b5cf6' : 'transparent';
    const titleSize = isGroup ? '0.9rem' : isEquipment ? '0.84rem' : '0.82rem';

    return (
      <div key={node.id} style={{ marginBottom: '6px' }}>
        <div
          onClick={() => (hasChildren ? toggleExpand(node.id) : pushView({ kind: 'task', id: node.id }))}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            paddingLeft: '10px',
            background: isGroup
              ? 'linear-gradient(90deg, rgba(245, 165, 36, 0.10), var(--card-bg) 60%)'
              : hasChildren ? 'var(--card-bg)' : 'var(--bg-main)',
            border: `1.5px solid ${isCompleted ? '#d1fae5' : 'var(--border-color)'}`,
            borderLeft: hasChildren ? `4px solid ${accentColor}` : `1.5px solid ${isCompleted ? '#d1fae5' : 'var(--border-color)'}`,
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            boxShadow: hasChildren ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s ease',
            position: 'relative'
          }}
        >
          {/* Lado Izquierdo: Icono expandir + Título + Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
            {hasChildren ? (
              <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </span>
            ) : (
              <span style={{ width: '18px' }} />
            )}

            {/* Icono diferenciador de tipo de nodo */}
            {isGroup ? (
              <CalendarDays size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
            ) : isEquipment ? (
              <Monitor size={17} color="#8b5cf6" style={{ flexShrink: 0 }} />
            ) : hasChildren ? (
              <Folder size={18} color="var(--primary)" />
            ) : node.is_milestone ? (
              <Flag size={16} color={isCompleted ? '#10b981' : '#f59e0b'} fill={isCompleted ? '#10b981' : 'transparent'} />
            ) : (
              <Layers size={16} color="var(--text-muted)" />
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span 
                  style={{ 
                    fontSize: titleSize, 
                    fontWeight: hasChildren ? 800 : 600, 
                    color: isCompleted ? '#059669' : 'var(--text-main)',
                    textDecoration: isCompleted && !hasChildren ? 'line-through' : 'none'
                  }}
                >
                  {node.name}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingNode(node);
                  }}
                  title="Editar nombre / Debajo de"
                  aria-label="Editar tarea"
                  style={{
                    display: 'inline-flex', padding: '2px', border: 'none', background: 'none',
                    color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.7
                  }}
                >
                  <Pencil size={12} />
                </button>

                {node.is_milestone && (
                  <span 
                    className="badge"
                    style={{ 
                      fontSize: '0.65rem', 
                      padding: '2px 6px',
                      background: isCompleted ? '#ecfdf5' : '#fffbe6', 
                      color: isCompleted ? '#047857' : '#d97706',
                      border: `1px solid ${isCompleted ? '#a7f3d0' : '#fef08a'}`
                    }}
                  >
                    🚩 HITO
                  </span>
                )}
              </div>

              {/* Responsables (participantes en GLPI): tocar para asignar o quitar */}
              {participantsLoaded && <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAssigningNode(node);
                }}
                title="Asignar responsables"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '3px',
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  textAlign: 'left',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  color: participants[node.id]?.length ? 'var(--text-muted)' : 'var(--primary)',
                  opacity: participants[node.id]?.length ? 1 : 0.75,
                  cursor: 'pointer'
                }}
              >
                {participants[node.id]?.length ? (
                  <>
                    {participants[node.id].some(p => p.itemtype !== 'User')
                      ? <UsersIcon size={12} style={{ flexShrink: 0 }} />
                      : <UserIcon size={12} style={{ flexShrink: 0 }} />}
                    <span>{participants[node.id].map(p => p.name).join(', ')}</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={12} style={{ flexShrink: 0 }} />
                    <span>Asignar responsable</span>
                  </>
                )}
              </button>}

              {/* Barra de progreso de la tarea */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <div 
                  style={{ 
                    flex: 1, 
                    maxWidth: '120px', 
                    height: '5px', 
                    background: 'var(--border-color)', 
                    borderRadius: '4px', 
                    overflow: 'hidden' 
                  }}
                >
                  <div 
                    style={{ 
                      width: `${node.percent_done}%`, 
                      height: '100%', 
                      background: isCompleted ? '#10b981' : 'var(--primary-gradient)',
                      transition: 'width 0.3s ease'
                    }} 
                  />
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isCompleted ? '#10b981' : 'var(--text-muted)' }}>
                  {node.percent_done}% {hasChildren && `(${node.children.length} sub-tareas)`}
                </span>
              </div>
            </div>
          </div>

          {/* Lado Derecho: Accionador de 1-CLIC solo para tareas finales sin sub-tareas (nodos hoja) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }}>
            {/* Ver el elemento del inventario relacionado (nombre, etiqueta física, ubicación) */}
            {taskElements[node.id] && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewingElements({ elements: [taskElements[node.id]], name: node.name });
                }}
                title="Ver elemento relacionado"
                aria-label="Ver elemento relacionado"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: '10px',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  background: 'rgba(139, 92, 246, 0.08)',
                  color: '#8b5cf6',
                  cursor: 'pointer'
                }}
              >
                <Eye size={14} />
              </button>
            )}

            {/* Fotos del mantenimiento: solo en la tarea del equipo */}
            {isEquipment && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenPhotos(prev => ({ ...prev, [node.id]: !prev[node.id] }));
                }}
                title={openPhotos[node.id] ? 'Ocultar fotos' : 'Ver y tomar fotos del mantenimiento'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 8px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: openPhotos[node.id] ? 'rgba(245, 165, 36, 0.08)' : 'var(--card-bg)',
                  color: openPhotos[node.id] ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                <Camera size={14} />
                {photoCounts[node.id] !== undefined && <span>{photoCounts[node.id]}</span>}
              </button>
            )}

            {/* Notas (historial de comentarios en GLPI): solo para hitos */}
            {!hasChildren && node.is_milestone && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenNotes(prev => ({ ...prev, [node.id]: !prev[node.id] }));
                }}
                title={openNotes[node.id] ? 'Ocultar notas' : 'Ver y agregar notas'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 8px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: openNotes[node.id] ? 'rgba(245, 165, 36, 0.08)' : 'var(--card-bg)',
                  color: openNotes[node.id] ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                <MessageSquare size={14} />
                {noteCounts[node.id] !== undefined && <span>{noteCounts[node.id]}</span>}
              </button>
            )}

            {hasChildren ? null : (
              <button
                type="button"
                onClick={(e) => handleToggleComplete(node, e)}
                disabled={isUpdating}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '10px',
                  border: isCompleted ? '1px solid #a7f3d0' : '1px solid var(--primary)',
                  background: isCompleted ? '#ecfdf5' : 'rgba(245, 165, 36, 0.08)',
                  color: isCompleted ? '#059669' : 'var(--primary)',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: isCompleted ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isCompleted ? 'none' : 'var(--shadow-sm)'
                }}
                title={isCompleted ? 'Tarea completada (100%)' : 'Concluir hito con 1-clic (100%, cerrado)'}
              >
                {isUpdating ? (
                  <RefreshCw size={14} className="spin" />
                ) : isCompleted ? (
                  <CheckCircle2 size={16} color="#10b981" aria-label="Concluido" />
                ) : (
                  <>
                    <Square size={14} />
                    <span>Concluir</span>
                  </>
                )}
              </button>
            )}

            {/* Detalle: descripción, fechas, subtareas, notas, fotos y documentos */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); pushView({ kind: 'task', id: node.id }); }}
              title="Ver detalle"
              aria-label={`Ver detalle de ${node.name}`}
              style={{ display: 'inline-flex', padding: '6px 2px', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {isEquipment && openPhotos[node.id] && (
          <TaskPhotos
            session={session}
            taskId={node.id}
            taskName={node.name}
            indent={0}
            onCountChange={(count) => setPhotoCounts(prev => ({ ...prev, [node.id]: count }))}
          />
        )}

        {!hasChildren && node.is_milestone && openNotes[node.id] && (
          <TaskNotes
            session={session}
            taskId={node.id}
            indent={0}
            onCountChange={(count) => setNoteCounts(prev => ({ ...prev, [node.id]: count }))}
          />
        )}

        {/* Subnodo del Árbol (Hijos) */}
        {hasChildren && isExpanded && (
          <div
            style={{
              marginTop: '6px',
              marginLeft: '10px',
              paddingLeft: '10px',
              // Línea guía del color del padre: deja claro qué filas pertenecen a qué grupo
              borderLeft: `2px solid ${isGroup ? 'rgba(245, 165, 36, 0.35)' : isEquipment ? 'rgba(139, 92, 246, 0.35)' : 'var(--border-color)'}`
            }}
          >
            {node.children.map(child => renderTreeNode(child))}
          </div>
        )}
      </div>
    );
  };

  const detailNode = view.kind === 'task' ? findNode(treeNodes, view.id) : null;
  const parentOf = (node: ProjectTaskNode) => flatTasks.find(t => t.id === node.projecttasks_id);
  const fab = view.kind === 'tree' && !loading && document.querySelector('.mobile-app-wrapper')
    ? createPortal(
      <button type="button" className="fab" onClick={() => pushView({ kind: 'new', parent: null })} aria-label="Nueva tarea" title="Nueva tarea">
        <Plus size={28} strokeWidth={2.5} />
      </button>,
      document.querySelector('.mobile-app-wrapper')!
    )
    : null;

  return (
    <>
    {fab}
    {view.kind === 'new' && (
      <TaskFormView
        session={session}
        projectId={project.id}
        parent={view.parent}
        onBack={popView}
        onCreated={async () => {
          const parentId = view.parent?.id;
          popView();
          if (parentId) setExpandedNodes(prev => ({ ...prev, [parentId]: true }));
          showToast(parentId ? 'Subtarea creada en GLPI.' : 'Tarea creada en GLPI.');
          // Si el proyecto estaba cerrado, las tareas nuevas lo reabren
          await fetchTasks(true, { reopenIfPending: true });
        }}
      />
    )}
    {view.kind === 'task' && (detailNode ? (
      <>
        {toastMsg && (
          <div className="alert-box alert-info animate-fade-in" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <Sparkles size={18} style={{ color: 'var(--primary)' }} />
            <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{toastMsg}</div>
          </div>
        )}
        <TaskDetailView
          key={detailNode.id}
          session={session}
          node={detailNode}
          backLabel={viewStack.length > 1 && viewStack[viewStack.length - 2].kind === 'task' ? (parentOf(detailNode)?.name || 'Tarea') : 'Tareas del proyecto'}
          participants={participantsLoaded ? participants[detailNode.id] || [] : undefined}
          hasElement={!!taskElements[detailNode.id]}
          completing={updatingTaskId === detailNode.id}
          onBack={popView}
          onOpenTask={id => pushView({ kind: 'task', id })}
          onAddSubtask={node => pushView({ kind: 'new', parent: { id: node.id, name: node.name } })}
          onComplete={node => handleToggleComplete(node)}
          onAssign={node => setAssigningNode(node)}
          onViewElement={node => setViewingElements({ elements: [taskElements[node.id]], name: node.name })}
          onSaved={() => fetchTasks(true)}
        />
      </>
    ) : (
      <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
        <p style={{ marginBottom: '12px' }}>Esta tarea ya no está en el proyecto.</p>
        <button type="button" className="btn-secondary" onClick={() => setViewStack([])}>Volver a las tareas</button>
      </div>
    ))}
    <div className="animate-fade-in" style={{ paddingBottom: '20px', display: view.kind === 'tree' ? undefined : 'none' }}>
      {/* Encabezado con navegación de regreso */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: 'var(--primary)',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={18} /> Ver todos los proyectos
        </button>

        <button
          onClick={() => fetchTasks(true)}
          disabled={refreshing}
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            color: 'var(--text-main)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Tarjeta Informativa del Proyecto */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span className="badge" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            Código: {project.code || `PRJ-${project.id}`}
          </span>
          <span 
            className="badge" 
            style={{ 
              background: overallPercent === 100 ? '#ecfdf5' : '#fffbe6', 
              color: overallPercent === 100 ? '#047857' : '#b45309' 
            }}
          >
            Avance Automático: {overallPercent}%
          </span>
        </div>

        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px', lineHeight: 1.3 }}>
          {projectName}
          <button
            type="button"
            onClick={() => setEditingProject(true)}
            title="Editar nombre del proyecto"
            aria-label="Editar nombre del proyecto"
            style={{ marginLeft: '6px', padding: '2px', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', verticalAlign: 'middle' }}
          >
            <Pencil size={14} />
          </button>
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          <CalendarDays size={14} />
          {planEnd === undefined
            ? 'Fin previsto: calculando...'
            : planEnd
              ? <span>Fin previsto: <b style={{ color: 'var(--text-main)' }}>{new Date(planEnd.replace(' ', 'T')).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</b> (tarea que termina más tarde)</span>
              : 'Fin previsto: se calculará con las fechas de las tareas'}
        </div>

        {projectElements.length > 0 && (
          <button
            type="button"
            onClick={() => setViewingElements({ elements: projectElements, name: projectName })}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '8px', marginRight: '6px',
              padding: '6px 10px', borderRadius: '10px', border: '1px solid rgba(139, 92, 246, 0.4)',
              background: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer'
            }}
          >
            <Eye size={14} />
            {projectElements.length === 1 ? 'Ver elemento relacionado' : `Ver ${projectElements.length} elementos relacionados`}
          </button>
        )}

        <button
          type="button"
          onClick={() => setProjectNotesOpen(open => !open)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '8px', marginRight: '6px',
            padding: '6px 10px', borderRadius: '10px', border: '1px solid var(--border-color)',
            background: projectNotesOpen ? 'var(--primary-soft)' : 'var(--card-bg)', color: projectNotesOpen ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer'
          }}
        >
          <MessageSquare size={14} /> Notas del proyecto
        </button>
        {projectNotesOpen && <TaskNotes session={session} taskId={project.id} itemtype="Project" indent={0} />}

        {/* Barra de progreso global del Proyecto */}
        <div style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Progreso Total Acumulado</span>
            <span style={{ color: 'var(--primary)' }}>{overallPercent}%</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'var(--bg-main)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div 
              style={{ 
                width: `${overallPercent}%`, 
                height: '100%', 
                background: overallPercent === 100 ? '#10b981' : 'var(--primary-gradient)',
                transition: 'width 0.4s ease'
              }} 
            />
          </div>
        </div>
      </div>

      {/* Notificación Toast Toast flotante */}
      {toastMsg && (
        <div className="alert-box alert-info animate-fade-in" style={{ boxShadow: 'var(--shadow-lg)' }}>
          <Sparkles size={18} style={{ color: 'var(--primary)' }} />
          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{toastMsg}</div>
        </div>
      )}

      {/* Barra de Controles para Expandir/Colapsar todo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', padding: '0 4px' }}>
        <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>
          Tareas del proyecto ({treeNodes.length})
        </h4>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleExpandAll}
            style={{
              padding: '4px 8px',
              fontSize: '0.72rem',
              fontWeight: 700,
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              background: 'var(--card-bg)',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            Expandir
          </button>
          <button
            onClick={handleCollapseAll}
            style={{
              padding: '4px 8px',
              fontSize: '0.72rem',
              fontWeight: 700,
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              background: 'var(--card-bg)',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            Colapsar
          </button>
        </div>
      </div>

      {viewingElements && (
        <ElementDetailSheet
          session={session}
          elements={viewingElements.elements}
          contextName={viewingElements.name}
          onClose={() => setViewingElements(null)}
        />
      )}

      {editingNode && (
        <EditTaskSheet
          title="Editar tarea"
          initialName={editingNode.name}
          task={flatTasks.find(t => t.id === editingNode.id)}
          allTasks={flatTasks}
          onSave={async ({ name, parentId }) => {
            const original = flatTasks.find(t => t.id === editingNode.id);
            const changes: { name?: string; projecttasks_id?: number } = {};
            if (name !== original?.name) changes.name = name;
            if (parentId !== undefined && parentId !== (original?.projecttasks_id || 0)) changes.projecttasks_id = parentId;
            await GLPIService.updateProjectTask(session, editingNode.id, changes);
            const next = flatTasks.map(t => (
              t.id === editingNode.id ? { ...t, ...changes, parent_name_ref: '' } : t
            ));
            setFlatTasks(next);
            if (changes.projecttasks_id !== undefined) await runSync(next);
            // Si se movió, abrir el nuevo padre para que se vea dónde quedó
            if (changes.projecttasks_id) {
              setExpandedNodes(prev => ({ ...prev, [changes.projecttasks_id!]: true }));
            }
            setToastMsg(changes.projecttasks_id !== undefined ? `"${name}" se movió y se guardó en GLPI.` : `"${name}" se guardó en GLPI.`);
            setTimeout(() => setToastMsg(null), 3000);
          }}
          onClose={() => setEditingNode(null)}
        />
      )}

      {editingProject && (
        <EditTaskSheet
          title="Editar proyecto"
          initialName={projectName}
          onSave={async ({ name }) => {
            await GLPIService.updateProjectName(session, project.id, name);
            setProjectName(name);
          }}
          onClose={() => setEditingProject(false)}
        />
      )}

      {assigningNode && (
        <AssignParticipants
          session={session}
          taskId={assigningNode.id}
          taskName={assigningNode.name}
          participants={participants[assigningNode.id] || []}
          onChange={(list) => setParticipants(prev => ({ ...prev, [assigningNode.id]: list }))}
          onClose={() => setAssigningNode(null)}
        />
      )}

      {/* Renderizado de la Jerarquía de Tareas en Árbol */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
          <RefreshCw className="spin" size={24} style={{ marginBottom: '8px' }} />
          <div style={{ fontSize: '0.85rem' }}>Construyendo jerarquía de tareas del proyecto...</div>
        </div>
      ) : treeNodes.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
          No hay tareas registradas para este proyecto. Toca el botón + para crear la primera.
        </div>
      ) : (
        <div>
          {treeNodes.map(node => renderTreeNode(node))}
        </div>
      )}
    </div>
    </>
  );
};
