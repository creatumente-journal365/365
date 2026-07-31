import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SignedIn, SignedOut, useAuth, useUser, UserButton } from "@clerk/tanstack-start";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState, useCallback, useMemo } from "react";
import { sql } from "~/db/index";

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/** Fetch streak data for the current user. */
const getStreaksFn = createServerFn()
  .validator((data: unknown) => {
    const d = data as { userId: string };
    if (!d.userId) throw new Error("Invalid user ID");
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();
    const rows = await db`
      SELECT current_streak, longest_streak FROM streaks
      WHERE user_id = ${data.userId}
    `;
    if (rows.length === 0) {
      return { current_streak: 0, longest_streak: 0 };
    }
    return {
      current_streak: Number(rows[0].current_streak),
      longest_streak: Number(rows[0].longest_streak),
    };
  });

/** Fetch all entry calendar dates for a user in a given year. */
const getEntryDatesFn = createServerFn()
  .validator((data: unknown) => {
    const d = data as { userId: string; year: number };
    if (!d.userId || !d.year) throw new Error("Invalid data");
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();
    // Query by the day column (day-of-year), not created_at.
    // Day 1 = Jan 1. We compute the actual date in JS.
    const rows = await db`
      SELECT DISTINCT day
      FROM entries
      WHERE user_id = ${data.userId}
        AND day >= 1 AND day <= 365
      ORDER BY day
    `;
    const startOfYear = new Date(Date.UTC(data.year, 0, 1));
    return (rows as { day: number }[]).map((r) => {
      const d = new Date(startOfYear);
      d.setUTCDate(d.getUTCDate() + r.day - 1);
      return d.toISOString().slice(0, 10);
    });
  });

// ---------------------------------------------------------------------------
// Push notification server functions
// ---------------------------------------------------------------------------

/** Get the push subscription status for the current user. */
const getPushSubFn = createServerFn()
  .validator((data: unknown) => {
    const d = data as { userId: string };
    if (!d.userId) throw new Error("Invalid user ID");
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();
    const rows = await db`
      SELECT reminder_time FROM push_subscriptions
      WHERE user_id = ${data.userId}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return { reminder_time: String(rows[0].reminder_time) };
  });

/** Subscribe to push notifications. Upserts the subscription. */
const subscribePushFn = createServerFn()
  .validator((data: unknown) => {
    const d = data as {
      userId: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      reminder_time: string;
    };
    if (!d.userId || !d.endpoint || !d.p256dh || !d.auth || !d.reminder_time) {
      throw new Error("Invalid subscription data");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();
    await db`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, reminder_time)
      VALUES (${data.userId}, ${data.endpoint}, ${data.p256dh}, ${data.auth}, ${data.reminder_time})
      ON CONFLICT (user_id)
      DO UPDATE SET
        endpoint = ${data.endpoint},
        p256dh = ${data.p256dh},
        auth = ${data.auth},
        reminder_time = ${data.reminder_time},
        updated_at = now()
    `;
    return { success: true };
  });

/** Unsubscribe from push notifications. */
const unsubscribePushFn = createServerFn()
  .validator((data: unknown) => {
    const d = data as { userId: string };
    if (!d.userId) throw new Error("Invalid user ID");
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();
    await db`
      DELETE FROM push_subscriptions WHERE user_id = ${data.userId}
    `;
    return { success: true };
  });

/** Update only the reminder time. */
const updateReminderTimeFn = createServerFn()
  .validator((data: unknown) => {
    const d = data as { userId: string; reminder_time: string };
    if (!d.userId || !d.reminder_time) throw new Error("Invalid data");
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();
    await db`
      UPDATE push_subscriptions
      SET reminder_time = ${data.reminder_time}, updated_at = now()
      WHERE user_id = ${data.userId}
    `;
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Browser push notification helpers (client-side only)
// ---------------------------------------------------------------------------

const VAPID_PUBLIC_KEY =
  (typeof import.meta !== "undefined" &&
    (import.meta as Record<string, any>).env
      ?.VITE_VAPID_PUBLIC_KEY as string) ??
  "";

/** Register (or re-activate) the service worker and return the registration. */
async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (reg) return reg;
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Share / milestone helpers (client-side only)
// ---------------------------------------------------------------------------

const STREAK_MILESTONES = [7, 14, 21, 30, 60, 90, 100, 200, 365];

const LS_PREFIX = "j365_shared_milestone_";

function isMilestoneUnclaimed(streak: number): boolean {
  if (typeof window === "undefined") return false;
  if (!STREAK_MILESTONES.includes(streak)) return false;
  return localStorage.getItem(`${LS_PREFIX}${streak}`) !== "1";
}

function claimMilestone(streak: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${LS_PREFIX}${streak}`, "1");
}

