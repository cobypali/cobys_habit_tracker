const pushButton = document.getElementById("enablePushBtn");
const pushStatus = document.getElementById("pushStatus");
const morningStatus = document.getElementById("morningStatus");
const saveStatus = document.getElementById("saveStatus");
const form = document.getElementById("habitForm");
const morningUpdateButton = document.getElementById("updateMorningBtn");

const appConfig = window.APP_CONFIG || {};
const appsScriptUrl = appConfig.appsScriptUrl || "";
const oneSignalAppId = appConfig.oneSignalAppId || "";
const morningFieldNames = ["wakeUpAt8", "sleep75Hours", "meditate", "workout"];
const fullDayRequiredFieldNames = [
  ...morningFieldNames,
  "workOnStudio",
  "consumeDrugs",
  "socialLimits",
  "stretch",
  "hairCare",
  "gratitudePrayer",
  "wellbeing"
];

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
  if (!validateRequiredFields(fullDayRequiredFieldNames, saveStatus, "Complete all required fields before saving.")) {
    return;
  }

  const payload = buildPayload([...fullDayRequiredFieldNames, "notes"]);
  await sendPayload(payload, saveStatus, "Sent. Confirm in Google Sheet.");
});

morningUpdateButton.addEventListener("click", async () => {
  if (!validateRequiredFields(morningFieldNames, morningStatus, "Complete questions 1-4 before updating 8:00 AM check-in.")) {
    return;
  }

  const payload = buildPayload(morningFieldNames);
  payload.checkInType = "8am";
  await sendPayload(payload, morningStatus, "8:00 AM check-in sent.");
});

function getFieldValue(name) {
  const field = form.elements.namedItem(name);
  if (!field) {
    return "";
  }
  return String(field.value || "").trim();
}

function validateRequiredFields(fieldNames, statusElement, message) {
  for (const name of fieldNames) {
    if (getFieldValue(name) === "") {
      statusElement.textContent = message;
      const field = form.elements.namedItem(name);
      if (field && typeof field.focus === "function") {
        field.focus();
      }
      return false;
    }
  }

  return true;
}

function buildPayload(fieldNames) {
  const payload = { timestamp: new Date().toISOString() };
  for (const name of fieldNames) {
    const value = getFieldValue(name);
    if (value !== "") {
      payload[name] = value;
    }
  }
  return payload;
}

async function sendPayload(payload, statusElement, successMessage) {
  statusElement.textContent = "Saving...";

  if (!appsScriptUrl || appsScriptUrl.includes("PASTE_")) {
    statusElement.textContent = "Set appsScriptUrl in public/config.js";
    return;
  }

  const body = new URLSearchParams(payload);

  try {
    await fetch(appsScriptUrl, {
      method: "POST",
      mode: "no-cors",
      body
    });
    statusElement.textContent = successMessage;
  } catch (error) {
    console.error(error);
    statusElement.textContent = "Save failed. Check Apps Script deployment.";
  }
}

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
