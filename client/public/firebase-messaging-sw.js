/* Firebase Cloud Messaging service worker for Fleet ERP */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAhevglOhmR-0Q02D69IYVWR3sx_JZPrC8',
  authDomain: 'fleet-erp-b186f.firebaseapp.com',
  projectId: 'fleet-erp-b186f',
  storageBucket: 'fleet-erp-b186f.firebasestorage.app',
  messagingSenderId: '866952449353',
  appId: '1:866952449353:web:ce5c2b4f09941c70a4de98'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || 'Fleet ERP';
  const body = payload?.notification?.body || payload?.data?.body || 'You have a new notification.';

  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    requireInteraction: true,
    renotify: true,
    silent: false,
    vibrate: [250, 120, 250, 120, 400],
    tag: payload?.data?.notification_id || 'fleet-erp-push',
    data: payload?.data || {}
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if ('focus' in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(target);
    return undefined;
  }));
});
