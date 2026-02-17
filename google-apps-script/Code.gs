var SPREADSHEET_ID = "1PxqMgro5uWJBAbR1ey4atBE_jx-WhI0AAxbAY7zqbVU";
var SHEET_NAME = "Habits 2026";
var TIMEZONE = "America/Los_Angeles";

var FIELD_TO_COLUMN = {
  wakeUpAt8: "C",
  sleep75Hours: "D",
  meditate: "E",
  workout: "F",
  workOnStudio: "G",
  consumeDrugs: "H",
  socialLimits: "I",
  stretch: "J",
  hairCare: "K",
  gratitudePrayer: "L",
  wellbeing: "P",
  notes: "Q",
  activities: "R",
  weight: "S"
};

var HABIT_DEFINITIONS = [
  { key: "wakeUpAt8", label: "Wake up at 8" },
  { key: "sleep75Hours", label: "Get 7.5 hours of sleep" },
  { key: "meditate", label: "Meditate" },
  { key: "workout", label: "Workout" },
  { key: "workOnStudio", label: "Work on your business" },
  { key: "consumeDrugs", label: "Avoid marijuana consumption" },
  { key: "socialLimits", label: "Adhere to social media limits" },
  { key: "stretch", label: "Stretch" },
  { key: "hairCare", label: "Hair care protocol" },
  { key: "gratitudePrayer", label: "Gratitude journal, vision board, or pray" }
];

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    var p = e.parameter || {};
    var requestDateKey = normalizeRequestDateKey(p.clientDateKey);

    if (!requestDateKey) {
      throw new Error("Missing clientDateKey");
    }

    var targetRow = findOrCreateTodayRow(sheet, requestDateKey);
    var updates = buildUpdates(p, targetRow);

    for (var i = 0; i < updates.length; i++) {
      var u = updates[i];
      sheet.getRange(u.row, u.col).setValue(u.value);
    }

    return jsonResponse({ ok: true, row: targetRow, updates: updates.length });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (String(p.action || "") === "getToday") {
      var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
      var requestDateKey = normalizeRequestDateKey(p.clientDateKey) || getTodayKeyPST();
      var result = getValuesForDate(sheet, requestDateKey);
      return respond(result, p.callback);
    }
    if (String(p.action || "") === "getInsights") {
      var insightsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
      var insights = getHabitInsights(insightsSheet);
      var averageWellbeing = getAverageWellbeing(insightsSheet);
      return respond({ ok: true, habits: insights, averageWellbeing: averageWellbeing }, p.callback);
    }

    return respond({ ok: true, status: "alive" }, p.callback);
  } catch (err) {
    var fallback = { ok: false, error: String(err) };
    return respond(fallback, e && e.parameter ? e.parameter.callback : "");
  }
}

function findOrCreateTodayRow(sheet, todayKey) {
  var lastRow = sheet.getLastRow();

  if (lastRow < 1) {
    sheet.appendRow([todayKey]);
    return sheet.getLastRow();
  }

  var dateValues = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < dateValues.length; i++) {
    if (normalizeDateCellToKey(dateValues[i][0]) === todayKey) {
      return i + 1;
    }
  }

  sheet.appendRow([todayKey]);
  return sheet.getLastRow();
}

function findRowByDateKey(sheet, dateKey) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return 0;

  var dateValues = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < dateValues.length; i++) {
    if (normalizeDateCellToKey(dateValues[i][0]) === dateKey) {
      return i + 1;
    }
  }
  return 0;
}

function getValuesForDate(sheet, dateKey) {
  var row = findRowByDateKey(sheet, dateKey);
  if (!row) {
    return { ok: true, exists: false, dateKey: dateKey, values: {} };
  }

  var values = {};
  for (var key in FIELD_TO_COLUMN) {
    if (!FIELD_TO_COLUMN.hasOwnProperty(key)) continue;
    var colNumber = columnToNumber(FIELD_TO_COLUMN[key]);
    var cellValue = sheet.getRange(row, colNumber).getValue();
    var normalized = normalizeCellForField(key, cellValue);
    if (normalized !== "") {
      values[key] = normalized;
    }
  }

  return { ok: true, exists: true, dateKey: dateKey, row: row, values: values };
}

