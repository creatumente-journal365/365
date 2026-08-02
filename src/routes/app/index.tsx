import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  SignedIn,
  SignedOut,
  useUser,
  UserButton,
} from "@clerk/tanstack-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { sql } from "~/db/index";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_WORDS = 500;
const GUEST_NAME_KEY = "cym_guest_name";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Prompt {
  id: number;
  day: string;
  prompt_text: string;
}

interface ResponseRow {
  id: number;
  author_name: string;
  content: string;
  word_count: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/** Today's prompt from the prompts table (UTC date, matching how seeds are anchored). */
const getTodayPrompt = createServerFn().handler(async () => {
  const db = sql();
  const rows = await db`
    SELECT id, day, prompt_text FROM prompts
    WHERE day = CURRENT_DATE
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0] as { id: number; day: unknown; prompt_text: unknown };
  return {
    id: Number(r.id),
    day: String(r.day),
    prompt_text: String(r.prompt_text),
  } satisfies Prompt;
});

/** All responses to a given prompt, newest first. */
const getResponses = createServerFn()
  .validator((data: unknown) => {
    const d = data as { promptId: number };
    if (!d || typeof d.promptId !== "number") throw new Error("Invalid prompt ID");
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();
    const rows = await db`
      SELECT id, author_name, content, word_count, created_at
      FROM responses
      WHERE prompt_id = ${data.promptId}
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      author_name: String(r.author_name ?? "Anonymous"),
      content: String(r.content),
      word_count: Number(r.word_count ?? 0),
      created_at: String(r.created_at),
    })) satisfies ResponseRow[];
  });

/** Post a response to today's prompt. Word-limited server-side too. */
const saveResponse = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as {
      promptId: number;
      userId: string;
      authorName: string;
      content: string;
    };
    if (!d || typeof d.promptId !== "number") throw new Error("Invalid prompt");
    const content = String(d.content ?? "").trim();
    if (!content) throw new Error("Write something before you share it.");
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (wordCount > MAX_WORDS) {
      throw new Error(`Keep it under ${MAX_WORDS} words — you have ${wordCount}.`);
    }
    const authorName =
      String(d.authorName ?? "").trim().slice(0, 60) || "Anonymous";
    const userId = String(d.userId ?? "guest").slice(0, 128);
    return { promptId: d.promptId, userId, authorName, content, wordCount };
  })
  .handler(async ({ data }) => {
    const db = sql();
    await db`
      INSERT INTO responses (prompt_id, user_id, author_name, content, word_count)
      VALUES (${data.promptId}, ${data.userId}, ${data.authorName}, ${data.content}, ${data.wordCount})
    `;
    return { success: true as const };
  });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/app/")({
  component: App,
});

function App() {
  return (
    <div className="min-h-dvh bg-[#fefcf5]">
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <TodayView />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#3d3929]/10 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <Link to="/" className="font-serif text-lg font-bold tracking-tight text-[#3d3929]">
          Create Your Mind
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="hidden font-sans text-sm font-medium text-[#6b6757] transition-colors hover:text-[#c88c32] sm:block"
          >
            Home
          </Link>
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  avatarBox:
                    "h-8 w-8 rounded-full ring-2 ring-[#c88c32]/30 hover:ring-[#c88c32]/60 transition-all",
                },
              }}
            />
          </SignedIn>
          <SignedOut>
            <span className="rounded-full border border-[#c88c32]/30 bg-[#f0d78c]/20 px-3 py-1 font-sans text-xs font-medium text-[#c88c32]">
              Beta — no sign-up needed
            </span>
          </SignedOut>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Today's prompt + writing + responses
// ---------------------------------------------------------------------------

