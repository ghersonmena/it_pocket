// Service worker de ITPocket: solo atiende las notificaciones del sistema (no guarda caché, para
// que las actualizaciones de la app lleguen siempre). Al tocar una notificación se abre la app en
// la tarea del aviso.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

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
