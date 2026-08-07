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
const GUEST_ID_KEY = "cym_guest_id";
const MAX_COMMENT_CHARS = 1000;
const WELCOME_DISMISSED_KEY = "cym_welcome_dismissed";

const WELCOME_COPY = {
  en: {
    heading: "Welcome to The Daily Draft",
    body: "One creative prompt every day. You write up to 500 words, share it, and read what other human minds imagined from the same starting point. No AI, no pressure — just a reason to write.",
    button: "Got it — show me today's prompt",
  },
  es: {
    heading: "Bienvenido a The Daily Draft",
    body: "Un ejercicio creativo cada día. Escribe hasta 500 palabras, compártelo y descubre lo que otras mentes imaginaron desde el mismo punto de partida. Sin IA, sin presión — solo una razón para escribir.",
    button: "Entendido — ver la consigna de hoy",
  },
} as const;

/** Pick the welcome copy for the visitor's browser language (default: English). */
function getWelcomeCopy(): (typeof WELCOME_COPY)["en"] {
  try {
    if (typeof navigator !== "undefined" && /^es\b/i.test(navigator.language)) {
      return WELCOME_COPY.es;
    }
  } catch {
    // navigator unavailable — fall through to English
  }
  return WELCOME_COPY.en;
}

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
  user_id: string;
  author_name: string;
  content: string;
  word_count: number;
  created_at: string;
}

/** A comment on a response, oldest first (newest last). */
interface Comment {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
}

/** Per-response engagement: like count, whether the current user liked it, comment count. */
interface Engagement {
  likes: number;
  liked: boolean;
  comments: number;
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
      SELECT id, user_id, author_name, content, word_count, created_at
      FROM responses
      WHERE prompt_id = ${data.promptId}
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      user_id: String(r.user_id),
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

/** Toggle a like on a response. Returns whether the user now likes it + the new count. */
const toggleLike = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { responseId: number; userId: string; actorName?: string };
    if (!d || !Number.isInteger(d.responseId) || d.responseId <= 0) {
      throw new Error("Invalid response");
    }
    const userId = String(d.userId ?? "").trim().slice(0, 128);
    if (!userId) throw new Error("Who are you? Sign in or set a name first.");
    const actorName = String(d.actorName ?? userId).trim().slice(0, 60) || userId;
    return { responseId: d.responseId, userId, actorName };
  })
  .handler(async ({ data }) => {
    const db = sql();
    const [response] = await db`SELECT user_id FROM responses WHERE id = ${data.responseId}`;
    // Delete first; if nothing was deleted the user wasn't liked yet, so insert.
    const removed = await db`
      DELETE FROM response_likes
      WHERE response_id = ${data.responseId} AND user_id = ${data.userId}
      RETURNING id
    `;
    let liked: boolean;
    if (removed.length > 0) {
      liked = false;
      await db`
        DELETE FROM notifications
        WHERE user_id = ${response?.user_id ?? ""}
          AND response_id = ${data.responseId}
          AND type = 'like'
          AND actor_name = ${data.actorName}
      `;
    } else {
      await db`
        INSERT INTO response_likes (response_id, user_id)
        VALUES (${data.responseId}, ${data.userId})
        ON CONFLICT (response_id, user_id) DO NOTHING
      `;
      liked = true;
      if (response?.user_id && response.user_id !== data.userId) {
        await db`
          INSERT INTO notifications (user_id, type, response_id, actor_name)
          VALUES (${response.user_id}, 'like', ${data.responseId}, ${data.actorName})
        `;
      }
    }
    const countRows = await db`
      SELECT COUNT(*)::int AS n FROM response_likes
      WHERE response_id = ${data.responseId}
    `;
    return { liked, count: Number(countRows[0]?.n ?? 0) } satisfies {
      liked: boolean;
      count: number;
    };
  });

/** Like count + whether the current user liked a response. */
const getResponseLikes = createServerFn()
  .validator((data: unknown) => {
    const d = data as { responseId: number; userId: string };
    if (!d || !Number.isInteger(d.responseId) || d.responseId <= 0) {
      throw new Error("Invalid response");
    }
    return { responseId: d.responseId, userId: String(d.userId ?? "") };
  })
  .handler(async ({ data }) => {
    const db = sql();
    const countRows = await db`
      SELECT COUNT(*)::int AS n FROM response_likes
      WHERE response_id = ${data.responseId}
    `;
    let liked = false;
    if (data.userId) {
      const mine = await db`
        SELECT 1 FROM response_likes
        WHERE response_id = ${data.responseId} AND user_id = ${data.userId}
        LIMIT 1
      `;
      liked = mine.length > 0;
    }
    return {
      count: Number(countRows[0]?.n ?? 0),
      liked,
    } satisfies { count: number; liked: boolean };
  });

