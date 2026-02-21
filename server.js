const express = require("express");
const path = require("path");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/log-day", async (req, res) => {
  try {
    const payload = req.body || {};
    const row = buildRow(payload);
    await appendToSheet(row);
    return res.json({ ok: true });
  } catch (error) {
    console.error("Failed to append row:", error.message);
    return res.status(500).json({ error: "Failed to write to Google Sheet." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Habit tracker running on http://localhost:${port}`);
});

function buildRow(payload) {
  const toBinary = (value) => {
    if (value === 1 || value === "1" || value === true) return 1;
    return 0;
  };

  const wellbeingRaw = Number(payload.wellbeing);
  const wellbeing = Number.isFinite(wellbeingRaw) ? wellbeingRaw : "";

  return [
    new Date().toISOString(),
    toBinary(payload.wakeUpAt8),
    toBinary(payload.sleep75Hours),
    toBinary(payload.meditate),
    toBinary(payload.workout),
    toBinary(payload.workOnStudio),
    toBinary(payload.consumeDrugs),
    toBinary(payload.socialLimits),
    toBinary(payload.stretch),
    toBinary(payload.hairCare),
    toBinary(payload.gratitudePrayer),
    wellbeing,
    String(payload.notes || "").trim()
  ];
}

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error("Google service account env vars are not configured.");
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return google.sheets({ version: "v4", auth });
}

async function appendToSheet(row) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE || "Sheet1!A:N";

  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID.");
  }

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row]
    }
  });
}
