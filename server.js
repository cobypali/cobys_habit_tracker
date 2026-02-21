const express = require("express");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const webpush = require("web-push");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);
const timezone = process.env.TIMEZONE || "America/Los_Angeles";
const subscriptionsPath = path.join(__dirname, "data", "subscriptions.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

ensureDataFile();
configureWebPush();
scheduleDailyPushes();

app.get("/api/config", (req, res) => {
  res.json({
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
    timezone
  });
});

app.post("/api/subscribe", (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Invalid push subscription payload." });
  }

  const subscriptions = readSubscriptions();
  const exists = subscriptions.some((entry) => entry.endpoint === subscription.endpoint);
  if (!exists) {
    subscriptions.push(subscription);
    writeSubscriptions(subscriptions);
  }

  return res.json({ ok: true });
});

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

function ensureDataFile() {
  const dir = path.dirname(subscriptionsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(subscriptionsPath)) {
    fs.writeFileSync(subscriptionsPath, "[]", "utf8");
  }
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.warn("VAPID env vars missing. Push sending is disabled until configured.");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function scheduleDailyPushes() {
  cron.schedule(
    "0 8 * * *",
    async () => {
      await sendPushToAll({
        title: "8:00 AM Habit Check-In",
        body: "Wake up, sleep, meditate, workout.",
        section: "morning"
      });
    },
    { timezone }
  );

  cron.schedule(
    "30 21 * * *",
    async () => {
      await sendPushToAll({
        title: "9:30 PM Habit Check-In",
        body: "Daily work, boundaries, wellbeing, and notes.",
        section: "daily"
      });
    },
    { timezone }
  );
}

async function sendPushToAll(payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return;
  }

  const subscriptions = readSubscriptions();
  if (!subscriptions.length) {
    return;
  }

  const deadEndpoints = [];
  const message = JSON.stringify(payload);

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, message);
    } catch (error) {
      if (error && error.statusCode === 410) {
        deadEndpoints.push(subscription.endpoint);
      }
      console.error("Push send failed:", error.message);
    }
  }

  if (deadEndpoints.length) {
    const live = subscriptions.filter((entry) => !deadEndpoints.includes(entry.endpoint));
    writeSubscriptions(live);
  }
}

function readSubscriptions() {
  try {
    const raw = fs.readFileSync(subscriptionsPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSubscriptions(value) {
  fs.writeFileSync(subscriptionsPath, JSON.stringify(value, null, 2), "utf8");
}

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
