// Minimal service worker: exists so reminder notifications can be shown via
// registration.showNotification() (required on Android, where the
// `new Notification()` constructor throws). No caching/offline logic here.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Tapping a notification focuses the app (or opens it if it's closed).
// Tapping one of its action buttons (Done / Snooze) forwards the action to
// the running app instead — the page owns the stores, not this worker.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action; // "" for a plain body tap
  const data = event.notification.data;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (action && data && clients.length > 0) {
        // Deliver to every open client; the store is shared, handlers dedupe.
        for (const client of clients) {
          client.postMessage({ type: "reminder-action", action, data });
        }
        return undefined; // acting on a button shouldn't yank the app forward
      }
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
