const ONE_SIGNAL_API_URL = "https://api.onesignal.com/notifications";
const { randomUUID } = require("crypto");
const TIMEZONE = process.env.TIMEZONE || "America/Los_Angeles";
const FORCE_SEND =
  String(process.env.FORCE_SEND || "").toLowerCase() === "true" ||
  String(process.env.GITHUB_EVENT_NAME || "").toLowerCase() === "workflow_dispatch";

const APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const REST_API_KEY = String(process.env.ONESIGNAL_REST_API_KEY || "").trim();

const REMINDERS = [
  {
    time: "08:00",
    title: "8:00 AM Habit Check-In",
    body: "Open your habit tracker and complete your morning habits."
  },
  {
    time: "21:30",
    title: "9:30 PM Habit Check-In",
    body: "Open your habit tracker and complete your evening review."
  }
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  if (!APP_ID || !REST_API_KEY) {
    throw new Error("Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY.");
  }

  const now = getNowInTimeZone(TIMEZONE);
  const timeKey = now.hh + ":" + now.mm;

  if (FORCE_SEND) {
    await sendPayload(
      {
        app_id: APP_ID,
        included_segments: ["Subscribed Users"],
        headings: { en: "Instant Test Notification" },
        contents: { en: "This is a manual push test from GitHub Actions." },
        is_any_web: true,
        idempotency_key: randomUUID()
      },
      "instant-test",
      now.isoLocal
    );
    return;
  }

  const reminder = REMINDERS.find((entry) => entry.time === timeKey);
  if (!reminder) {
    console.log("No reminder scheduled for this run:", now.isoLocal);
    return;
  }

  const payload = {
    app_id: APP_ID,
    included_segments: ["Subscribed Users"],
    headings: { en: reminder.title },
    contents: { en: reminder.body },
    is_any_web: true,
    idempotency_key: randomUUID()
  };

  await sendPayload(payload, reminder.time, now.isoLocal);
}

async function sendPayload(payload, label, isoLocal) {
  const response = await fetch(ONE_SIGNAL_API_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + REST_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error("OneSignal send failed (" + response.status + "): " + raw);
  }

  console.log("Reminder sent:", label, isoLocal);
  console.log(raw);
}

function getNowInTimeZone(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);

  const map = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const ymd = map.year + "-" + map.month + "-" + map.day;
  const isoLocal = ymd + "T" + map.hour + ":" + map.minute + ":" + map.second;

  return {
    ymd,
    hh: map.hour,
    mm: map.minute,
    isoLocal
  };
}