function getHabitInsights(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return HABIT_DEFINITIONS.map(function (habit) {
      return {
        key: habit.key,
        label: habit.label,
        completionPercent: 0,
        completionDisplay: "0%",
        currentStreak: 0
      };
    });
  }

  var lastColumn = columnToNumber("L");
  var rows = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var datedRows = [];

  for (var i = 0; i < rows.length; i++) {
    if (normalizeDateCellToKey(rows[i][0])) {
      datedRows.push(rows[i]);
    }
  }

  return HABIT_DEFINITIONS.map(function (habit) {
    var colNumber = columnToNumber(FIELD_TO_COLUMN[habit.key]);
    var colIndex = colNumber - 1;
    var totalDays = datedRows.length;
    var doneDays = 0;
    var streak = 0;

    for (var r = 0; r < datedRows.length; r++) {
      var value = normalizeBinary(datedRows[r][colIndex]);
      if (value === 1) {
        doneDays++;
      }
    }

    for (var x = datedRows.length - 1; x >= 0; x--) {
      var streakValue = normalizeBinary(datedRows[x][colIndex]);
      if (streakValue === 1) {
        streak++;
      } else {
        break;
      }
    }

    var percent = totalDays > 0 ? Math.round((doneDays / totalDays) * 100) : 0;

    return {
      key: habit.key,
      label: habit.label,
      completionPercent: percent,
      completionDisplay: String(percent) + "%",
      currentStreak: streak
    };
  });
}

function getAverageWellbeing(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return { value: 0, display: "0.0", count: 0 };
  }

  var wellBeingCol = columnToNumber(FIELD_TO_COLUMN.wellbeing);
  var values = sheet.getRange(1, wellBeingCol, lastRow, 1).getValues();
  var sum = 0;
  var count = 0;

  for (var i = 0; i < values.length; i++) {
    var n = Number(values[i][0]);
    if (isNaN(n)) continue;
    if (n < 0 || n > 10) continue;
    sum += n;
    count++;
  }

  if (count === 0) {
    return { value: 0, display: "0.0", count: 0 };
  }

  var avg = sum / count;
  return { value: avg, display: avg.toFixed(1), count: count };
}

function buildUpdates(params, targetRow) {
  var updates = [];

  for (var key in FIELD_TO_COLUMN) {
    if (!FIELD_TO_COLUMN.hasOwnProperty(key)) continue;
    if (!params.hasOwnProperty(key)) continue;

    var normalized = normalizeByField(key, params[key]);
    if (normalized === "") continue;

    updates.push({
      row: targetRow,
      col: columnToNumber(FIELD_TO_COLUMN[key]),
      value: normalized
    });
  }

  return updates;
}

function normalizeByField(fieldName, value) {
  if (fieldName === "wellbeing") return normalizeWellbeing(value);
  if (fieldName === "activities") return String(value || "").trim();
  if (fieldName === "weight") return String(value || "").trim();
  if (fieldName === "notes") return String(value || "").trim();
  if (fieldName === "timestamp") return String(value || "").trim();
  return normalizeBinary(value);
}

function normalizeCellForField(fieldName, value) {
  if (fieldName === "wellbeing") {
    var wellbeing = normalizeWellbeing(value);
    return wellbeing === "" ? "" : String(wellbeing);
  }
  if (fieldName === "notes" || fieldName === "activities" || fieldName === "weight") {
    return String(value || "").trim();
  }
  return normalizeBinary(value) === "" ? "" : String(normalizeBinary(value));
}

function normalizeRequestDateKey(value) {
  var text = String(value || "").trim();
  if (!text) return "";

  var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return Number(iso[2]) + "/" + Number(iso[3]);
  }

  var mmdd = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mmdd) {
    return Number(mmdd[1]) + "/" + Number(mmdd[2]);
  }

  return "";
}

function getTodayKeyPST() {
  return Utilities.formatDate(new Date(), TIMEZONE, "M/d");
}

function normalizeDateCellToKey(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, TIMEZONE, "M/d");
  }

  var text = String(value || "").trim();
  if (!text) return "";

  var mmddyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mmddyyyy) {
    return Number(mmddyyyy[1]) + "/" + Number(mmddyyyy[2]);
  }

  var mmdd = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mmdd) {
    return Number(mmdd[1]) + "/" + Number(mmdd[2]);
  }

  return text;
}

function normalizeBinary(v) {
  if (v === null || v === undefined || String(v).trim() === "") return "";
  if (String(v) === "1") return 1;
  if (String(v) === "0") return 0;
  return "";
}

function normalizeWellbeing(v) {
  var text = String(v || "").trim();
  if (!text) return "";

  var n = Number(text);
  if (isNaN(n)) return "";
  if (n < 0) return 0;
  if (n > 10) return 10;
  return Math.round(n);
}

function columnToNumber(column) {
  var col = 0;
  for (var i = 0; i < column.length; i++) {
    col = col * 26 + (column.charCodeAt(i) - 64);
  }
  return col;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function respond(obj, callback) {
  var cb = String(callback || "").trim();
  if (!cb) return jsonResponse(obj);

  var safeCallback = cb.match(/^[A-Za-z_$][0-9A-Za-z_$\.]*$/);
  if (!safeCallback) return jsonResponse({ ok: false, error: "Invalid callback" });

  var payload = cb + "(" + JSON.stringify(obj) + ");";
  return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
