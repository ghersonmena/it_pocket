import React, { useState, useEffect } from 'react';
import type { GLPISession, GLPITicket, GLPIProject } from './types/glpi';
import { GLPIService } from './services/glpiService';
import { Header } from './components/Header';
import { NavDrawer } from './components/NavDrawer';
import { NAV_ITEMS } from './navigation';
import type { TabType } from './navigation';
import { KnowledgeScreen } from './components/KnowledgeScreen';
import { Plus } from 'lucide-react';
import { Login } from './components/Login';
import { TicketList } from './components/TicketList';
import { TicketDetail } from './components/TicketDetail';
import { CreateTicket } from './components/CreateTicket';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { ProjectList } from './components/ProjectList';
import { ProjectTaskTree } from './components/ProjectTaskTree';
import { AssetsScreen } from './components/AssetsScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useSwipeNavigation } from './hooks/useSwipeNavigation';
import { useTaskReminders } from './hooks/useTaskReminders';
import { NotificationBanners } from './components/NotificationBanners';
import { NotificationsScreen } from './components/NotificationsScreen';
import type { TaskReminder } from './services/notificationService';
import { OPEN_TASK_MESSAGE } from './services/deviceNotifications';
import { refreshPushSubscription, unsubscribePush } from './services/pushClient';
import { NotificationService } from './services/notificationService';
import type { SlideDirection } from './hooks/useSwipeNavigation';

// Orden de los módulos en la barra inferior; deslizar avanza o retrocede en este orden
const TAB_ORDER: TabType[] = NAV_ITEMS.map(item => item.tab);

// La sesión se guarda en localStorage (sobrevive a recargas y a cerrar la pestaña) y caduca
// tras 1 hora sin actividad; cada interacción con la app renueva el plazo.
const SESSION_STORAGE_KEY = 'glpi_session';
const SESSION_TTL_MS = 60 * 60 * 1000;
// Ping al servidor para que GLPI no expire la sesión por inactividad mientras la app está abierta
const SESSION_KEEPALIVE_MS = 5 * 60 * 1000;
// Renovar el plazo como máximo una vez por minuto, no en cada clic
const SESSION_RENEW_THROTTLE_MS = 60 * 1000;

interface StoredSession {
  session: GLPISession;
  expiresAt: number;
}

const saveSession = (session: GLPISession) => {
  try {
    const stored: StoredSession = { session, expiresAt: Date.now() + SESSION_TTL_MS };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
  } catch { /* sin localStorage (modo privado): la sesión solo dura mientras la página esté abierta */ }
};

const clearStoredSession = () => {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch { /* nada que limpiar */ }
};

const loadStoredSession = (): GLPISession | null => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const stored: StoredSession = JSON.parse(raw);
    if (!stored?.session || !stored.expiresAt || stored.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return stored.session;
  } catch {
    return null;
  }
};

const isStoredSessionExpired = (): boolean => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return true;
    const stored: StoredSession = JSON.parse(raw);
    return !stored?.expiresAt || stored.expiresAt < Date.now();
  } catch {
    return false; // sin localStorage no se puede comprobar: no cerrar la sesión
  }
};

