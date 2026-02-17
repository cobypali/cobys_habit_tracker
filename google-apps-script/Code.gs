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

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    var p = e.parameter || {};
    var todayKey = getTodayKeyPST();
    var requestDateKey = normalizeRequestDateKey(p.clientDateKey);

    if (!requestDateKey) {
      throw new Error("Missing clientDateKey");
    }
    if (requestDateKey !== todayKey) {
      throw new Error("Date mismatch. Expected " + todayKey + " but received " + requestDateKey);
    }

    var targetRow = findOrCreateTodayRow(sheet, todayKey);
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

function doGet() {
  return jsonResponse({ ok: true, status: "alive" });
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
