self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'Planned Out';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'You have a task reminder.',
    icon: data.icon || '/planned-out-icon-192.png',
    badge: data.badge || '/planned-out-icon-192.png',
    tag: data.taskId ? `planned-out-${data.taskId}` : 'planned-out-reminder',
    renotify: true,
    data: { url: data.url || '/', taskId: data.taskId || null }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});
