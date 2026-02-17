function doPost(e) {
  try {
    var sheet = SpreadsheetApp.openById("1PxqMgro5uWJBAbR1ey4atBE_jx-WhI0AAxbAY7zqbVU").getSheetByName("Sheet1");
    var p = e.parameter || {};

    var row = [
      p.timestamp || new Date().toISOString(),
      normalizeBinary(p.wakeUpAt8),
      normalizeBinary(p.sleep75Hours),
      normalizeBinary(p.meditate),
      normalizeBinary(p.workout),
      normalizeBinary(p.workOnStudio),
      normalizeBinary(p.consumeDrugs),
      normalizeBinary(p.socialLimits),
      normalizeBinary(p.stretch),
      normalizeBinary(p.hairCare),
      normalizeBinary(p.gratitudePrayer),
      normalizeWellbeing(p.wellbeing),
      p.notes || ""
    ];

    sheet.appendRow(row);
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonResponse({ ok: true, status: "alive" });
}

function normalizeBinary(v) {
  if (v === null || v === undefined || String(v).trim() === "") return "";
  if (String(v) === "1") return 1;
  if (String(v) === "0") return 0;
  return "";
}

function normalizeWellbeing(v) {
  var n = Number(v);
  if (isNaN(n)) return "";
  if (n < 0) return 0;
  if (n > 10) return 10;
  return Math.round(n);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
