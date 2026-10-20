// Tema de la app: por defecto sigue el modo claro/oscuro del sistema del teléfono y cambia
// en vivo si el sistema cambia (p. ej. modo oscuro automático al anochecer). En Ajustes se
// puede forzar claro u oscuro; la preferencia se guarda en el navegador.

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'glpi_theme';
// Color de la barra del navegador / barra de estado en Android (igual a --header-bg)
const THEME_COLORS = { light: '#1c1f26', dark: '#16181d' };

const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export const getThemePreference = (): ThemePreference => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch { /* sin localStorage: usar el del sistema */ }
  return 'system';
};

const resolveTheme = (pref: ThemePreference): 'light' | 'dark' =>
  pref === 'system' ? (systemDarkQuery.matches ? 'dark' : 'light') : pref;

const applyTheme = () => {
  const theme = resolveTheme(getThemePreference());
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  // Controles nativos (inputs, selects, scrollbars) en el mismo modo
  root.style.colorScheme = theme;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];
};

export const setThemePreference = (pref: ThemePreference) => {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch { /* sin localStorage: aplica solo mientras la página esté abierta */ }
  applyTheme();
};

/** Aplicar el tema antes del primer render y seguir los cambios del sistema. */
export const initTheme = () => {
  applyTheme();
  systemDarkQuery.addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme();
  });
};
