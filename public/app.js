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
const fullDayFieldNames = [
  ...morningFieldNames,
  "workOnStudio",
  "consumeDrugs",
  "socialLimits",
  "stretch",
  "hairCare",
  "gratitudePrayer",
  "wellbeing",
  "notes",
  "activities",
  "weight"
];

init();

function init() {
  initOneSignal();
  initBinaryInputs();
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
  const payload = buildPayload(fullDayFieldNames);
  if (!hasAtLeastOneHabitValue(payload)) {
    saveStatus.textContent = "Select or enter at least one field before saving.";
    return;
  }

  await sendPayload(payload, saveStatus, "Sent. Confirm in Google Sheet.");
});

morningUpdateButton.addEventListener("click", async () => {
  const payload = buildPayload(morningFieldNames);
  if (!hasAtLeastOneHabitValue(payload)) {
    morningStatus.textContent = "Select at least one 8:00 AM field before updating.";
    return;
  }

  payload.checkInType = "8am";
  await sendPayload(payload, morningStatus, "8:00 AM check-in sent.");
});

function initBinaryInputs() {
  const binaryButtons = form.querySelectorAll(".binary-btn");
  binaryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const fieldName = button.dataset.field;
      const value = button.dataset.value;
      if (!fieldName || typeof value === "undefined") {
        return;
      }
      setBinaryFieldValue(fieldName, value);
    });
  });
}

function setBinaryFieldValue(fieldName, value) {
  const hiddenInput = form.querySelector(`input[type="hidden"][name="${fieldName}"]`);
  if (!hiddenInput) {
    return;
  }

  hiddenInput.value = value;
  const relatedButtons = form.querySelectorAll(`.binary-btn[data-field="${fieldName}"]`);
  relatedButtons.forEach((button) => {
    const isSelected = button.dataset.value === value;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function getFieldValue(name) {
  const field = form.elements.namedItem(name);
  if (!field) {
    return "";
  }
  return String(field.value || "").trim();
}

function buildPayload(fieldNames) {
  const payload = {};
  for (const name of fieldNames) {
    const value = getFieldValue(name);
    if (value !== "") {
      payload[name] = value;
    }
  }
  return payload;
}

function hasAtLeastOneHabitValue(payload) {
  return Object.keys(payload).some((key) => key !== "checkInType");
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
  setNextNotification(21, 30, "9:30 PM Habit Check-In", "Open the app and complete questions 5-14.");
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
