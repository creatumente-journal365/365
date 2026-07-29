/**
 * Notification scheduler — checks for push subscriptions whose reminder
 * time has arrived and sends web-push notifications to them.
 *
 * For the MVP, uses setInterval every 60s. Runs in the server process.
 */
import webpush from "web-push";
import { sql } from "../db/index";

const VAPID_SUBJECT = "mailto:hello@journal365.com";

let intervalId: ReturnType<typeof setInterval> | null = null;

function getVapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured");
  }
  return { publicKey, privateKey };
}

/**
 * Send a push notification to a single subscription record.
 */
async function sendNotification(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify({
        title: "Journal 365",
        body: "Time to write! Today's prompt is waiting.",
        url: "/app/write",
      }),
    );
  } catch (err: any) {
    // If the subscription is expired or invalid (410/404), log and move on.
    // The subscription will be cleaned up on the next subscribe attempt.
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.warn(`Push subscription expired for endpoint ${sub.endpoint}`);
    } else {
      console.error("Failed to send push notification:", err);
    }
  }
}

/**
 * Check for subscriptions whose reminder time matches the current time
 * (checked every 60 seconds, so a 1-minute window is fine).
 */
async function checkAndSendReminders() {
  const now = new Date();
  const timeStr = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

  try {
    const db = sql();
    const rows = (await db`
      SELECT endpoint, p256dh, auth FROM push_subscriptions
      WHERE reminder_time = ${timeStr}
    `) as { endpoint: string; p256dh: string; auth: string }[];

    if (rows.length > 0) {
      console.log(
        `Sending ${rows.length} push notification(s) for reminder time ${timeStr}`,
      );
    }

    for (const sub of rows) {
      await sendNotification(sub);
    }
  } catch (err) {
    // DB might not be connected yet — skip this cycle quietly
    if (
      err instanceof Error &&
      err.message.includes("NEON_DATABASE_URL is not set")
    ) {
      return;
    }
    console.error("Notification scheduler error:", err);
  }
}

/**
 * Start the notification scheduler. Safe to call multiple times.
 */
export function startNotificationScheduler() {
  if (intervalId) return; // Already running

  const keys = getVapidKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);
  console.log("Push notification scheduler started (VAPID configured).");

  // Run immediately on start, then every 60 seconds
  checkAndSendReminders().catch(() => {});
  intervalId = setInterval(() => {
    checkAndSendReminders().catch(() => {});
  }, 60_000);
}

/**
 * Stop the notification scheduler.
 */
export function stopNotificationScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("Push notification scheduler stopped.");
  }
}
