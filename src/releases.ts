// Novedades que ve el usuario al entrar después de una actualización. La primera es la versión
// actual (la de package.json): cada versión nueva agrega aquí sus notas, en lenguaje sencillo.
export interface Release {
  version: string;
  date: string; // AAAA-MM-DD
  notes: string[];
}

export const RELEASES: Release[] = [
  {
    version: '1.9.4',
    date: '2026-11-17',
    notes: [
      'Al conectar un monitor, dispositivo, teléfono o impresora a una computadora, escanea su etiqueta (código de barras, QR o texto) para encontrarlo; si es de otro tipo, la app cambia sola de pestaña',
      'Si el dispositivo estaba en otra computadora, al moverlo te pregunta si esa computadora necesita otro: puedes intercambiarle el que tenía la tuya o elegir uno distinto'
    ]
  },
  {
    version: '1.9.3',
    date: '2026-11-17',
    notes: [
      'Activos: nueva pestaña Notas, el mismo historial de notas de GLPI que tienen las tareas',
      'Cada nota queda con quién la escribió y cuándo'
    ]
  },
  {
    version: '1.9.2',
    date: '2026-11-17',
    notes: [
      'Al entrar después de una actualización verás esta ventana con lo nuevo de cada versión',
      'Puedes volver a verla cuando quieras en Ajustes → Novedades'
    ]
  },
  {
    version: '1.9.1',
    date: '2026-10-27',
    notes: [
      'Kanban: mantén presionada una tarjeta y arrástrala con el dedo a otra columna para cambiar su estado',
      'Al soltar un hito en Concluido se pide confirmación'
    ]
  },
  {
    version: '1.9.0',
    date: '2026-10-27',
    notes: [
      'Nueva vista Kanban de los hitos del proyecto, junto a Árbol y Gantt',
      'Agrupa por estado, fechas, responsables o tarea padre, y oculta los concluidos'
    ]
  },
  {
    version: '1.8.12',
    date: '2026-10-26',
    notes: [
      'Desliza un hito pendiente a la derecha en el árbol para concluirlo',
      'Gantt: la línea amarilla muestra el retraso de cada hito hasta que se concluye'
    ]
  },
  {
    version: '1.8.11',
    date: '2026-10-22',
    notes: [
      'En un hito concluido se puede corregir el inicio previsto; la fecha real no cambia'
    ]
  },
  {
    version: '1.8.10',
    date: '2026-10-22',
    notes: [
      'Vista Gantt de las tareas del proyecto, con escalas de día, semana, mes y año'
    ]
  }
];

// Compara versiones "1.9.10" > "1.9.2" número por número
export const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

// Quien nunca vio la ventana (llegó antes de que existiera) ve lo nuevo desde la 1.9.2
const FIRST_SEEN_FALLBACK = '1.9.1';

export const unseenReleases = (seen: string | null): Release[] =>
  RELEASES.filter(r => compareVersions(r.version, seen || FIRST_SEEN_FALLBACK) > 0);

// Última versión cuyas novedades se vieron en este teléfono
const SEEN_KEY = 'itpocket_seen_version';

export const getSeenVersion = (): string | null => {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};

export const markReleasesSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, __APP_VERSION__);
  } catch { /* sin localStorage: se volverá a mostrar en la próxima visita */ }
};
