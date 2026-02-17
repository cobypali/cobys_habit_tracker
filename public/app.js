const pushButton = document.getElementById("enablePushBtn");
const pushStatus = document.getElementById("pushStatus");
const saveStatus = document.getElementById("saveStatus");
const form = document.getElementById("habitForm");

const appConfig = window.APP_CONFIG || {};
const appsScriptUrl = appConfig.appsScriptUrl || "";
const oneSignalAppId = appConfig.oneSignalAppId || "";

init();

function init() {
  initOneSignal();
  scheduleInAppNotifications();
}

function initOneSignal() {
  if (!oneSignalAppId || oneSignalAppId.includes("PASTE_")) {
    pushStatus.textContent = "Set oneSignalAppId in public/config.js";
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    await OneSignal.init({
      appId: oneSignalAppId,
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerPath: "OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "OneSignalSDKUpdaterWorker.js",
      serviceWorkerParam: { scope: "./" },
      notifyButton: { enable: false }
    });
  });
}

pushButton.addEventListener("click", async () => {
  try {
    if (!window.OneSignal) {
      pushStatus.textContent = "OneSignal SDK not loaded yet. Try again.";
      return;
    }
    await window.OneSignal.Notifications.requestPermission();
    const isGranted = await window.OneSignal.Notifications.permission;
    pushStatus.textContent = isGranted ? "Push enabled." : "Push permission denied.";
  } catch (error) {
    console.error(error);
    pushStatus.textContent = "Failed to enable push.";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveStatus.textContent = "Saving...";

  if (!appsScriptUrl || appsScriptUrl.includes("PASTE_")) {
    saveStatus.textContent = "Set appsScriptUrl in public/config.js";
    return;
  }

  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  payload.timestamp = new Date().toISOString();

  const body = new URLSearchParams(payload);

  try {
    await fetch(appsScriptUrl, {
      method: "POST",
      mode: "no-cors",
      body
    });
    saveStatus.textContent = "Sent. Confirm in Google Sheet.";
  } catch (error) {
    console.error(error);
    saveStatus.textContent = "Save failed. Check Apps Script deployment.";
  }
});

function scheduleInAppNotifications() {
  if (!("Notification" in window)) {
    return;
  }
  setNextNotification(8, 0, "8:00 AM Habit Check-In", "Open the app and complete questions 1-4.");
  setNextNotification(9, 30, "9:30 AM Habit Check-In", "Open the app and complete questions 5-12.");
}

function setNextNotification(hour, minute, title, body) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  const delay = next.getTime() - now.getTime();
  window.setTimeout(() => {
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
    setNextNotification(hour, minute, title, body);
  }, delay);
}
