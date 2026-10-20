// Sonidos de la app (avisos de tareas y hito concluido), generados con Web Audio (sin archivos).
// Los navegadores solo permiten reproducir sonido después de que el usuario toca la página, así
// que el audio se habilita con el primer toque en la app (prepareNotificationSound).

const PREF_KEY = 'itpocket_notification_sound';

type Kind = 'soon' | 'now' | 'done';

// Notas (Hz): dos para "en 1 minuto", tres ascendentes para "comienza ahora" y las mismas
// tres en descenso al concluir un hito
const MELODIES: Record<Kind, number[]> = {
  soon: [659.25, 880],
  now: [783.99, 987.77, 1318.51],
  done: [1318.51, 987.77, 783.99]
};
const NOTE_S = 0.16;
const GAP_S = 0.06;
const VOLUME = 0.28;

let context: AudioContext | null = null;

const getContext = (): AudioContext | null => {
  if (context) return context;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
};

export const isNotificationSoundEnabled = (): boolean => {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setNotificationSoundEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off');
  } catch { /* sin localStorage: queda activado */ }
};

let prepared = false;

/** Habilita el audio con el primer toque o tecla en la app (requisito de los navegadores). */
export const prepareNotificationSound = (): void => {
  if (prepared) return;
  prepared = true;
  const unlock = () => {
    const ctx = getContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { /* se intenta de nuevo al sonar */ });
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
};

/** Toca el sonido del aviso (si está activado o si se fuerza, como en "Probar sonido"). */
export const playNotificationSound = async (kind: Kind, force = false): Promise<void> => {
  if (!force && !isNotificationSoundEnabled()) return;
  const ctx = getContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
  } catch {
    return; // el navegador aún no permite sonido (no se ha tocado la app)
  }
  const start = ctx.currentTime + 0.02;
  MELODIES[kind].forEach((frequency, i) => {
    const at = start + i * (NOTE_S + GAP_S);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, at);
    // Ataque corto y caída suave, como una campanita
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(VOLUME, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_S + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + NOTE_S + 0.25);
  });
};
