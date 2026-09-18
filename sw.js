// SwiftPurse\frontend\sw.js
const ICON = '/frontend/storage/app/public/photos/BCPc6799aTDnlcAtaRZAXzQZ7MBzrLZL0H6DStQv.png';

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (_) { data = { body: event.data ? event.data.text() : '' }; }

  const title = String(data.title || 'Digital-grownt');
  const options = {
    body: String(data.body || 'You have a new notification'),
    icon: data.icon || ICON,
    badge: data.badge || ICON,
    tag: data.tag || 'digital-grownt-notification',
    renotify: true,
    requireInteraction: Boolean(data.requireInteraction),
    vibrate: [200, 100, 200],
    data: { url: data.url || '/frontend/user/dashboard.html' },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({ type: 'DIGITAL_GROWNT_NOTIFICATION', title, body: options.body, url: options.data.url });
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/frontend/user/dashboard.html', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((windowClient) => windowClient.url.startsWith(self.location.origin));
      if (existing) return existing.focus().then(() => existing.navigate(target));
      return clients.openWindow(target);
    })
  );
});
