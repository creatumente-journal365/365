import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SignedIn, SignedOut, useAuth, useUser, UserButton } from "@clerk/tanstack-start";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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
    const rows = await db`
      SELECT DISTINCT created_at::date AS entry_date
      FROM entries
      WHERE user_id = ${data.userId}
        AND created_at >= ${`${data.year}-01-01`}::date
        AND created_at < ${`${data.year + 1}-01-01`}::date
      ORDER BY entry_date
    `;
    return rows.map((r: { entry_date: string }) => {
      // neon returns dates as strings like "2026-07-28"
      const d = typeof r.entry_date === "string" ? r.entry_date : String(r.entry_date);
      return d.slice(0, 10);
    });
  });

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

        {/* Calendar heatmap */}
        <div className="mt-12">
          <CalendarHeatmap
            entryDates={entryDates}
            loading={loading}
          />
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