function buildShareText(streak: number): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://journal365.com";
  return `I've journaled for ${streak} days straight with Journal 365 🔥\nOne thoughtful prompt every day — no blank pages.\n${origin}`;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#fefcf5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <SignedIn>
        <DashboardContent />
      </SignedIn>
      <SignedOut>
        <RedirectToHome />
      </SignedOut>
    </>
  );
}

function RedirectToHome() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/", replace: true });
  }, [navigate]);
  return null;
}

// ---------------------------------------------------------------------------
// Dashboard content
// ---------------------------------------------------------------------------

function DashboardContent() {
  const { user } = useUser();
  const userId = user?.id ?? "";

  const [streaks, setStreaks] = useState<{
    current_streak: number;
    longest_streak: number;
  } | null>(null);
  const [entryDates, setEntryDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const today = new Date();
        const year = today.getFullYear();
        const [s, dates] = await Promise.all([
          getStreaksFn({ data: { userId } }),
          getEntryDatesFn({ data: { userId, year } }),
        ]);
        setStreaks(s);
        setEntryDates(dates);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // Determine if current streak hits an unclaimed milestone
  const currentStreak = streaks?.current_streak ?? 0;
  const showShareStreak = useMemo(
    () => currentStreak > 0 && isMilestoneUnclaimed(currentStreak),
    [currentStreak],
  );

  const handleShareStreak = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildShareText(currentStreak));
      claimMilestone(currentStreak);
      setToast("Copied! Share it anywhere.");
    } catch {
      setToast("Could not copy. Try again.");
    }
  }, [currentStreak]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-dvh bg-[#fefcf5]">
      {/* App nav */}
      <header className="border-b border-[#3d3929]/10 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <img
                src="/logo-wordmark.png"
                alt="Journal 365"
                className="h-6 w-auto"
              />
            </Link>
            <nav className="hidden sm:flex items-center gap-4">
              <Link
                to="/app"
                className="font-sans text-sm font-medium text-[#c88c32]"
              >
                Dashboard
              </Link>
              <Link
                to="/app/write"
                className="font-sans text-sm font-medium text-[#6b6757] transition-colors hover:text-[#c88c32]"
              >
                Write
              </Link>
            </nav>
          </div>
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  avatarBox:
                    "h-9 w-9 rounded-full ring-2 ring-[#c88c32]/30 hover:ring-[#c88c32]/60 transition-all",
                },
              }}
            />
          </SignedIn>
        </div>
      </header>

      {/* Dashboard content */}
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-serif text-4xl font-bold tracking-tight text-[#3d3929]">
          Welcome to Journal 365
        </h1>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {/* Current Streak card */}
          <div className="rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm">
            <p className="font-sans text-xs font-medium uppercase tracking-widest text-[#c88c32]">
              Current Streak
            </p>
            {loading ? (
              <div className="mt-4 flex items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
                <span className="text-sm text-[#6b6757]">Loading…</span>
              </div>
            ) : error ? (
              <div className="mt-4">
                <span className="font-serif text-5xl font-bold text-[#3d3929]">
                  —
                </span>
                <p className="mt-2 text-sm text-red-500">Could not load streak</p>
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-serif text-5xl font-bold text-[#3d3929]">
                    {streaks?.current_streak ?? 0}
                  </span>
                  <span className="font-serif text-lg text-[#6b6757]">
                    day{(streaks?.current_streak ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#6b6757]">
                  {(streaks?.current_streak ?? 0) > 0
                    ? "Keep it going! You're building a habit."
                    : "Start your streak today!"}
                </p>
              </>
            )}
          </div>

          {/* Longest Streak card */}
          <div className="rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm">
            <p className="font-sans text-xs font-medium uppercase tracking-widest text-[#c88c32]">
              Longest Streak
            </p>
            {loading ? (
              <div className="mt-4 flex items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
                <span className="text-sm text-[#6b6757]">Loading…</span>
              </div>
            ) : error ? (
              <div className="mt-4">
                <span className="font-serif text-5xl font-bold text-[#3d3929]">
                  —
                </span>
                <p className="mt-2 text-sm text-red-500">Could not load data</p>
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-serif text-5xl font-bold text-[#3d3929]">
                    {streaks?.longest_streak ?? 0}
                  </span>
                  <span className="font-serif text-lg text-[#6b6757]">
                    day{(streaks?.longest_streak ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#6b6757]">
                  {(streaks?.longest_streak ?? 0) > 0
                    ? "Your personal best — can you beat it?"
                    : "Your longest streak will appear here."}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Share streak milestone button */}
        {showShareStreak && !loading && !error && (
          <div className="mt-6">
            <button
              type="button"
              onClick={handleShareStreak}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-[#d4a02c] bg-gradient-to-br from-amber-50 to-yellow-100 px-6 py-4 font-sans text-sm font-semibold text-[#8b6914] shadow-md transition-all hover:from-amber-100 hover:to-yellow-200 hover:shadow-lg active:scale-[0.98]"
            >
              <span className="text-xl" aria-hidden="true">
                🔥
              </span>
              Share my {currentStreak}-day streak
              <span className="text-lg" aria-hidden="true">
                📋
              </span>
            </button>
            <p className="mt-2 font-sans text-xs text-[#6b6757]">
              Copy your streak to clipboard and share it anywhere.
            </p>
          </div>
        )}

        {/* Calendar heatmap */}
        <div className="mt-12">
          <CalendarHeatmap
            entryDates={entryDates}
            loading={loading}
          />
        </div>

        {/* Notification settings */}
        <div className="mt-12">
          <NotificationSettings userId={userId} />
        </div>

        {/* Quick start section */}
        <div className="mt-12 rounded-xl border border-dashed border-[#c88c32]/30 bg-[#f0d78c]/10 p-8 text-center">
          <h2 className="font-serif text-2xl font-semibold text-[#3d3929]">
            Ready to write?
          </h2>
          <p className="mt-2 text-[#6b6757]">
            Open today&apos;s prompt and start journaling. Your words save
            automatically as you type.
          </p>
          <Link
            to="/app/write"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#c88c32] px-8 py-3 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f] hover:shadow-md"
          >
            Write Today&apos;s Entry
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in rounded-full bg-[#3d3929] px-5 py-2.5 font-sans text-sm font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar heatmap component
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Number of days in a given month (year-aware for February). */
function daysInMonth(year: number, month: number): number {
  // month is 0-indexed
  return new Date(year, month + 1, 0).getDate();
}

function CalendarHeatmap({
  entryDates,
  loading,
}: {
  entryDates: string[];
  loading: boolean;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  const dateSet = new Set(entryDates);

  // Count written days this year
  const totalWritten = entryDates.length;
  // Days elapsed so far this year (including today)
  const startOfYear = new Date(year, 0, 1);
  const daysElapsed = Math.floor(
    (today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24),
  ) + 1;

  if (loading) {
    return (
      <div className="rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm">
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm">
      <p className="font-sans text-xs font-medium uppercase tracking-widest text-[#c88c32]">
        Journal Activity
      </p>

      {/* Month grid — show Jan through current month */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {MONTH_NAMES.map((name, monthIdx) => {
          // Only show months up to current month
          if (monthIdx > currentMonth) return null;

          const totalDays = daysInMonth(year, monthIdx);
          // For current month, only show days up to today
          const visibleDays =
            monthIdx === currentMonth ? today.getDate() : totalDays;

          return (
            <div key={name}>
              <p className="mb-1.5 font-sans text-xs font-medium text-[#6b6757]">
                {name}
              </p>
              <div className="flex flex-wrap gap-[3px]">
                {Array.from({ length: visibleDays }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const hasEntry = dateSet.has(dateStr);

                  return (
                    <div
                      key={dateStr}
                      title={
                        hasEntry
                          ? `${name} ${day} — You wrote!`
                          : `${name} ${day} — No entry`
                      }
                      className={`h-[14px] w-[14px] rounded-sm transition-colors ${
                        hasEntry
                          ? "bg-[#c88c32] shadow-sm"
                          : "bg-[#e8e4da]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-5 flex items-center gap-4 border-t border-[#3d3929]/5 pt-4">
        <div className="flex items-center gap-2">
          <div className="h-[14px] w-[14px] rounded-sm bg-[#c88c32]" />
          <span className="font-sans text-xs text-[#6b6757]">Wrote</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-[14px] w-[14px] rounded-sm bg-[#e8e4da]" />
          <span className="font-sans text-xs text-[#6b6757]">No entry</span>
        </div>
        <div className="ml-auto">
          <span className="font-sans text-xs text-[#6b6757]">
            You wrote on{" "}
            <span className="font-semibold text-[#3d3929]">{totalWritten}</span>{" "}
            of{" "}
            <span className="font-semibold text-[#3d3929]">{daysElapsed}</span>{" "}
            days this year
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification settings component
// ---------------------------------------------------------------------------

const REMINDER_HOURS = [
  "06:00", "07:00", "08:00", "09:00", "10:00",
  "12:00", "14:00", "16:00", "18:00", "20:00", "21:00", "22:00",
];

// Journal 365 is based in Ecuador (GMT-5). All reminder times are
// stored in UTC and displayed in GMT-5 so the picker always shows local time.
const TZ_OFFSET_HOURS = -5;

// Convert "HH:MM" from UTC to GMT-5 local time
function utcToLocal(utcTime: string): string {
  const [h, m] = utcTime.split(":").map(Number);
  let localH = h + TZ_OFFSET_HOURS;
  if (localH < 0) localH += 24;
  if (localH >= 24) localH -= 24;
  return `${localH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// Convert "HH:MM" from GMT-5 local time to UTC
function localToUtc(localTime: string): string {
  const [h, m] = localTime.split(":").map(Number);
  let utcH = h - TZ_OFFSET_HOURS;
  if (utcH >= 24) utcH -= 24;
  if (utcH < 0) utcH += 24;
  return `${utcH.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function NotificationSettings({ userId }: { userId: string }) {
  const [status, setStatus] = useState<
    "loading" | "unsupported" | "disabled" | "enabled"
  >("loading");
  const [reminderTime, setReminderTime] = useState("08:00");
  const [saving, setSaving] = useState(false);
  const [browserPermission, setBrowserPermission] =
    useState<NotificationPermission>("default");

  // Check current state on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if browser supports notifications
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }

    setBrowserPermission(Notification.permission);

    if (!userId) return;

    (async () => {
      try {
        const sub = await getPushSubFn({ data: { userId } });
        if (sub) {
          setStatus("enabled");
          setReminderTime(utcToLocal(sub.reminder_time));
        } else {
          setStatus("disabled");
        }
      } catch (err) {
        console.error("Failed to load notification status:", err);
        setStatus("disabled");
      }
    })();
  }, [userId]);

  // Enable notifications
  const handleEnable = useCallback(async () => {
    if (!userId || !VAPID_PUBLIC_KEY) return;
    setSaving(true);

    try {
      // Request browser permission
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);

      if (permission !== "granted") {
        setSaving(false);
        return;
      }

      // Register service worker
      const swReg = await getSWRegistration();
      if (!swReg) {
        console.error("Could not register service worker");
        setSaving(false);
        return;
      }

      // Wait for SW to be ready
      await navigator.serviceWorker.ready;

      // Get push subscription
      let pushSub = await swReg.pushManager.getSubscription();
      if (!pushSub) {
        pushSub = await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const rawSub = pushSub.toJSON();
      const endpoint = rawSub.endpoint ?? "";
      const p256dh = (rawSub.keys as Record<string, string>)?.p256dh ?? "";
      const auth = (rawSub.keys as Record<string, string>)?.auth ?? "";

      await subscribePushFn({
        data: {
          userId,
          endpoint,
          p256dh,
          auth,
          reminder_time: localToUtc(reminderTime),
        },
      });

      setStatus("enabled");
    } catch (err) {
      console.error("Failed to enable notifications:", err);
    } finally {
      setSaving(false);
    }
  }, [userId, reminderTime]);

  // Disable notifications
  const handleDisable = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    try {
      // Unsubscribe from push manager
      const swReg = await getSWRegistration();
      if (swReg) {
        const pushSub = await swReg.pushManager.getSubscription();
        if (pushSub) await pushSub.unsubscribe();
      }

      // Remove from DB
      await unsubscribePushFn({ data: { userId } });
      setStatus("disabled");
    } catch (err) {
      console.error("Failed to disable notifications:", err);
    } finally {
      setSaving(false);
    }
  }, [userId]);

  // Update reminder time
  const handleTimeChange = useCallback(
    async (newTime: string) => {
      setReminderTime(newTime);
      if (!userId || status !== "enabled") return;
      setSaving(true);
      try {
        await updateReminderTimeFn({
          data: { userId, reminder_time: localToUtc(newTime) },
        });
      } catch (err) {
        console.error("Failed to update reminder time:", err);
      } finally {
        setSaving(false);
      }
    },
    [userId, status],
  );

  return (
    <div className="rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm">
      <p className="font-sans text-xs font-medium uppercase tracking-widest text-[#c88c32]">
        Daily Reminders
      </p>

      {status === "loading" ? (
        <div className="mt-4 flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
          <span className="text-sm text-[#6b6757]">Loading…</span>
        </div>
      ) : status === "unsupported" ? (
        <div className="mt-4">
          <p className="text-sm text-[#6b6757]">
            <span className="inline-block mr-1.5 text-base">🔕</span>
            Browser notifications are not supported in your current browser.
            Try Chrome, Edge, or Firefox on desktop or Android.
          </p>
        </div>
      ) : status === "enabled" ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-[#3d3929]">
              Notifications enabled
            </span>
          </div>

          {/* Reminder time picker */}
          <div className="flex items-center gap-3">
            <label
              htmlFor="reminder-time"
              className="text-sm text-[#6b6757] shrink-0"
            >
              Reminder at (your time):
            </label>
            <select
              id="reminder-time"
              value={reminderTime}
              onChange={(e) => handleTimeChange(e.target.value)}
              disabled={saving}
              className="rounded-lg border border-[#3d3929]/15 bg-white px-3 py-1.5 text-sm text-[#3d3929] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/30"
            >
              {REMINDER_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span className="text-xs text-[#6b6757]">GMT-5</span>
          </div>

          {/* Disable button */}
          <button
            type="button"
            onClick={handleDisable}
            disabled={saving}
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {saving ? "Updating…" : "Disable Notifications"}
          </button>
        </div>
      ) : (
        /* status === "disabled" */
        <div className="mt-4 space-y-4">
          {browserPermission === "denied" ? (
            <div>
              <p className="text-sm text-[#6b6757]">
                <span className="inline-block mr-1.5 text-base">🚫</span>
                Notifications are blocked in your browser settings. To enable
                them, update your site permissions for this page.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#6b6757]">
                Get a daily browser notification to remind you to write in your
                journal. Never miss a day.
              </p>

              {/* Reminder time picker (visible before enabling too) */}
              <div className="flex items-center gap-3">
                <label
                  htmlFor="reminder-time-disabled"
                  className="text-sm text-[#6b6757] shrink-0"
                >
                  Reminder at:
                </label>
                <select
                  id="reminder-time-disabled"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  disabled={saving}
                  className="rounded-lg border border-[#3d3929]/15 bg-white px-3 py-1.5 text-sm text-[#3d3929] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/30"
                >
                  {REMINDER_HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[#6b6757]">GMT-5</span>
              </div>

              <button
                type="button"
                onClick={handleEnable}
                disabled={saving || !VAPID_PUBLIC_KEY}
                className="inline-flex items-center gap-2 rounded-full bg-[#c88c32] px-6 py-2.5 font-sans text-sm font-semibold text-white transition-all hover:bg-[#a6731f] disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Enabling…
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">🔔</span>
                    Enable Daily Reminder
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility: convert base64url VAPID key to Uint8Array
// ---------------------------------------------------------------------------

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
