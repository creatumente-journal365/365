/**
 * API endpoint: GET /api/send-reminders
 *
 * Sends push notifications to all users whose reminder_time matches
 * the current UTC hour+minute. Designed to be called by an external cron
 * service (e.g. Vercel Cron, GitHub Actions).
 *
 * The in-process scheduler (src/notifications/scheduler.ts) also handles
 * this continuously, but this endpoint provides a cron-friendly alternative
 * for hosted environments where long-running setInterval isn't reliable.
 *
 * Wired into serve.ts which intercepts GET /api/send-reminders and calls
 * the exported handler directly.
 */
import webpush from "web-push";
import { sql } from "~/db/index";

const VAPID_SUBJECT = "mailto:hello@journal365.com";

export interface SendRemindersResult {
  sent: number;
  errors: number;
  time: string;
  total: number;
  message?: string;
}

/**
 * Send push notifications to all subscriptions whose reminder_time
 * matches the current UTC time. Returns a summary.
 */
export async function handleSendReminders(): Promise<SendRemindersResult> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return {
      sent: 0,
      errors: 0,
      time: "",
      total: 0,
      message: "VAPID keys not configured",
    };
  }

  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);

  const now = new Date();
  const timeStr = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

  let subscriptions: {
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  try {
    const db = sql();
    subscriptions = (await db`
      SELECT endpoint, p256dh, auth FROM push_subscriptions
      WHERE reminder_time = ${timeStr}
    `) as { endpoint: string; p256dh: string; auth: string }[];
  } catch (err) {
    console.error("Failed to query push_subscriptions:", err);
    return {
      sent: 0,
      errors: 0,
      time: timeStr,
      total: 0,
      message: "Database query failed",
    };
  }

  let sent = 0;
  let errors = 0;

  for (const sub of subscriptions) {
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
      sent++;
    } catch (err: any) {
      errors++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.warn(
          `Push subscription expired for endpoint ${sub.endpoint}`,
        );
      } else {
        console.error("Failed to send push notification:", err);
      }
    }
  }

  console.log(
    `send-reminders: sent ${sent}, errors ${errors} (${subscriptions.length} subscriptions for ${timeStr})`,
  );

  return {
    sent,
    errors,
    time: timeStr,
    total: subscriptions.length,
  };
}
