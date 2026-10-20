// Service worker de ITPocket: solo atiende las notificaciones del sistema (no guarda caché, para
// que las actualizaciones de la app lleguen siempre): muestra los avisos que manda el servicio
// push (aunque la app esté cerrada) y, al tocar una notificación, abre la app en la tarea.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// Aviso enviado por el servicio push (push-service)
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: 'ITPocket', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'ITPocket', {
    body: payload.body || '',
    tag: payload.tag,
    data: payload.data || {},
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-64.png'
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find(c => 'focus' in c);
    if (client) {
      // La app ya está abierta: se trae al frente y ella abre la tarea
      await client.focus();
      client.postMessage({ type: 'itpocket:open-task', ...data });
      return;
    }
    // La app estaba cerrada: se abre con la tarea en la URL
    const params = new URLSearchParams({
      openTask: String(data.taskId || ''),
      project: String(data.projectId || ''),
      projectName: data.projectName || '',
      notification: data.id || ''
    });
    await self.clients.openWindow(`/?${params}`);
  })());
});
