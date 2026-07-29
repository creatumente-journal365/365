import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  SignedIn,
  SignedOut,
  useAuth,
  useUser,
  UserButton,
} from "@clerk/tanstack-start";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState, useRef, useCallback } from "react";
import { sql } from "~/db/index";
import prompts from "~/data/prompts.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute today's day-of-year (1–365), wrapping for leap years. */
function getTodayDay(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return ((dayOfYear - 1) % 365) + 1;
}

function getTodayPrompt(): { day: number; prompt: string; theme: string } {
  const day = getTodayDay();
  return (
    prompts.find((p: { day: number }) => p.day === day) ?? {
      day,
      prompt: "What's on your mind today?",
      theme: "reflection",
    }
  );
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const saveEntryFn = createServerFn()
  .validator((data: unknown) => {
    const d = data as { userId: string; day: number; content: string };
    if (!d.userId || typeof d.day !== "number" || typeof d.content !== "string")
      throw new Error("Invalid entry data");
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();
    await db`
      INSERT INTO entries (user_id, day, content)
      VALUES (${data.userId}, ${data.day}, ${data.content})
      ON CONFLICT (user_id, day)
      DO UPDATE SET content = ${data.content}, updated_at = now()
    `;
    return { success: true };
  });

const loadEntryFn = createServerFn()
  .validator((data: unknown) => {
    const d = data as { userId: string; day: number };
    if (!d.userId || typeof d.day !== "number")
      throw new Error("Invalid load data");
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();
    const rows = await db`
      SELECT content FROM entries
      WHERE user_id = ${data.userId} AND day = ${data.day}
    `;
    return rows.length > 0 ? String(rows[0].content) : "";
  });

/**
 * Recompute and persist streak data after an entry is saved.
 * Fetches all distinct calendar dates for the user from the entries table,
 * computes the current streak (consecutive days ending today or yesterday)
 * and longest streak ever, then upserts the streaks table.
 */
const updateStreakFn = createServerFn()
  .validator((data: unknown) => {
    const d = data as { userId: string };
    if (!d.userId) throw new Error("Invalid user ID");
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();

    // Fetch all distinct calendar dates for this user
    const rows = await db`
      SELECT DISTINCT created_at::date AS entry_date
      FROM entries
      WHERE user_id = ${data.userId}
      ORDER BY entry_date DESC
    `;

    const dateSet = new Set<string>();
    for (const r of rows as { entry_date: string }[]) {
      const d = typeof r.entry_date === "string" ? r.entry_date : String(r.entry_date);
      dateSet.add(d.slice(0, 10));
    }

    // --- Compute current streak ---
    // Count consecutive days ending today or yesterday
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check today first, then walk backwards
    const checkDate = new Date(today);
    // If today has no entry, try starting from yesterday
    let started = false;

    for (let i = 0; i < 366; i++) {
      const dateStr = checkDate.toISOString().split("T")[0];
      if (dateSet.has(dateStr)) {
        currentStreak++;
        started = true;
      } else if (started) {
        // Streak broken
        break;
      }
      // If we haven't started yet (i === 0 and no entry today),
      // try yesterday on the next iteration
      checkDate.setDate(checkDate.getDate() - 1);
      if (!started && i >= 1) break; // gave up after checking yesterday
    }

    // --- Compute longest streak ---
    let longestStreak = 0;
    if (dateSet.size > 0) {
      const sortedDates = [...dateSet].sort();
      let runLength = 1;
      longestStreak = 1;

      for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1] + "T00:00:00");
        const curr = new Date(sortedDates[i] + "T00:00:00");
        const diffDays =
          (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays === 1) {
          runLength++;
          longestStreak = Math.max(longestStreak, runLength);
        } else {
          runLength = 1;
        }
      }
    }

    // --- Persist streak ---
    const todayStr = today.toISOString().split("T")[0];
    await db`
      INSERT INTO streaks (user_id, current_streak, longest_streak, last_entry_date)
      VALUES (${data.userId}, ${currentStreak}, ${longestStreak}, ${todayStr}::date)
      ON CONFLICT (user_id)
      DO UPDATE SET
        current_streak = ${currentStreak},
        longest_streak = GREATEST(streaks.longest_streak, ${longestStreak}),
        last_entry_date = ${todayStr}::date
    `;

    return { current_streak: currentStreak, longest_streak: longestStreak };
  });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/app/write")({
  component: WritePage,
});

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function WritePage() {
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
        <WriteContent />
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

function WriteContent() {
  const { user } = useUser();

  const today = getTodayDay();
  const todayPrompt = getTodayPrompt();

  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [loading, setLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = user?.id ?? "";

  // Load existing entry on mount
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const existing = await loadEntryFn({ data: { userId, day: today } });
        setContent(existing);
      } catch (err) {
        console.error("Failed to load entry:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, today]);

  // Auto-save with debounce
  const saveContent = useCallback(
    (text: string) => {
      if (!userId) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);

      setSaveStatus("saving");

      debounceRef.current = setTimeout(async () => {
        try {
          await saveEntryFn({
            data: { userId, day: today, content: text },
          });
          // Update streaks after successful save
          updateStreakFn({ data: { userId } }).catch((err) =>
            console.error("Streak update failed:", err),
          );
          setSaveStatus("saved");
          // Fade back to idle after 2 s
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (err) {
          console.error("Auto-save failed:", err);
          setSaveStatus("error");
        }
      }, 2000); // 2-second debounce
    },
    [userId, today],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setContent(next);
    saveContent(next);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="min-h-dvh bg-[#fefcf5]">
      {/* Header */}
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
                className="font-sans text-sm font-medium text-[#6b6757] transition-colors hover:text-[#c88c32]"
              >
                Dashboard
              </Link>
              <Link
                to="/app/write"
                className="font-sans text-sm font-medium text-[#c88c32]"
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

      {/* Main writing area */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Prompt card */}
            <div className="mb-10 rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="font-sans text-xs font-medium uppercase tracking-widest text-[#c88c32]">
                  Day {todayPrompt.day} &middot; {todayPrompt.theme}
                </p>
                {/* Save indicator */}
                <SaveIndicator status={saveStatus} />
              </div>
              <h1 className="mt-3 font-serif text-2xl font-semibold italic leading-relaxed text-[#3d3929]">
                &ldquo;{todayPrompt.prompt}&rdquo;
              </h1>
            </div>

            {/* Writing area */}
            <div className="rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm">
              <textarea
                value={content}
                onChange={handleChange}
                placeholder="Start writing your thoughts here..."
                className="min-h-[420px] w-full resize-y rounded-lg border-0 bg-transparent p-0 font-serif text-lg leading-relaxed text-[#3d3929] placeholder:text-[#6b6757]/40 focus:outline-none focus:ring-0"
                autoFocus
              />
              <div className="mt-4 flex items-center justify-between border-t border-[#3d3929]/5 pt-4">
                <span className="font-sans text-xs text-[#6b6757]">
                  {content.length > 0
                    ? `${content.length} character${content.length === 1 ? "" : "s"}`
                    : "Begin writing — your words save automatically"}
                </span>
                <Link
                  to="/app"
                  className="font-sans text-sm font-medium text-[#c88c32] transition-colors hover:text-[#a6731f]"
                >
                  &larr; Back to Dashboard
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** Subtle save-status indicator pill */
function SaveIndicator({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return null;

  const config: Record<
    string,
    { bg: string; text: string; label: string; dot?: boolean }
  > = {
    saving: {
      bg: "bg-[#f0d78c]/30",
      text: "text-[#c88c32]",
      label: "Saving…",
    },
    saved: {
      bg: "bg-green-50",
      text: "text-green-600",
      label: "Saved",
    },
    error: {
      bg: "bg-red-50",
      text: "text-red-500",
      label: "Save failed",
    },
  };

  const c = config[status] ?? config.saved;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-sans text-xs font-medium transition-opacity duration-300 ${c.bg} ${c.text}`}
      role="status"
      aria-live="polite"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {c.label}
    </span>
  );
}
