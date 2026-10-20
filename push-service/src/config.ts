// Configuración del servicio push. Se toma, en este orden:
//   1. Variables de entorno (del .env del proyecto, vía docker-compose)
//   2. /data/config.json (lo escribe el configurador: npm run setup)
// Sin token del usuario de servicio el servicio queda DESACTIVADO: responde que no hay push y la
// app funciona normal, solo sin avisos con la app cerrada.

import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

export const DATA_DIR = process.env.PUSH_DATA_DIR || '/data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

export interface PushConfig {
  glpiUrl: string;       // URL de GLPI (como la ve el servidor)
  appToken: string;      // App-Token del cliente API de GLPI
  userToken: string;     // token de API del usuario de servicio (solo lectura) — recomendado
  username: string;      // alternativa al token: usuario y contraseña del usuario de servicio
  password: string;
  vapidSubject: string;  // contacto para los servicios de push (mailto: o https:)
}

const readJson = <T>(file: string): Partial<T> => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};

export const loadConfig = (): PushConfig => {
  const saved = readJson<PushConfig>(CONFIG_FILE);
  return {
    glpiUrl: (process.env.PUSH_GLPI_URL || saved.glpiUrl || process.env.VITE_GLPI_URL || '').replace(/\/+$/, ''),
    appToken: process.env.PUSH_GLPI_APP_TOKEN || saved.appToken || process.env.VITE_GLPI_APP_TOKEN || '',
    userToken: process.env.PUSH_GLPI_USER_TOKEN || saved.userToken || '',
    username: process.env.PUSH_GLPI_USER || '',
    password: process.env.PUSH_GLPI_PASSWORD || '',
    vapidSubject: process.env.PUSH_VAPID_SUBJECT || saved.vapidSubject || 'mailto:soporte@itpocket.local'
  };
};

export const saveConfig = (config: Partial<PushConfig>): void => {
  // La contraseña nunca se guarda en disco (solo puede venir del .env)
  const { username: _u, password: _p, ...persisted } = config;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...readJson<PushConfig>(CONFIG_FILE), ...persisted }, null, 2), { mode: 0o600 });
};

export const isConfigured = (config: PushConfig): boolean =>
  !!(config.glpiUrl && config.appToken && (config.userToken || (config.username && config.password)));

/** Llaves VAPID (identifican a este servidor ante los servicios de push). Se generan una vez. */
export const loadVapidKeys = (): { publicKey: string; privateKey: string } => {
  if (process.env.PUSH_VAPID_PUBLIC_KEY && process.env.PUSH_VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.PUSH_VAPID_PUBLIC_KEY, privateKey: process.env.PUSH_VAPID_PRIVATE_KEY };
  }
  const saved = readJson<{ publicKey: string; privateKey: string }>(VAPID_FILE);
  if (saved.publicKey && saved.privateKey) return saved as { publicKey: string; privateKey: string };
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
  console.log('[push] Se generaron las llaves VAPID en', VAPID_FILE);
  return keys;
};