export const App: React.FC = () => {
  const [session, setSession] = useState<GLPISession | null>(loadStoredSession);

  const [activeTab, setActiveTab] = useState<TabType>('projects');
  const [selectedTicket, setSelectedTicket] = useState<GLPITicket | null>(null);
  const [selectedProject, setSelectedProject] = useState<GLPIProject | null>(null);
  // Tarea que se abre al entrar al proyecto (desde un aviso o el historial de notificaciones)
  const [focusTaskId, setFocusTaskId] = useState<number | null>(null);
  // Dirección de la animación al cambiar de módulo y si Activos tiene abierto un formulario
  const [slideDirection, setSlideDirection] = useState<SlideDirection>(null);
  // Hay un detalle abierto dentro de Activos o Conocimiento (formulario, artículo): no se cambia
  // de módulo deslizando ni se muestra el botón "+"
  const [assetFormOpen, setAssetFormOpen] = useState<boolean>(false);
  const [articleOpen, setArticleOpen] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  // Cada incremento pide a Activos abrir el alta de un activo nuevo (botón "+")
  const [newAssetRequest, setNewAssetRequest] = useState<number>(0);
  const [projectFormOpen, setProjectFormOpen] = useState<boolean>(false);
  const [newProjectRequest, setNewProjectRequest] = useState<number>(0);

  // Cambiar de módulo animando hacia el lado que corresponde según el orden de la barra
  const goToTab = (tab: TabType) => {
    const from = TAB_ORDER.indexOf(activeTab);
    const to = TAB_ORDER.indexOf(tab);
    setSlideDirection(from === -1 || to === -1 || from === to ? null : to > from ? 'next' : 'prev');
    setActiveTab(tab);
  };

  const tabIndex = TAB_ORDER.indexOf(activeTab);
  const swipe = useSwipeNavigation({
    // Solo en las pantallas principales; no dentro de un proyecto, ticket o formulario de activo
    enabled: !!session && !selectedProject && !selectedTicket && tabIndex !== -1 && !menuOpen
      && !(activeTab === 'assets' && assetFormOpen) && !(activeTab === 'knowledge' && articleOpen)
      && !(activeTab === 'projects' && projectFormOpen),
    hasPrev: tabIndex > 0,
    hasNext: tabIndex !== -1 && tabIndex < TAB_ORDER.length - 1,
    onPrev: () => goToTab(TAB_ORDER[tabIndex - 1]),
    onNext: () => goToTab(TAB_ORDER[tabIndex + 1])
  });

  // Guardar la sesión (con su caducidad) cada vez que cambia
  useEffect(() => {
    if (session) saveSession(session);
    else clearStoredSession();
  }, [session]);

  // Mientras haya sesión: renovar el plazo con la actividad del usuario, mantener viva la
  // sesión en GLPI y cerrar la app si caducó o si GLPI ya no la acepta.
  useEffect(() => {
    if (!session) return;

    let lastRenew = Date.now();
    const renewOnActivity = () => {
      if (Date.now() - lastRenew < SESSION_RENEW_THROTTLE_MS) return;
      lastRenew = Date.now();
      saveSession(session);
    };

    const verify = async () => {
      if (isStoredSessionExpired()) {
        setSession(null);
        return;
      }
      const alive = await GLPIService.pingSession(session);
      if (!alive) {
        console.warn('[GLPI] La sesión expiró en el servidor; se requiere iniciar sesión de nuevo.');
        setSession(null);
      }
    };

    // Al cargar (p. ej. tras refrescar) comprobar que GLPI siga aceptando el token guardado
    verify();
    const keepAlive = window.setInterval(verify, SESSION_KEEPALIVE_MS);
    // Al volver a la app (otra pestaña, teléfono bloqueado) revisar si caducó mientras tanto
    const onVisible = () => { if (document.visibilityState === 'visible') verify(); };

    window.addEventListener('pointerdown', renewOnActivity);
    window.addEventListener('keydown', renewOnActivity);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(keepAlive);
      window.removeEventListener('pointerdown', renewOnActivity);
      window.removeEventListener('keydown', renewOnActivity);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session]);

  const handleLoginSuccess = (newSession: GLPISession) => {
    setSession(newSession);
    setActiveTab('projects');
    setSelectedTicket(null);
    setSelectedProject(null);
  };

  const handleLogout = async () => {
    if (session) {
      // Este teléfono deja de recibir los avisos push de quien cierra sesión
      await unsubscribePush(session).catch(() => {});
      try {
        await GLPIService.killSession(session);
      } catch (e) {
        console.warn(e);
      }
    }
    setSession(null);
    setSelectedTicket(null);
    setSelectedProject(null);
  };

  const reminders = useTaskReminders(session);

  // Abrir la tarea de un aviso: su proyecto y, dentro, el detalle de la tarea
  const openReminder = (target: TaskReminder, notificationId?: string) => {
    if (notificationId) reminders.markRead(notificationId);
    setMenuOpen(false);
    setSelectedTicket(null);
    setSelectedProject({ id: target.projectId, name: target.projectName, percent_done: 0, date: '', date_mod: '' });
    setFocusTaskId(target.taskId);
  };

  // Tocar una notificación del teléfono: con la app abierta llega un mensaje del service worker;
  // con la app cerrada, la tarea viene en la URL (?openTask=...&project=...)
  const openReminderRef = React.useRef(openReminder);
  useEffect(() => { openReminderRef.current = openReminder; });
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== OPEN_TASK_MESSAGE) return;
      openReminderRef.current({ taskId: Number(e.data.taskId), projectId: Number(e.data.projectId), projectName: e.data.projectName || '', taskName: '', start: '' }, e.data.id || undefined);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);
  // Avisos con la app cerrada: renovar la suscripción de este teléfono al abrir la app
  useEffect(() => {
    if (session) refreshPushSubscription(session, NotificationService.getOffsets(session));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const taskId = Number(params.get('openTask'));
    const projectId = Number(params.get('project'));
    if (!taskId || !projectId) return;
    window.history.replaceState(null, '', window.location.pathname);
    openReminderRef.current({ taskId, projectId, projectName: params.get('projectName') || '', taskName: '', start: '' }, params.get('notification') || undefined);
  }, [session]);

  const getHeaderTitle = (): string | undefined => {
    if (selectedProject) return `Proyecto #${selectedProject.id}`;
    if (selectedTicket) return `Ticket #${selectedTicket.id}`;
    return undefined;
  };

  return (
    <div className="mobile-app-wrapper">
      <Header
        session={session}
        title={getHeaderTitle()}
        onMenu={() => setMenuOpen(true)}
        unreadNotifications={reminders.unread}
        onNotifications={() => { setSelectedTicket(null); setSelectedProject(null); goToTab('notifications'); }}
      />

      {session && (
        <NotificationBanners
          banners={reminders.banners}
          onOpen={n => { reminders.dismissBanner(n.id); openReminder(n, n.id); }}
          onDismiss={reminders.dismissBanner}
        />
      )}

      <main className="app-content" {...swipe.handlers}>
        <ErrorBoundary resetKey={`${activeTab}-${selectedProject?.id ?? ''}-${selectedTicket?.id ?? ''}`}>
        {!session ? (
          <Login onLoginSuccess={handleLoginSuccess} />
        ) : selectedProject ? (
          <ProjectTaskTree
            key={selectedProject.id}
            session={session}
            project={selectedProject}
            onBack={() => setSelectedProject(null)}
            focusTaskId={focusTaskId}
            onFocusHandled={() => setFocusTaskId(null)}
            onTasksChanged={reminders.refresh}
          />
        ) : selectedTicket ? (
          <TicketDetail
            session={session}
            ticket={selectedTicket}
            onBack={() => setSelectedTicket(null)}
          />
        ) : (
          <div
            key={activeTab}
            className={slideDirection === 'next' ? 'slide-in-next' : slideDirection === 'prev' ? 'slide-in-prev' : undefined}
            style={swipe.contentStyle}
          >
            {activeTab === 'projects' && (
              <ProjectList
                session={session}
                onSelectProject={(prj) => setSelectedProject(prj)}
                newProjectRequest={newProjectRequest}
                onFormOpenChange={setProjectFormOpen}
              />
            )}

            {activeTab === 'tickets' && (
              <TicketList
                session={session}
                onSelectTicket={(ticket) => setSelectedTicket(ticket)}
                onCreateNew={() => setActiveTab('create')}
              />
            )}

            {activeTab === 'create' && (
              <CreateTicket
                session={session}
                onTicketCreated={() => setActiveTab('tickets')}
                onBack={() => setActiveTab('tickets')}
              />
            )}

            {activeTab === 'assets' && (
              <AssetsScreen session={session} onFormOpenChange={setAssetFormOpen} newAssetRequest={newAssetRequest} />
            )}

            {activeTab === 'knowledge' && (
              <KnowledgeScreen session={session} onArticleOpenChange={setArticleOpen} />
            )}

            {activeTab === 'notifications' && (
              <NotificationsScreen
                history={reminders.history}
                upcoming={reminders.upcoming}
                onOpen={openReminder}
                onMarkAllRead={reminders.markAllRead}
                onClear={reminders.clearHistory}
              />
            )}

            {activeTab === 'dashboard' && (
              <Dashboard
                session={session}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'settings' && (
              <Settings
                session={session}
                onLogout={handleLogout}
              />
            )}
          </div>
        )}
        </ErrorBoundary>
      </main>

      {/* Botón "+" flotante (estilo Google): nuevo proyecto, ticket o activo según la sección */}
      {session && !selectedTicket && !selectedProject && !menuOpen &&
        ((activeTab === 'projects' && !projectFormOpen) || activeTab === 'tickets' || (activeTab === 'assets' && !assetFormOpen)) && (
        <button
          type="button"
          className="fab"
          onClick={() => {
            if (activeTab === 'projects') setNewProjectRequest(n => n + 1);
            else if (activeTab === 'tickets') setActiveTab('create');
            else setNewAssetRequest(n => n + 1);
          }}
          aria-label={activeTab === 'projects' ? 'Nuevo proyecto' : activeTab === 'tickets' ? 'Nuevo ticket' : 'Nuevo activo'}
          title={activeTab === 'projects' ? 'Nuevo proyecto' : activeTab === 'tickets' ? 'Nuevo ticket' : 'Nuevo activo'}
        >
          <Plus size={28} strokeWidth={2.5} />
        </button>
      )}

      {session && (
        <NavDrawer
          open={menuOpen}
          session={session}
          activeTab={activeTab}
          onClose={() => setMenuOpen(false)}
          onLogout={() => { setMenuOpen(false); handleLogout(); }}
          badges={{ notifications: reminders.unread }}
          onSelect={(tab) => {
            setMenuOpen(false);
            setSelectedTicket(null);
            setSelectedProject(null);
            goToTab(tab);
          }}
        />
      )}
    </div>
  );
};

export default App;
