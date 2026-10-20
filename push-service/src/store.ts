// Suscripciones de los teléfonos y avisos ya enviados, guardados en /data (volumen de Docker).

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config';

export interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: number;
  offsets: number[];      // minutos de anticipación elegidos en la app
  createdAt: number;
  updatedAt: number;
}

const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const SENT_FILE = path.join(DATA_DIR, 'sent.json');
const SENT_TTL_MS = 3 * 24 * 3600_000;

const read = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const write = (file: string, data: unknown) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
};

let subscriptions: Subscription[] = read<Subscription[]>(SUBS_FILE, []);
// Aviso enviado → momento en que se envió (para no repetirlo); clave `${endpoint}|${id del aviso}`
let sent: Record<string, number> = read<Record<string, number>>(SENT_FILE, {});

export const getSubscriptions = (): Subscription[] => subscriptions;

export const upsertSubscription = (sub: Omit<Subscription, 'createdAt' | 'updatedAt'>): void => {
  const now = Date.now();
  const existing = subscriptions.find(s => s.endpoint === sub.endpoint);
  subscriptions = existing
    ? subscriptions.map(s => (s.endpoint === sub.endpoint ? { ...s, ...sub, updatedAt: now } : s))
    : [...subscriptions, { ...sub, createdAt: now, updatedAt: now }];
  write(SUBS_FILE, subscriptions);
};

export const updateOffsets = (endpoint: string, userId: number, offsets: number[]): boolean => {
  const found = subscriptions.find(s => s.endpoint === endpoint && s.userId === userId);
  if (!found) return false;
  found.offsets = offsets;
  found.updatedAt = Date.now();
  write(SUBS_FILE, subscriptions);
  return true;
};

export const removeSubscription = (endpoint: string): void => {
  subscriptions = subscriptions.filter(s => s.endpoint !== endpoint);
  write(SUBS_FILE, subscriptions);
};

export const wasSent = (endpoint: string, id: string): boolean => `${endpoint}|${id}` in sent;

export const markSent = (endpoint: string, ids: string[]): void => {
  const now = Date.now();
  ids.forEach(id => { sent[`${endpoint}|${id}`] = now; });
  // Se olvidan los avisos de hace más de 3 días
  sent = Object.fromEntries(Object.entries(sent).filter(([, at]) => now - at < SENT_TTL_MS));
  write(SENT_FILE, sent);
};