/** Comments on a response, oldest first (newest last). */
const getResponseComments = createServerFn()
  .validator((data: unknown) => {
    const d = data as { responseId: number };
    if (!d || !Number.isInteger(d.responseId) || d.responseId <= 0) {
      throw new Error("Invalid response");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const db = sql();
    const rows = await db`
      SELECT id, author_name, content, created_at
      FROM response_comments
      WHERE response_id = ${data.responseId}
      ORDER BY created_at ASC, id ASC
      LIMIT 500
    `;
    return rows.map((c) => ({
      id: Number(c.id),
      author_name: String(c.author_name ?? "Anonymous"),
      content: String(c.content),
      created_at: String(c.created_at),
    })) satisfies Comment[];
  });

/** Add a comment to a response. Returns the stored comment. */
const commentOnResponse = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as {
      responseId: number;
      userId: string;
      authorName: string;
      content: string;
    };
    if (!d || !Number.isInteger(d.responseId) || d.responseId <= 0) {
      throw new Error("Invalid response");
    }
    const content = String(d.content ?? "").trim();
    if (!content) throw new Error("Say something before you send it.");
    if (content.length > MAX_COMMENT_CHARS) {
      throw new Error(`Keep notes under ${MAX_COMMENT_CHARS} characters.`);
    }
    const userId = String(d.userId ?? "").trim().slice(0, 128);
    if (!userId) throw new Error("Who are you? Sign in or set a name first.");
    const authorName = String(d.authorName ?? "").trim().slice(0, 60) || "Anonymous";
    return { responseId: d.responseId, userId, authorName, content };
  })
  .handler(async ({ data }) => {
    const db = sql();
    const rows = await db`
      INSERT INTO response_comments (response_id, user_id, author_name, content)
      VALUES (${data.responseId}, ${data.userId}, ${data.authorName}, ${data.content})
      RETURNING id, author_name, content, created_at
    `;
    const [response] = await db`SELECT user_id FROM responses WHERE id = ${data.responseId}`;
    if (response?.user_id && response.user_id !== data.userId) {
      await db`
        INSERT INTO notifications (user_id, type, response_id, actor_name)
        VALUES (${response.user_id}, 'comment', ${data.responseId}, ${data.authorName})
      `;
    }
    const c = rows[0] as {
      id: number;
      author_name: unknown;
      content: unknown;
      created_at: unknown;
    };
    return {
      id: Number(c.id),
      author_name: String(c.author_name ?? "Anonymous"),
      content: String(c.content),
      created_at: String(c.created_at),
    } satisfies Comment;
  });

/**
 * Engagement (like count, "did I like it?", comment count) for every response
 * to a prompt, in one round trip — so the responses list doesn't fan out N+1
 * requests on load.
 */
interface NotificationRow {
  id: number;
  type: "like" | "comment";
  response_id: number;
  actor_name: string;
  created_at: string;
}

const getNotifications = createServerFn()
  .validator((data: unknown) => {
    const d = data as { userId: string };
    return { userId: String(d?.userId ?? "") };
  })
  .handler(async ({ data }) => {
    if (!data.userId) return [];
    const db = sql();
    const rows = await db`
      SELECT n.id, n.type, n.response_id, n.actor_name, n.created_at
      FROM notifications n
      WHERE n.user_id = ${data.userId} AND n.read = FALSE
      ORDER BY n.created_at DESC LIMIT 50
    `;
    return rows.map((n) => ({
      id: Number(n.id), type: String(n.type) as "like" | "comment",
      response_id: Number(n.response_id), actor_name: String(n.actor_name), created_at: String(n.created_at),
    })) satisfies NotificationRow[];
  });

const getUnreadCount = createServerFn()
  .validator((data: unknown) => {
    const d = data as { userId: string };
    return { userId: String(d?.userId ?? "") };
  })
  .handler(async ({ data }) => {
    if (!data.userId) return 0;
    const db = sql();
    const [row] = await db`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = ${data.userId} AND read = FALSE`;
    return Number(row?.count ?? 0);
  });

const markNotificationsRead = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { userId: string };
    return { userId: String(d?.userId ?? "") };
  })
  .handler(async ({ data }) => {
    if (!data.userId) return;
    const db = sql();
    await db`UPDATE notifications SET read = TRUE WHERE user_id = ${data.userId}`;
  });

