self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Habit Tracker";
  const body = data.body || "You have a check-in to complete.";
  const section = data.section || "";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { section }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const section = (event.notification.data && event.notification.data.section) || "";
  const url = section ? `/#${section}` : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
