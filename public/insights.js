const insightsGrid = document.getElementById("insightsGrid");
const insightsStatus = document.getElementById("insightsStatus");
const wellbeingSummary = document.getElementById("wellbeingSummary");
const backToTrackerButton = document.getElementById("backToTrackerBtn");
const appConfig = window.APP_CONFIG || {};
const appsScriptUrl = appConfig.appsScriptUrl || "";
const insightsCacheKey = "habitTrackerInsightsCache";
const insightsCacheTtlMs = 5 * 60 * 1000;

if (backToTrackerButton) {
  backToTrackerButton.addEventListener("click", () => {
    window.location.href = "index.html";
  });
}

loadInsights();

async function loadInsights() {
  if (!appsScriptUrl || appsScriptUrl.includes("PASTE_")) {
    insightsStatus.textContent = "Set appsScriptUrl in public/config.js";
    return;
  }

  const cached = readInsightsCache();
  if (cached && cached.payload && Array.isArray(cached.payload.habits)) {
    renderInsights(cached.payload.habits, cached.payload.overallScoreAverage, cached.payload.averageWellbeing);
    insightsStatus.textContent = "";

    if (Date.now() - cached.cachedAt < insightsCacheTtlMs) {
      return;
    }
  } else {
    insightsStatus.textContent = "Loading insights...";
  }

  try {
    const payload = await fetchInsightsJsonp();
    if (!payload || payload.ok !== true || !Array.isArray(payload.habits)) {
      insightsStatus.textContent = "No insights available.";
      return;
    }

    sessionStorage.setItem(
      insightsCacheKey,
      JSON.stringify({
        cachedAt: Date.now(),
        payload
      })
    );

    renderInsights(payload.habits, payload.overallScoreAverage, payload.averageWellbeing);
    insightsStatus.textContent = "";
  } catch (error) {
    console.error(error);
    if (!cached) {
      insightsStatus.textContent = "Failed to load insights.";
    }
  }
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

function renderInsights(habits, overallScoreAverage, averageWellbeing) {
  insightsGrid.innerHTML = "";

  habits.forEach((habit) => {
    const card = document.createElement("article");
    card.className = "insight-card";
    card.innerHTML =
      "<h3>" +
      escapeHtml(habit.label || "") +
      "</h3>" +
      '<div class="insight-metrics">' +
      '<div class="metric-box">' +
      '<p class="metric-label">% Days Done</p>' +
      '<p class="metric-value">' +
      escapeHtml(String(habit.completionDisplay || "0%")) +
      "</p>" +
      "</div>" +
      "</div>";
    insightsGrid.appendChild(card);
  });

  renderSummaries(overallScoreAverage, averageWellbeing);
}

function renderSummaries(overallScoreAverage, averageWellbeing) {
  if (!wellbeingSummary) {
    return;
  }

  const overallDisplay =
    overallScoreAverage && typeof overallScoreAverage.display === "string" ? overallScoreAverage.display : "0%";
  const avgDisplay =
    averageWellbeing && typeof averageWellbeing.display === "string" ? averageWellbeing.display : "0.0";

  wellbeingSummary.innerHTML =
    '<div class="summary-block">' +
    "<h3>Overall Score Average</h3>" +
    '<p class="wellbeing-value">' +
    escapeHtml(overallDisplay) +
    "</p>" +
    "</div>" +
    '<div class="summary-block">' +
    "<h3>Average Well-being</h3>" +
    '<p class="wellbeing-value">' +
    escapeHtml(avgDisplay) +
    " / 10</p>" +
    "</div>";
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

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
