// Service worker: recebe push do worker (pywebpush) e abre o app no alerta.
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Preço de oportunidade', {
      body: data.body,
      icon: '/icon-192.png',
      data: { url: data.url || '/alertas' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
