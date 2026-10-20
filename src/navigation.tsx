import React from 'react';
import { Ticket, Package, BarChart3, Settings, FolderKanban, BookOpen, Bell } from 'lucide-react';

// 'create' (alta de ticket) no aparece en el menú: se abre con el botón "+" de Tickets
export type TabType = 'projects' | 'tickets' | 'create' | 'assets' | 'knowledge' | 'notifications' | 'dashboard' | 'settings';

// Secciones del menú, en el mismo orden en que se navega deslizando
export const NAV_ITEMS: { tab: TabType; label: string; icon: React.ReactNode }[] = [
  { tab: 'projects', label: 'Proyectos', icon: <FolderKanban size={22} /> },
  { tab: 'tickets', label: 'Tickets', icon: <Ticket size={22} /> },
  { tab: 'assets', label: 'Activos', icon: <Package size={22} /> },
  { tab: 'knowledge', label: 'Conocimiento', icon: <BookOpen size={22} /> },
  { tab: 'notifications', label: 'Notificaciones', icon: <Bell size={22} /> },
  { tab: 'dashboard', label: 'Métricas', icon: <BarChart3 size={22} /> },
  { tab: 'settings', label: 'Ajustes', icon: <Settings size={22} /> }
];
