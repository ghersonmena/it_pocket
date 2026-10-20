// Servicio push de ITPocket (opcional). nginx le pasa las rutas /push/*:
//   GET  /push/status        → { enabled, publicKey }   (la app decide si ofrece el push)
//   POST /push/subscribe     → { subscription, offsets, sessionToken }
//   POST /push/preferences   → { endpoint, offsets, sessionToken }
//   POST /push/unsubscribe   → { endpoint }
// La sesión de GLPI de la app se verifica con GLPI en cada alta o cambio, así un teléfono solo
// puede recibir los avisos de quien inició sesión en él.

import http from 'node:http';
import webpush from 'web-push';
import { loadConfig, isConfigured, loadVapidKeys } from './config';
import { cleanOffsets } from '../../src/services/reminderRules';

const PORT = Number(process.env.PUSH_PORT || 8080);
const MAX_BODY = 16 * 1024;

const config = loadConfig();
const enabled = isConfigured(config);
const vapid = loadVapidKeys();
webpush.setVapidDetails(config.vapidSubject, vapid.publicKey, vapid.privateKey);

// Solo se carga lo de GLPI si el servicio está configurado
const glpi = enabled ? await import('./glpi') : null;
const store = await import('./store');
const scheduler = enabled ? await import('./scheduler') : null;

if (enabled && glpi) {
  try {
    const s = await glpi.getServiceSession(config);
    console.log(`[push] Activo. Usuario de servicio conectado a ${config.glpiUrl} (perfil: ${s.activeProfile || '?'}). Suscripciones: ${store.getSubscriptions().length}`);
  } catch (err: any) {
    console.error(`[push] Configurado, pero GLPI no aceptó el token del usuario de servicio: ${err.message || err}. Se reintentará al revisar avisos.`);
  }
  scheduler!.startScheduler(config);
} else {
  console.log('[push] DESACTIVADO: falta el token del usuario de servicio (PUSH_GLPI_USER_TOKEN o "npm run setup"). La app funciona sin avisos con la app cerrada.');
}

const send = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const readBody = (req: http.IncomingMessage): Promise<any> => new Promise((resolve, reject) => {
  let size = 0;
  const chunks: Buffer[] = [];
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_BODY) { reject(new Error('Petición demasiado grande')); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('JSON inválido')); }
  });
  req.on('error', reject);
});

const validSubscription = (sub: any): boolean =>
  typeof sub?.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && typeof sub?.keys?.p256dh === 'string' && typeof sub?.keys?.auth === 'string';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const route = `${req.method} ${url.pathname.replace(/\/+$/, '')}`;
  try {
    if (route === 'GET /push/status') {
      return send(res, 200, { enabled, publicKey: enabled ? vapid.publicKey : null });
    }
    if (!enabled || !glpi) return send(res, 503, { error: 'El servicio push no está configurado en este servidor.' });

    if (route === 'POST /push/subscribe') {
      const { subscription, offsets, sessionToken } = await readBody(req);
      if (!validSubscription(subscription)) return send(res, 400, { error: 'Suscripción inválida' });
      const userId = await glpi.verifyAppSession(config, String(sessionToken || ''));
      if (!userId) return send(res, 401, { error: 'La sesión de GLPI no es válida' });
      store.upsertSubscription({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        userId,
        offsets: cleanOffsets(Array.isArray(offsets) ? offsets : [1, 0])
      });
      scheduler?.invalidateSnapshot();
      console.log(`[push] Teléfono suscrito para el usuario ${userId}`);
      return send(res, 200, { ok: true });
    }

    if (route === 'POST /push/preferences') {
      const { endpoint, offsets, sessionToken } = await readBody(req);
      const userId = await glpi.verifyAppSession(config, String(sessionToken || ''));
      if (!userId) return send(res, 401, { error: 'La sesión de GLPI no es válida' });
      const ok = store.updateOffsets(String(endpoint || ''), userId, cleanOffsets(Array.isArray(offsets) ? offsets : []));
      return send(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Suscripción no encontrada' });
    }

    if (route === 'POST /push/unsubscribe') {
      const { endpoint } = await readBody(req);
      store.removeSubscription(String(endpoint || ''));
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'No encontrado' });
  } catch (err: any) {
    console.error('[push] Error en', route, err.message || err);
    return send(res, 500, { error: 'Error interno' });
  }
});

server.listen(PORT, () => console.log(`[push] Escuchando en el puerto ${PORT}`));
