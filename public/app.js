const pushButton = document.getElementById("enablePushBtn");
const pushStatus = document.getElementById("pushStatus");
const morningStatus = document.getElementById("morningStatus");
const habitsStatus = document.getElementById("habitsStatus");
const saveStatus = document.getElementById("saveStatus");
const form = document.getElementById("habitForm");
const morningUpdateButton = document.getElementById("updateMorningBtn");
const saveHabitsButton = document.getElementById("saveHabitsBtn");

const appConfig = window.APP_CONFIG || {};
const appsScriptUrl = appConfig.appsScriptUrl || "";
const oneSignalAppId = appConfig.oneSignalAppId || "";
const morningFieldNames = ["wakeUpAt8", "sleep75Hours", "meditate", "workout"];
const binaryFieldNames = [
  ...morningFieldNames,
  "workOnStudio",
  "consumeDrugs",
  "socialLimits",
  "stretch",
  "hairCare",
  "gratitudePrayer"
];
const coreHabitFieldNames = [...binaryFieldNames];
const fullDayFieldNames = [
  ...binaryFieldNames,
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
  loadTodayValues();
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

    updatePushButtonState(OneSignal);
    OneSignal.User.PushSubscription.addEventListener("change", () => {
      updatePushButtonState(OneSignal);
    });
  });
}

pushButton.addEventListener("click", async () => {
  try {
    if (!window.OneSignal) {
      pushStatus.textContent = "OneSignal SDK not loaded yet. Try again.";
      return;
    }

    const pushSubscription = window.OneSignal.User.PushSubscription;
    const currentlyOptedIn = Boolean(pushSubscription && pushSubscription.optedIn);

    if (currentlyOptedIn) {
      pushSubscription.optOut();
      pushStatus.textContent = "Push disabled.";
      updatePushButtonState(window.OneSignal);
      return;
    }

    await pushSubscription.optIn();
    const isOptedIn = Boolean(pushSubscription.optedIn);
    pushStatus.textContent = isOptedIn ? "Push enabled." : "Push permission denied or blocked.";
    updatePushButtonState(window.OneSignal);
  } catch (error) {
    console.error(error);
    pushStatus.textContent = "Failed to update push settings.";
  }
});

function updatePushButtonState(oneSignal) {
  if (!pushButton || !oneSignal || !oneSignal.User || !oneSignal.User.PushSubscription) {
    return;
  }
  const isOptedIn = Boolean(oneSignal.User.PushSubscription.optedIn);
  pushButton.textContent = isOptedIn ? "Disable Push Notifications" : "Enable Push Notifications";
}

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

if (saveHabitsButton) {
  saveHabitsButton.addEventListener("click", async () => {
    const payload = buildPayload(coreHabitFieldNames);
    if (!hasAtLeastOneHabitValue(payload)) {
      habitsStatus.textContent = "Select at least one habit (1-10) before saving.";
      return;
    }

    await sendPayload(payload, habitsStatus, "Habits 1-10 saved.");
  });
}

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

  const payloadWithDate = {
    ...payload,
    clientDateKey: getTodayKeyLocal()
  };
  const body = new URLSearchParams(payloadWithDate);

  try {
    await fetch(appsScriptUrl, {
      method: "POST",
      mode: "no-cors",
      credentials: "include",
      body
    });
    statusElement.textContent = successMessage;
  } catch (error) {
    console.error(error);
    statusElement.textContent = "Save failed. Check Apps Script deployment.";
  }
}

async function loadTodayValues() {
  if (!appsScriptUrl || appsScriptUrl.includes("PASTE_")) {
    return;
  }

  try {
    const payload = await fetchTodayValuesJsonp();
    if (!payload || payload.ok !== true || payload.exists !== true || !payload.values) {
      return;
    }

    applySavedValues(payload.values);
  } catch (error) {
    console.error("Failed to load existing values:", error);
  }
}

function fetchTodayValuesJsonp() {
  return new Promise((resolve, reject) => {
    const callbackName = "__habitTrackerPrefill_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const query = new URLSearchParams({
      action: "getToday",
      clientDateKey: getTodayKeyLocal(),
      callback: callbackName
    });
    const separator = appsScriptUrl.includes("?") ? "&" : "?";
    const src = appsScriptUrl + separator + query.toString();
    const script = document.createElement("script");
    let timeoutId = 0;

    function cleanup() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      delete window[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP request failed"));
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("JSONP request timed out"));
    }, 10000);

    script.src = src;
    document.head.appendChild(script);
  });
}

function applySavedValues(values) {
  if (!values || typeof values !== "object") {
    return;
  }

  for (const fieldName of binaryFieldNames) {
    if (!Object.prototype.hasOwnProperty.call(values, fieldName)) {
      continue;
    }
    const value = String(values[fieldName]).trim();
    if (value === "0" || value === "1") {
      setBinaryFieldValue(fieldName, value);
    }
  }

  for (const fieldName of ["wellbeing", "notes", "activities", "weight"]) {
    if (!Object.prototype.hasOwnProperty.call(values, fieldName)) {
      continue;
    }

    const field = form.elements.namedItem(fieldName);
    if (field) {
      field.value = String(values[fieldName]);
    }
  }
}

function getTodayKeyLocal() {
  var formatter = new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric"
  });
  return formatter.format(new Date());
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
