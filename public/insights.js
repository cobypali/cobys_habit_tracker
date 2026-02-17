const insightsGrid = document.getElementById("insightsGrid");
const insightsStatus = document.getElementById("insightsStatus");
const wellbeingSummary = document.getElementById("wellbeingSummary");
const appConfig = window.APP_CONFIG || {};
const appsScriptUrl = appConfig.appsScriptUrl || "";

loadInsights();

async function loadInsights() {
  if (!appsScriptUrl || appsScriptUrl.includes("PASTE_")) {
    insightsStatus.textContent = "Set appsScriptUrl in public/config.js";
    return;
  }

  insightsStatus.textContent = "Loading insights...";

  try {
    const payload = await fetchInsightsJsonp();
    if (!payload || payload.ok !== true || !Array.isArray(payload.habits)) {
      insightsStatus.textContent = "No insights available.";
      return;
    }

    renderInsights(payload.habits, payload.averageWellbeing);
    insightsStatus.textContent = "";
  } catch (error) {
    console.error(error);
    insightsStatus.textContent = "Failed to load insights.";
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
    }, 10000);

    script.src = src;
    document.head.appendChild(script);
  });
}

function renderInsights(habits, averageWellbeing) {
  insightsGrid.innerHTML = "";

  habits.forEach((habit) => {
    const card = document.createElement("article");
    card.className = "insight-card";
    card.innerHTML =
      '<h3>' +
      escapeHtml(habit.label || "") +
      "</h3>" +
      '<div class="insight-metrics">' +
      '<div class="metric-box">' +
      '<p class="metric-label">% Days Done</p>' +
      '<p class="metric-value">' +
      escapeHtml(String(habit.completionDisplay || "0%")) +
      "</p>" +
      "</div>" +
      '<div class="metric-box">' +
      '<p class="metric-label">Current Streak</p>' +
      '<p class="metric-value">' +
      escapeHtml(String(habit.currentStreak || 0)) +
      "</p>" +
      "</div>" +
      "</div>";
    insightsGrid.appendChild(card);
  });

  renderWellbeingSummary(averageWellbeing);
}

function renderWellbeingSummary(averageWellbeing) {
  if (!wellbeingSummary) {
    return;
  }

  const avgDisplay =
    averageWellbeing && typeof averageWellbeing.display === "string" ? averageWellbeing.display : "0.0";
  const count = averageWellbeing && typeof averageWellbeing.count === "number" ? averageWellbeing.count : 0;

  wellbeingSummary.innerHTML =
    '<h3>Average Well-being (11)</h3>' +
    '<p class="wellbeing-value">' +
    escapeHtml(avgDisplay) +
    " / 10</p>" +
    '<p class="wellbeing-count">Based on ' +
    escapeHtml(String(count)) +
    " day(s).</p>";
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