const getEngagementForPrompt = createServerFn()
  .validator((data: unknown) => {
    const d = data as { promptId: number; userId: string };
    if (!d || typeof d.promptId !== "number") throw new Error("Invalid prompt");
    return { promptId: d.promptId, userId: String(d.userId ?? "") };
  })
  .handler(async ({ data }) => {
    const db = sql();
    const rows = await db`
      SELECT
        r.id,
        (SELECT COUNT(*)::int FROM response_likes l WHERE l.response_id = r.id) AS like_count,
        (SELECT COUNT(*)::int FROM response_comments c WHERE c.response_id = r.id) AS comment_count,
        EXISTS(
          SELECT 1 FROM response_likes l2
          WHERE l2.response_id = r.id AND l2.user_id = ${data.userId}
        ) AS liked
      FROM responses r
      WHERE r.prompt_id = ${data.promptId}
    `;
    const out: Record<number, Engagement> = {};
    for (const row of rows as Array<{
      id: number;
      like_count: unknown;
      comment_count: unknown;
      liked: unknown;
    }>) {
      out[Number(row.id)] = {
        likes: Number(row.like_count ?? 0),
        liked: Boolean(row.liked),
        comments: Number(row.comment_count ?? 0),
      };
    }
    return out;
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
        <WelcomeBanner />
        <TodayView />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Welcome banner — first-visit greeting, dismissible, remembered in localStorage
// ---------------------------------------------------------------------------

function WelcomeBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);

  // Read the dismissal flag after mount (localStorage isn't available during
  // SSR, and reading it in state initializers would cause a hydration flash).
  useEffect(() => {
    try {
      if (localStorage.getItem(WELCOME_DISMISSED_KEY)) setDismissed(true);
    } catch {
      // localStorage unavailable — show the banner anyway
    }
    setReady(true);
  }, []);

  if (!ready || dismissed) return null;

  const copy = getWelcomeCopy();

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
    } catch {
      // localStorage unavailable — the banner just won't persist
    }
  };

  return (
    <section
      role="region"
      aria-label={copy.heading}
      className="relative mb-12 rounded-2xl border border-[#3d3929]/10 bg-white p-8 shadow-sm sm:p-10"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome message"
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full font-sans text-xl leading-none text-[#6b6757]/60 transition-colors hover:bg-[#f5f0e3] hover:text-[#3d3929]"
      >
        ×
      </button>
      <h2 className="pr-10 font-serif text-2xl font-semibold text-[#3d3929]">
        {copy.heading}
      </h2>
      <p className="mt-3 max-w-xl font-sans text-sm leading-relaxed text-[#6b6757] sm:text-base">
        {copy.body}
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#c88c32] px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f] hover:shadow-md active:scale-[0.98]"
      >
        {copy.button}
      </button>
    </section>
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
          <NotificationBell />
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

function NotificationBell() {
  const { user, isLoaded } = useUser();
  const [guestId, setGuestId] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const userId = user?.id ?? guestId;

  useEffect(() => setGuestId(getOrCreateGuestId()), []);
  const refresh = useCallback(async () => {
    if (!userId) return;
    try { setCount(await getUnreadCount({ data: { userId } })); } catch (err) { console.error("Failed to load notifications", err); }
  }, [userId]);
  useEffect(() => { if (isLoaded && userId) { void refresh(); const timer = window.setInterval(() => void refresh(), 30000); return () => window.clearInterval(timer); } }, [isLoaded, userId, refresh]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const toggle = async () => {
    if (!userId) return;
    if (!open) { try { setItems(await getNotifications({ data: { userId } })); } catch (err) { console.error("Failed to load notifications", err); } }
    setOpen((value) => !value);
  };
  const markRead = async () => { if (!userId) return; await markNotificationsRead({ data: { userId } }); setCount(0); setItems([]); };
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => void toggle()} aria-label={`Notifications${count ? ` (${count} unread)` : ""}`} className={`relative rounded-full p-2 transition-colors hover:bg-[#f5f0e3] ${count ? "text-[#c88c32]" : "text-[#6b6757]"}`}>
        <BellIcon />
        {count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#c88c32] text-xs text-white">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-[#3d3929]/10 bg-white p-3 shadow-md">
        <div className="flex items-center justify-between border-b border-[#3d3929]/10 px-2 pb-2"><h2 className="font-serif font-semibold text-[#3d3929]">Notifications</h2>{items.length > 0 && <button type="button" onClick={() => void markRead()} className="font-sans text-xs font-medium text-[#c88c32] hover:underline">Mark all read</button>}</div>
        {items.length === 0 ? <p className="px-2 py-5 text-center font-sans text-sm text-[#6b6757]">You&apos;re all caught up.</p> : <ul className="max-h-72 overflow-y-auto">{items.map((item) => <li key={item.id}><Link to="/app" onClick={() => setOpen(false)} className="block rounded-lg px-2 py-3 font-sans text-sm text-[#3d3929] hover:bg-[#f5f0e3]"><span className="font-semibold">{item.actor_name}</span> {item.type === "like" ? "liked" : "commented on"} your response<span className="mt-1 block text-xs text-[#6b6757]">{formatRelativeTime(item.created_at)}</span></Link></li>)}</ul>}
      </div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's prompt + writing + responses
// ---------------------------------------------------------------------------

function TodayView() {
  const { user, isLoaded } = useUser();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [engagement, setEngagement] = useState<Record<number, Engagement>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [showNoPasteMessage, setShowNoPasteMessage] = useState(false);
  const noPasteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guestName, setGuestName] = useState<string>("");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  // Stable guest identity, remembered across visits (unlike a per-session id,
  // a persisted id keeps a guest's likes and comments attached to them).
  useEffect(() => {
    setGuestId(getOrCreateGuestId());
  }, []);

  // Clear the paste notice timer if the view is unmounted before it expires.
  useEffect(() => {
    return () => {
      if (noPasteTimeoutRef.current) clearTimeout(noPasteTimeoutRef.current);
    };
  }, []);

  // Remember the guest display name across visits
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GUEST_NAME_KEY);
      if (saved) setGuestName(saved);
    } catch {
      // localStorage unavailable — fine
    }
  }, []);

  const signedInName = user
    ? user.firstName ||
      user.username ||
      user.emailAddresses?.[0]?.emailAddress ||
      ""
    : "";
  const displayName = user ? signedInName : guestName.trim();
  const userId = user ? user.id : guestId;
  const clerkUserId = user?.id ?? null;

  // Load prompt + responses + engagement once identity is settled (Clerk
  // resolves async, and guests need their persisted id first).
  useEffect(() => {
    if (!isLoaded) return;
    if (!clerkUserId && !guestId) return;
    (async () => {
      try {
        const p = await getTodayPrompt();
        setPrompt(p);
        if (p) {
          const [rs, eng] = await Promise.all([
            getResponses({ data: { promptId: p.id } }),
            getEngagementForPrompt({
              data: { promptId: p.id, userId: clerkUserId ?? guestId! },
            }),
          ]);
          setResponses(rs);
          setEngagement(eng);
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
  }, [isLoaded, clerkUserId, guestId]);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const overLimit = wordCount > MAX_WORDS;

  const handlePost = useCallback(async () => {
    if (!prompt) return;
    setPosting(true);
    setPostError(null);
    setPosted(false);
    try {
      const authorName = user ? displayName || "Anonymous" : guestName.trim() || "Anonymous";
      await saveResponse({
        data: {
          promptId: prompt.id,
          userId: userId || "guest",
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
      // Refresh the day's responses + their engagement
      const [rs, eng] = await Promise.all([
        getResponses({ data: { promptId: prompt.id } }),
        getEngagementForPrompt({
          data: { promptId: prompt.id, userId: userId || "" },
        }),
      ]);
      setResponses(rs);
      setEngagement(eng);
      setTimeout(() => setPosted(false), 4000);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Couldn't post. Try again.");
    } finally {
      setPosting(false);
    }
  }, [prompt, user, displayName, guestName, content, userId]);

  const handleToggleLike = useCallback(
    async (responseId: number) => {
      if (!userId) return;
      const current = engagement[responseId];
      // Optimistic flip — the UI feels instant, and the server confirms below.
      setEngagement((prev) => ({
        ...prev,
        [responseId]: {
          likes: Math.max(0, (current?.likes ?? 0) + (current?.liked ? -1 : 1)),
          liked: !current?.liked,
          comments: current?.comments ?? 0,
        },
      }));
      try {
        const res = await toggleLike({
          data: { responseId, userId, actorName: displayName || userId },
        });
        setEngagement((prev) => ({
          ...prev,
          [responseId]: {
            likes: res.count,
            liked: res.liked,
            comments: prev[responseId]?.comments ?? 0,
          },
        }));
      } catch (err) {
        // Revert the optimistic change on failure
        setEngagement((prev) => ({
          ...prev,
          [responseId]: {
            likes: current?.likes ?? 0,
            liked: current?.liked ?? false,
            comments: current?.comments ?? 0,
          },
        }));
        console.error("Like failed:", err);
      }
    },
    [engagement, userId, displayName],
  );

  const handleCommentCountChange = useCallback(
    (responseId: number, delta: number) => {
      setEngagement((prev) => {
        const cur = prev[responseId];
        return {
          ...prev,
          [responseId]: {
            likes: cur?.likes ?? 0,
            liked: cur?.liked ?? false,
            comments: Math.max(0, (cur?.comments ?? 0) + delta),
          },
        };
      });
    },
    [],
  );

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
          onPaste={(e) => {
            e.preventDefault();
            setShowNoPasteMessage(true);
            if (noPasteTimeoutRef.current) clearTimeout(noPasteTimeoutRef.current);
            noPasteTimeoutRef.current = setTimeout(() => {
              setShowNoPasteMessage(false);
              noPasteTimeoutRef.current = null;
            }, 3000);
          }}
          rows={10}
          maxLength={4000}
          placeholder="Take it anywhere. Strange, tender, funny, unfinished — all welcome."
          className="mt-4 w-full resize-y rounded-lg border border-[#3d3929]/15 bg-[#fefcf5] px-4 py-3.5 font-serif text-base leading-relaxed text-[#3d3929] placeholder:text-[#6b6757]/40 focus:border-[#c88c32] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/20"
        />
        <p
          aria-live="polite"
          className={`min-h-5 mt-2 font-sans text-sm text-[#c88c32] transition-opacity duration-300 ${showNoPasteMessage ? "opacity-100" : "opacity-0"}`}
        >
          Write your own words — pasting is disabled.
        </p>

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
                <ResponseCard
                  response={r}
                  engagement={engagement[r.id] ?? { likes: 0, liked: false, comments: 0 }}
                  currentUserId={userId ?? ""}
                  currentName={displayName || "Anonymous"}
                  onToggleLike={() => handleToggleLike(r.id)}
                  onCommentCountChange={(delta) => handleCommentCountChange(r.id, delta)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResponseCard — the piece + like/comment engagement
// ---------------------------------------------------------------------------

function ResponseCard({
  response,
  engagement,
  currentUserId,
  currentName,
  onToggleLike,
  onCommentCountChange,
}: {
  response: ResponseRow;
  engagement: Engagement;
  currentUserId: string;
  currentName: string;
  onToggleLike: () => void;
  onCommentCountChange: (delta: number) => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentPosting, setCommentPosting] = useState(false);
  const [likePending, setLikePending] = useState(false);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const cs = await getResponseComments({ data: { responseId: response.id } });
      setComments(cs);
    } catch (err) {
      console.error("Failed to load comments:", err);
      setCommentError("Couldn't load the notes on this piece.");
    } finally {
      setCommentsLoading(false);
    }
  }, [response.id]);

  // Toggle the marginalia section; load comments the first time it opens.
  const openComments = useCallback(() => {
    setCommentsOpen((open) => {
      const next = !open;
      return next;
    });
    if (!commentsOpen && comments === null && !commentsLoading) {
      void loadComments();
    }
  }, [commentsOpen, comments, commentsLoading, loadComments]);

  const handleLikeClick = useCallback(async () => {
    if (likePending || !currentUserId) return;
    setLikePending(true);
    try {
      await onToggleLike();
    } finally {
      setLikePending(false);
    }
  }, [likePending, currentUserId, onToggleLike]);

  const handleAddComment = useCallback(async () => {
    const text = commentText.trim();
    if (!text || commentPosting || !currentUserId) return;
    setCommentPosting(true);
    setCommentError(null);
    try {
      const c = await commentOnResponse({
        data: {
          responseId: response.id,
          userId: currentUserId,
          authorName: currentName,
          content: text,
        },
      });
      setComments((prev) => [...(prev ?? []), c]);
      setCommentText("");
      onCommentCountChange(1);
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Couldn't add your note.");
    } finally {
      setCommentPosting(false);
    }
  }, [commentText, commentPosting, currentUserId, currentName, response.id, onCommentCountChange]);

  const showCommentCount = engagement.comments > 0 || commentsOpen;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-sans text-sm font-semibold text-[#3d3929]">
          {response.author_name}
        </span>
        <span className="font-mono text-xs text-[#6b6757]/70">
          {response.word_count} words · {formatTime(response.created_at)}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-[#3d3929]/90">
        {response.content}
      </p>

      {/* Engagement row — quiet, bookish, not a social feed */}
      <div className="mt-4 flex items-center gap-1 border-t border-[#3d3929]/5 pt-3">
        <button
          type="button"
          onClick={handleLikeClick}
          disabled={!currentUserId || likePending}
          title={currentUserId ? "Appreciate this piece" : "Sign in or set a name to like"}
          aria-pressed={engagement.liked}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            engagement.liked
              ? "text-[#a6731f]"
              : "text-[#6b6757]/70 hover:bg-[#f0d78c]/20 hover:text-[#a6731f]"
          }`}
        >
          <HeartIcon filled={engagement.liked} />
          <span>{engagement.likes}</span>
          <span className="sr-only">appreciations</span>
        </button>

        <button
          type="button"
          onClick={openComments}
          aria-expanded={commentsOpen}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs transition-colors ${
            commentsOpen
              ? "text-[#a6731f]"
              : "text-[#6b6757]/70 hover:bg-[#f0d78c]/20 hover:text-[#a6731f]"
          }`}
        >
          <BubbleIcon />
          {showCommentCount && <span>{engagement.comments}</span>}
          <span className={commentsOpen ? "" : "sr-only"}>notes</span>
        </button>
      </div>

      {/* Comment section (marginalia) */}
      {commentsOpen && (
        <div className="mt-3 rounded-xl border border-[#3d3929]/10 bg-[#fefcf5] px-4 py-3">
          <div className="flex items-center gap-1.5 text-[#8b6914]">
            <QuillIcon />
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-widest">
              Marginalia
            </h3>
          </div>

          {commentError && !commentsLoading && (
            <p className="mt-2 font-sans text-xs text-red-600">{commentError}</p>
          )}

          {commentsLoading ? (
            <p className="mt-3 font-serif text-sm italic text-[#6b6757]">Reading the notes…</p>
          ) : comments !== null && comments.length === 0 ? (
            <p className="mt-3 font-serif text-sm italic text-[#6b6757]">
              No notes yet — the margin is yours.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {comments?.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-sans text-xs font-semibold text-[#3d3929]">
                    {c.author_name}
                  </span>
                  <span className="ml-2 font-mono text-[10px] text-[#6b6757]/60">
                    {formatRelativeTime(c.created_at)}
                  </span>
                  <p className="mt-0.5 whitespace-pre-wrap font-serif text-sm leading-relaxed text-[#3d3929]/85">
                    {c.content}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {currentUserId ? (
            <form
              className="mt-3 flex items-start gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleAddComment();
              }}
            >
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={MAX_COMMENT_CHARS}
                placeholder={currentName === "Anonymous" ? "Add a note…" : `Add a note as ${currentName}…`}
                className="w-full rounded-lg border border-[#3d3929]/15 bg-white px-3 py-2 font-sans text-sm text-[#3d3929] placeholder:text-[#6b6757]/50 focus:border-[#c88c32] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/20"
              />
              <button
                type="submit"
                disabled={commentPosting || !commentText.trim()}
                className="shrink-0 rounded-full bg-[#c88c32]/90 px-4 py-2 font-sans text-xs font-semibold text-white transition-colors hover:bg-[#a6731f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {commentPosting ? "…" : "Add"}
              </button>
            </form>
          ) : (
            <p className="mt-3 font-sans text-xs text-[#6b6757]/80">
              Sign in (or set your name above) to leave a note.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons — small, stroke-drawn, literary rather than social
// ---------------------------------------------------------------------------

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[15px] w-[15px]"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function BubbleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[15px] w-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.3c-1.3 0-2.5-.28-3.6-.78L3 20l1.05-5.2A8.38 8.38 0 0 1 11.5 3.2a8.38 8.38 0 0 1 9.5 8.3z" />
    </svg>
  );
}

function QuillIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <path d="M16 8 2 22" />
      <path d="M17.5 15H9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A stable guest identity, persisted in localStorage so a guest's likes and
 * comments stay attached to them across visits. Falls back to a per-session
 * random id when localStorage is unavailable.
 */
function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `guest-${crypto.randomUUID().slice(0, 8)}`
        : `guest-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(GUEST_ID_KEY, fresh);
    return fresh;
  } catch {
    return `guest-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** "2026-08-02T14:03:00Z" -> "14:03" (server time; good enough for MVP). */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Quiet, human times for marginalia: "just now", "2h ago", "Aug 2, 14:03". */
function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