function TodayView() {
  const { user, isLoaded } = useUser();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [guestName, setGuestName] = useState<string>("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  // Stable guest identity for the session
  const guestIdRef = useRef<string | null>(null);
  if (guestIdRef.current === null) {
    guestIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `guest-${crypto.randomUUID().slice(0, 8)}`
        : `guest-${Math.random().toString(36).slice(2, 10)}`;
  }

  // Remember the guest display name across visits
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GUEST_NAME_KEY);
      if (saved) setGuestName(saved);
    } catch {
      // localStorage unavailable — fine
    }
  }, []);

  // Load prompt + responses on mount
  useEffect(() => {
    (async () => {
      try {
        const p = await getTodayPrompt();
        setPrompt(p);
        if (p) {
          const rs = await getResponses({ data: { promptId: p.id } });
          setResponses(rs);
        }
      } catch (err) {
        console.error("Failed to load today's prompt:", err);
        setLoadError(
          "Couldn't load today's prompt. If this keeps happening, tell us — we're still setting things up.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const overLimit = wordCount > MAX_WORDS;

  const signedInName = user
    ? user.firstName ||
      user.username ||
      user.emailAddresses?.[0]?.emailAddress ||
      ""
    : "";
  const displayName = user ? signedInName : guestName.trim();

  const handlePost = useCallback(async () => {
    if (!prompt) return;
    setPosting(true);
    setPostError(null);
    setPosted(false);
    try {
      const userId = user ? user.id : guestIdRef.current!;
      const authorName = user ? displayName || "Anonymous" : guestName.trim() || "Anonymous";
      await saveResponse({
        data: {
          promptId: prompt.id,
          userId,
          authorName,
          content,
        },
      });
      if (!user && guestName.trim()) {
        try {
          localStorage.setItem(GUEST_NAME_KEY, guestName.trim());
        } catch {
          // ignore
        }
      }
      setContent("");
      setPosted(true);
      // Refresh the day's responses
      const rs = await getResponses({ data: { promptId: prompt.id } });
      setResponses(rs);
      setTimeout(() => setPosted(false), 4000);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Couldn't post. Try again.");
    } finally {
      setPosting(false);
    }
  }, [prompt, user, displayName, guestName, content]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="font-serif text-lg text-red-800">{loadError}</p>
        <Link to="/" className="mt-4 inline-block font-sans text-sm font-medium text-red-600 underline underline-offset-2">
          Back to home
        </Link>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="rounded-xl border border-[#3d3929]/10 bg-white p-8 text-center">
        <p className="font-serif text-2xl font-semibold text-[#3d3929]">
          No prompt today — yet.
        </p>
        <p className="mt-3 text-[#6b6757]">
          Today&apos;s prompt hasn&apos;t been seeded. Check back soon, or tell the team
          so we can fix it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Prompt card */}
      <section className="rounded-2xl border border-[#3d3929]/10 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-[#c88c32]/30 bg-[#f0d78c]/20 px-3 py-1 font-sans text-xs font-medium uppercase tracking-widest text-[#c88c32]">
            Today&apos;s prompt
          </span>
          <span className="font-mono text-xs text-[#6b6757]/70">{prompt.day}</span>
        </div>
        <p className="mt-6 font-serif text-2xl leading-snug text-[#3d3929] sm:text-3xl">
          &ldquo;{prompt.prompt_text}&rdquo;
        </p>
        <p className="mt-4 text-sm text-[#6b6757]">
          Write a short response — up to {MAX_WORDS} words. Share it with the
          community, then read what everyone else made from the same starting point.
        </p>
      </section>

      {/* Write card */}
      <section className="rounded-2xl border border-[#3d3929]/10 bg-white p-8 shadow-sm sm:p-10">
        <h2 className="font-serif text-xl font-semibold text-[#3d3929]">Your response</h2>

        {/* Identity row */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SignedOut>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={60}
              placeholder="Your name (optional — shows on your piece)"
              className="w-full rounded-lg border border-[#3d3929]/15 bg-white px-3 py-2 font-sans text-sm text-[#3d3929] placeholder:text-[#6b6757]/50 focus:border-[#c88c32] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/20 sm:w-72"
            />
          </SignedOut>
          <SignedIn>
            <span className="font-sans text-sm text-[#6b6757]">
              Writing as{" "}
              <span className="font-semibold text-[#3d3929]">
                {displayName || "you"}
              </span>
            </span>
          </SignedIn>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          maxLength={4000}
          placeholder="Take it anywhere. Strange, tender, funny, unfinished — all welcome."
          className="mt-4 w-full resize-y rounded-lg border border-[#3d3929]/15 bg-[#fefcf5] px-4 py-3.5 font-serif text-base leading-relaxed text-[#3d3929] placeholder:text-[#6b6757]/40 focus:border-[#c88c32] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/20"
        />

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span
            className={`font-sans text-xs ${
              overLimit ? "font-semibold text-red-600" : "text-[#6b6757]"
            }`}
          >
            {wordCount} / {MAX_WORDS} words
          </span>
          <button
            type="button"
            onClick={handlePost}
            disabled={posting || !content.trim() || overLimit}
            className="inline-flex items-center gap-2 rounded-full bg-[#c88c32] px-6 py-3 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {posting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Posting…
              </>
            ) : (
              "Share your piece"
            )}
          </button>
        </div>

        {postError && <p className="mt-3 font-sans text-sm text-red-600">{postError}</p>}
        {posted && (
          <p className="mt-3 font-sans text-sm font-medium text-green-700">
            Posted! You&apos;re part of today&apos;s conversation.
          </p>
        )}
      </section>

      {/* Responses */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-[#3d3929]">
            Today&apos;s responses
          </h2>
          <span className="rounded-full bg-[#f0d78c]/30 px-3 py-1 font-sans text-xs font-medium text-[#8b6914]">
            {responses.length} {responses.length === 1 ? "writer" : "writers"}
          </span>
        </div>

        {responses.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#c88c32]/30 bg-[#f0d78c]/10 p-10 text-center">
            <p className="font-serif text-lg text-[#3d3929]">
              No responses yet — be the first to write.
            </p>
            <p className="mt-2 text-sm text-[#6b6757]">
              Your words will sit at the top of this conversation.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {responses.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-[#3d3929]/10 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-sans text-sm font-semibold text-[#3d3929]">
                    {r.author_name}
                  </span>
                  <span className="font-mono text-xs text-[#6b6757]/70">
                    {r.word_count} words · {formatTime(r.created_at)}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-[#3d3929]/90">
                  {r.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "2026-08-02T14:03:00Z" -> "14:03" (server time; good enough for MVP). */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
