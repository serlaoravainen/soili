// public/sw.js
self.addEventListener("push", (event) => {
  let data = {};
  try {
  data = event.data ? event.data.json() : {};
} catch {
  data = {};
}
  const title = data.title || "Ilmoitus";
  const body  = data.body  || "Sinulla on uusi ilmoitus.";
  const icon  = "/icon-192.png"; // laita oma polku, tai poista
  const tag   = data.tag || "tyovuoro";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      tag,
      data: data.data || {}
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICKED" });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
