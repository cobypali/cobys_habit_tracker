const pushButton = document.getElementById("enablePushBtn");
const pushStatus = document.getElementById("pushStatus");
const habitsStatus = document.getElementById("habitsStatus");
const saveStatus = document.getElementById("saveStatus");
const form = document.getElementById("habitForm");
const saveHabitsButton = document.getElementById("saveHabitsBtn");
const seeInsightsButton = document.getElementById("seeInsightsBtn");

const appConfig = window.APP_CONFIG || {};
const appsScriptUrl = appConfig.appsScriptUrl || "";
const oneSignalAppId = appConfig.oneSignalAppId || "";
const binaryFieldNames = [
  "wakeUpAt8",
  "sleep75Hours",
  "meditate",
  "workout",
  "workOnStudio",
  "consumeDrugs",
  "socialLimits",
  "stretch",
  "hairCare",
  "gratitudePrayer"
];
const coreHabitFieldNames = [...binaryFieldNames];
const fullDayFieldNames = [...binaryFieldNames, "wellbeing", "notes", "activities", "weight"];
const insightsCacheKey = "habitTrackerInsightsCache";
const insightsCacheTtlMs = 5 * 60 * 1000;

let autoSaveTimerId = 0;
let isAutoSavingHabits = false;
let pendingAutoSaveHabits = false;
let suppressAutoSave = false;

init();

function init() {
  initOneSignal();
  initBinaryInputs();
  loadTodayValues();
  prefetchInsightsInBackground();
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

if (pushButton) {
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
}

if (seeInsightsButton) {
  seeInsightsButton.addEventListener("click", () => {
    prefetchInsightsInBackground();
    window.location.href = "insights.html";
  });
}

if (saveHabitsButton) {
  saveHabitsButton.addEventListener("click", async () => {
    await saveCoreHabits("Habits 1-10 saved.");
  });
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = buildPayload(fullDayFieldNames);
    if (!hasAtLeastOneHabitValue(payload)) {
      saveStatus.textContent = "Select or enter at least one field before saving.";
      return;
    }

    await sendPayload(payload, saveStatus, "Sent. Confirm in Google Sheet.");
  });
}

function updatePushButtonState(oneSignal) {
  if (!pushButton || !oneSignal || !oneSignal.User || !oneSignal.User.PushSubscription) {
    return;
  }
  const isOptedIn = Boolean(oneSignal.User.PushSubscription.optedIn);
  pushButton.textContent = isOptedIn ? "Disable Push Notifications" : "Enable Push Notifications";
}

function initBinaryInputs() {
  if (!form) {
    return;
  }

  const binaryButtons = form.querySelectorAll(".binary-btn");
  binaryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const fieldName = button.dataset.field;
      const value = button.dataset.value;
      if (!fieldName || typeof value === "undefined") {
        return;
      }
      setBinaryFieldValue(fieldName, value, { triggerAutoSave: true });
    });
  });
}

function setBinaryFieldValue(fieldName, value, options) {
  if (!form) {
    return;
  }

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

  const triggerAutoSave = !options || options.triggerAutoSave !== false;
  if (triggerAutoSave && !suppressAutoSave && coreHabitFieldNames.includes(fieldName)) {
    queueAutoSaveHabits();
  }
}

function queueAutoSaveHabits() {
  if (autoSaveTimerId) {
    window.clearTimeout(autoSaveTimerId);
  }

  autoSaveTimerId = window.setTimeout(async () => {
    autoSaveTimerId = 0;
    await saveCoreHabits("Habits 1-10 auto-saved.", true);
  }, 450);
}

async function saveCoreHabits(successMessage, isAutoSave) {
  if (isAutoSavingHabits) {
    pendingAutoSaveHabits = true;
    return;
  }

  const payload = buildPayload(coreHabitFieldNames);
  if (!hasAtLeastOneHabitValue(payload)) {
    habitsStatus.textContent = "Select at least one habit (1-10) before saving.";
    return;
  }

  isAutoSavingHabits = true;
  const savingMessage = isAutoSave ? "Auto-saving habits 1-10..." : "Saving habits 1-10...";
  const ok = await sendPayload(payload, habitsStatus, successMessage, savingMessage);
  isAutoSavingHabits = false;

  if (!ok) {
    pendingAutoSaveHabits = false;
    return;
  }

  if (pendingAutoSaveHabits) {
    pendingAutoSaveHabits = false;
    queueAutoSaveHabits();
  }
}

function getFieldValue(name) {
  if (!form) {
    return "";
  }

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
  return Object.keys(payload).length > 0;
}

async function sendPayload(payload, statusElement, successMessage, savingMessage) {
  statusElement.textContent = savingMessage || "Saving...";

  if (!appsScriptUrl || appsScriptUrl.includes("PASTE_")) {
    statusElement.textContent = "Set appsScriptUrl in public/config.js";
    return false;
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
    return true;
  } catch (error) {
    console.error(error);
    statusElement.textContent = "Save failed. Check Apps Script deployment.";
    return false;
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
  if (!values || typeof values !== "object" || !form) {
    return;
  }

  suppressAutoSave = true;

  for (const fieldName of binaryFieldNames) {
    if (!Object.prototype.hasOwnProperty.call(values, fieldName)) {
      continue;
    }

    const value = String(values[fieldName]).trim();
    if (value === "0" || value === "1") {
      setBinaryFieldValue(fieldName, value, { triggerAutoSave: false });
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

  suppressAutoSave = false;
}

function getTodayKeyLocal() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric"
  });
  return formatter.format(new Date());
}

function prefetchInsightsInBackground() {
  if (!appsScriptUrl || appsScriptUrl.includes("PASTE_")) {
    return;
  }

  const cached = readInsightsCache();
  if (cached && Date.now() - cached.cachedAt < insightsCacheTtlMs) {
    return;
  }

  fetchInsightsJsonp()
    .then((payload) => {
      if (!payload || payload.ok !== true || !Array.isArray(payload.habits)) {
        return;
      }

      sessionStorage.setItem(
        insightsCacheKey,
        JSON.stringify({
          cachedAt: Date.now(),
          payload
        })
      );
    })
    .catch((error) => {
      console.error("Failed to prefetch insights:", error);
    });
}

function fetchInsightsJsonp() {
  return new Promise((resolve, reject) => {
    const callbackName = "__habitTrackerInsights_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const query = new URLSearchParams({
      action: "getInsights",
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
    }, 8000);

    script.src = src;
    document.head.appendChild(script);
  });
}

function readInsightsCache() {
  try {
    const raw = sessionStorage.getItem(insightsCacheKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.payload) {
      return null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}
