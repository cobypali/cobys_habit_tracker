const habitsStatus = document.getElementById("habitsStatus");
const saveStatus = document.getElementById("saveStatus");
const form = document.getElementById("habitForm");
const saveHabitsButton = document.getElementById("saveHabitsBtn");
const seeInsightsButton = document.getElementById("seeInsightsBtn");
const prevDateButton = document.getElementById("prevDateBtn");
const nextDateButton = document.getElementById("nextDateBtn");
const currentDateLabel = document.getElementById("currentDateLabel");
const dayScoreText = document.getElementById("dayScoreText");

const appConfig = window.APP_CONFIG || {};
const appsScriptUrl = appConfig.appsScriptUrl || "";
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
const fullDayFieldNames = [...binaryFieldNames, "wellbeing", "notes", "activities", "stomachFeel", "weight"];
const insightsCacheKey = "habitTrackerInsightsCache";
const insightsCacheTtlMs = 5 * 60 * 1000;

let autoSaveTimerId = 0;
let isAutoSavingHabits = false;
let pendingAutoSaveHabits = false;
let suppressAutoSave = false;
let selectedDate = getStartOfTodayLocal();
let activeDateLoadRequestId = 0;

init();

function init() {
  initBinaryInputs();
  initDateNavigation();
  updateCurrentDateLabel();
  scheduleNonCriticalStartupWork();
}

function scheduleNonCriticalStartupWork() {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => {
      loadSelectedDateValues();
      prefetchInsightsInBackground();
    }, { timeout: 2500 });
    return;
  }

  window.setTimeout(() => {
    loadSelectedDateValues();
    prefetchInsightsInBackground();
  }, 800);
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

function initDateNavigation() {
  if (prevDateButton) {
    prevDateButton.addEventListener("click", () => {
      shiftSelectedDate(-1);
    });
  }

  if (nextDateButton) {
    nextDateButton.addEventListener("click", () => {
      shiftSelectedDate(1);
    });
  }
}

function shiftSelectedDate(days) {
  selectedDate = addDays(selectedDate, days);
  updateCurrentDateLabel();
  loadSelectedDateValues();
}

function updateCurrentDateLabel() {
  if (!currentDateLabel) {
    return;
  }

  currentDateLabel.textContent = formatDisplayDate(selectedDate);
}

function updateDayScoreDisplay(scoreValue) {
  if (!dayScoreText) {
    return;
  }

  const normalized = scoreValue === null || typeof scoreValue === "undefined" ? "" : String(scoreValue).trim();
  dayScoreText.textContent = normalized ? "Score of the day: " + formatDayScorePercent(normalized) : "Score of the day: --";
}

function formatDayScorePercent(scoreText) {
  if (/%$/.test(scoreText)) {
    return scoreText;
  }

  const n = Number(scoreText);
  if (Number.isNaN(n)) {
    return scoreText;
  }

  const percentValue = n > 0 && n <= 1 ? n * 100 : n;
  const rounded = Math.round(percentValue * 10) / 10;
  return String(rounded) + "%";
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
    clientDateKey: getDateKeyLocal(selectedDate)
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

async function loadSelectedDateValues() {
  if (!appsScriptUrl || appsScriptUrl.includes("PASTE_")) {
    return;
  }

  const requestId = ++activeDateLoadRequestId;

  try {
    const payload = await fetchValuesForDateJsonp(selectedDate);
    if (requestId !== activeDateLoadRequestId) {
      return;
    }

    clearFormValues();

    if (!payload || payload.ok !== true || payload.exists !== true || !payload.values) {
      return;
    }

    applySavedValues(payload.values);
  } catch (error) {
    console.error("Failed to load existing values:", error);
  }
}

function fetchValuesForDateJsonp(date) {
  return new Promise((resolve, reject) => {
    const callbackName = "__habitTrackerPrefill_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const query = new URLSearchParams({
      action: "getToday",
      clientDateKey: getDateKeyLocal(date),
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

  for (const fieldName of ["wellbeing", "notes", "activities", "stomachFeel", "weight"]) {
    if (!Object.prototype.hasOwnProperty.call(values, fieldName)) {
      continue;
    }

    const field = form.elements.namedItem(fieldName);
    if (field) {
      field.value = String(values[fieldName]);
    }
  }

  if (Object.prototype.hasOwnProperty.call(values, "dayScore")) {
    updateDayScoreDisplay(values.dayScore);
  }

  suppressAutoSave = false;
}

function clearFormValues() {
  if (!form) {
    return;
  }

  suppressAutoSave = true;

  for (const fieldName of binaryFieldNames) {
    const hiddenInput = form.querySelector(`input[type="hidden"][name="${fieldName}"]`);
    if (hiddenInput) {
      hiddenInput.value = "";
    }

    const relatedButtons = form.querySelectorAll(`.binary-btn[data-field="${fieldName}"]`);
    relatedButtons.forEach((button) => {
      button.classList.remove("is-selected");
      button.setAttribute("aria-pressed", "false");
    });
  }

  for (const fieldName of ["wellbeing", "notes", "activities", "stomachFeel", "weight"]) {
    const field = form.elements.namedItem(fieldName);
    if (field) {
      field.value = "";
    }
  }

  updateDayScoreDisplay("");
  suppressAutoSave = false;
}

function getDateKeyLocal(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric"
  });
  return formatter.format(date);
}

function getStartOfTodayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatDisplayDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
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
