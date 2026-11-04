self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch (error) {
    payload = { body: event.data?.text() || '새로운 알림이 있습니다.' };
  }

  const title = payload.title || '수영관리';
  const options = {
    body: payload.body || '새로운 알림이 있습니다.',
    badge: payload.badge || undefined,
    icon: payload.icon || undefined,
    tag: payload.tag || 'swim-notification',
    renotify: true,
    data: {
      url: payload.url || './member-home.html',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});
