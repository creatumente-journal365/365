import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { sql } from "~/db/index";
import { AppHeader } from "~/components/AppHeader";
import {
  getClassroomResponses,
  joinClassroom,
  submitClassroomResponse,
  type ClassroomResponse,
} from "~/serverFunctions";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_WORDS = 500;
/** Student session, persisted in localStorage so a join survives reloads. */
const SESSION_KEY = "cym_student_session";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Prompt {
  id: number;
  day: string;
  prompt_text: string;
}

/** What a joined student has on this device: their id + the classroom they're in. */
interface StudentSession {
  studentId: string;
  studentName: string;
  classroomId: string;
  classroomName: string;
}

/** Classroom responses grouped by prompt, freshest prompt group first. */
interface ResponseGroup {
  promptId: number;
  promptText: string;
  responses: ClassroomResponse[];
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/**
 * Today's prompt from the prompts table (UTC date, matching how seeds are
 * anchored). Same query the public /app feed uses — students and the community
 * always write to the same prompt.
 */
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

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/app/join")({
  component: StudentJoinPage,
});

/**
 * Student join + write experience. No Clerk auth required — students identify
 * themselves with a join code + name, and their session lives in localStorage.
 * Two states: the join form (no session) and the writing view (session).
 */
function StudentJoinPage() {
  const [session, setSession] = useState<StudentSession | null>(null);
  // localStorage isn't available during SSR, so read it after mount and only
  // then decide which state to show (avoids a hydration flash).
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw) as StudentSession);
    } catch {
      // localStorage unavailable or corrupt — start at the join form
    }
    setReady(true);
  }, []);

  const saveSession = useCallback((next: StudentSession) => {
    setSession(next);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable — the session just won't survive a reload
    }
  }, []);

  const leaveClassroom = useCallback(() => {
    setSession(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // localStorage unavailable — state already reset
    }
  }, []);

  if (!ready) return <FullPageSpinner />;

  return (
    <div className="min-h-dvh bg-[#fefcf5]">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        {session ? (
          <StudentClassroomView
            key={`${session.classroomId}-${session.studentId}`}
            session={session}
            onLeave={leaveClassroom}
          />
        ) : (
          <JoinForm onJoined={saveSession} />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State 1 — join form
// ---------------------------------------------------------------------------

function JoinForm({ onJoined }: { onJoined: (session: StudentSession) => void }) {
  const [code, setCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (joining || !code.trim() || !studentName.trim()) return;
    setJoining(true);
    setError(null);
    try {
      const result = await joinClassroom({
        data: { code: code.trim(), studentName: studentName.trim() },
      });
      onJoined({
        studentId: result.studentId,
        studentName: studentName.trim(),
        classroomId: result.classroom.id,
        classroomName: result.classroom.name,
      });
    } catch (err) {
      console.error("Failed to join classroom:", err);
      const message = err instanceof Error ? err.message : "";
      // Badly-formed and unknown codes both read as "not found" to students.
      setError(
        /classroom not found|invalid classroom code/i.test(message)
          ? "Classroom not found. Check your code and try again."
          : message || "Couldn't join the classroom. Try again.",
      );
      setJoining(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="text-center">
        <h1 className="font-serif text-2xl font-semibold text-[#3d3929] sm:text-3xl">
          Join your classroom
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#6b6757]">
          Enter the join code your teacher shared, plus your name. No account
          needed — you&apos;ll write alongside your classmates on the same
          daily prompt.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="mt-8 rounded-2xl border border-[#3d3929]/10 bg-white p-8 shadow-sm"
      >
        <label
          htmlFor="class-code"
          className="block font-sans text-sm font-semibold text-[#3d3929]"
        >
          Class code
        </label>
        <input
          id="class-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          autoFocus
          placeholder="ABC-123"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="mt-2 w-full rounded-lg border border-[#3d3929]/15 bg-white px-3 py-2.5 font-mono text-base tracking-widest text-[#3d3929] placeholder:text-[#6b6757]/40 focus:border-[#c88c32] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/20"
        />

        <label
          htmlFor="student-name"
          className="mt-6 block font-sans text-sm font-semibold text-[#3d3929]"
        >
          Your name
        </label>
        <input
          id="student-name"
          type="text"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          maxLength={100}
          placeholder="The name your teacher will see"
          className="mt-2 w-full rounded-lg border border-[#3d3929]/15 bg-white px-3 py-2.5 font-sans text-base text-[#3d3929] placeholder:text-[#6b6757]/50 focus:border-[#c88c32] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/20"
        />

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 font-sans text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={joining || !code.trim() || !studentName.trim()}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c88c32] px-6 py-3 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {joining ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Joining…
            </>
          ) : (
            "Join classroom"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-[#6b6757]/70">
        Not sure about the code? Ask your teacher — it looks like{" "}
        <span className="font-mono tracking-widest">ABC-123</span>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State 2 — writing + reading inside the classroom
// ---------------------------------------------------------------------------

function StudentClassroomView({
  session,
  onLeave,
}: {
  session: StudentSession;
  onLeave: () => void;
}) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [responses, setResponses] = useState<ClassroomResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [showNoPasteMessage, setShowNoPasteMessage] = useState(false);
  const noPasteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  /** Fetch today's prompt + this classroom's responses in one go. */
  const loadAll = useCallback(async () => {
    try {
      const [p, rs] = await Promise.all([
        getTodayPrompt(),
        getClassroomResponses({
          data: {
            classroomId: session.classroomId,
            studentId: session.studentId,
          },
        }),
      ]);
      setPrompt(p);
      setResponses(rs);
      setLoadError(null);
    } catch (err) {
      console.error("Failed to load classroom:", err);
      setLoadError(
        err instanceof Error
          ? err.message
          : "Couldn't load your classroom. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [session.classroomId, session.studentId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Clear the paste-notice timer if the view unmounts before it expires.
  useEffect(() => {
    return () => {
      if (noPasteTimeoutRef.current) clearTimeout(noPasteTimeoutRef.current);
    };
  }, []);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const overLimit = wordCount > MAX_WORDS;

  const handlePost = useCallback(async () => {
    if (!prompt || posting || !content.trim() || overLimit) return;
    setPosting(true);
    setPostError(null);
    setPosted(false);
    try {
      await submitClassroomResponse({
        data: {
          promptId: prompt.id,
          classroomId: session.classroomId,
          studentId: session.studentId,
          content,
        },
      });
      setContent("");
      setPosted(true);
      // Refresh the classroom conversation so the new piece appears.
      const rs = await getClassroomResponses({
        data: {
          classroomId: session.classroomId,
          studentId: session.studentId,
        },
      });
      setResponses(rs);
      setTimeout(() => setPosted(false), 4000);
    } catch (err) {
      console.error("Failed to submit response:", err);
      setPostError(
        err instanceof Error
          ? err.message
          : "Couldn't submit your response. Try again.",
      );
    } finally {
      setPosting(false);
    }
  }, [prompt, posting, content, overLimit, session.classroomId, session.studentId]);

  // Group responses (newest first from the server) by prompt, keeping order of
  // first appearance so the freshest prompt's group sits on top.
  const groups = useMemo<ResponseGroup[]>(() => {
    const byPrompt = new Map<number, ResponseGroup>();
    for (const r of responses) {
      const existing = byPrompt.get(r.prompt_id);
      if (existing) {
        existing.responses.push(r);
      } else {
        byPrompt.set(r.prompt_id, {
          promptId: r.prompt_id,
          promptText: r.prompt_text ?? "Untitled prompt",
          responses: [r],
        });
      }
    }
    return [...byPrompt.values()];
  }, [responses]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Classroom header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="rounded-full border border-[#c88c32]/30 bg-[#f0d78c]/20 px-3 py-1 font-sans text-xs font-medium uppercase tracking-widest text-[#c88c32]">
            Classroom
          </span>
          <h1 className="mt-3 font-serif text-2xl font-semibold text-[#3d3929] sm:text-3xl">
            {session.classroomName}
          </h1>
          <p className="mt-1.5 text-sm text-[#6b6757]">
            Writing as{" "}
            <span className="font-semibold text-[#3d3929]">
              {session.studentName}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            // The name is unique per classroom server-side, so leaving is
            // effectively a sign-out on this device — confirm first.
            if (
              window.confirm(
                "Leave this classroom? You'll need the join code to come back.",
              )
            ) {
              onLeave();
            }
          }}
          className="rounded-full border border-[#3d3929]/15 px-4 py-2 font-sans text-sm font-medium text-[#6b6757] transition-colors hover:border-[#c88c32]/50 hover:text-[#a6731f]"
        >
          Leave classroom
        </button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="font-serif text-lg text-red-800">{loadError}</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                void loadAll();
              }}
              className="font-sans text-sm font-medium text-red-700 underline underline-offset-2"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="font-sans text-sm font-medium text-red-700 underline underline-offset-2"
            >
              Leave classroom
            </button>
          </div>
        </div>
      )}

      {!loadError && (
        <>
          {/* Daily prompt — same prompt the public community writes to */}
          {prompt ? (
            <section className="rounded-2xl border border-[#3d3929]/10 bg-white p-8 shadow-sm sm:p-10">
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-[#c88c32]/30 bg-[#f0d78c]/20 px-3 py-1 font-sans text-xs font-medium uppercase tracking-widest text-[#c88c32]">
                  Today&apos;s prompt
                </span>
                <span className="font-mono text-xs text-[#6b6757]/70">
                  {prompt.day}
                </span>
              </div>
              <p className="mt-6 font-serif text-2xl leading-snug text-[#3d3929] sm:text-3xl">
                &ldquo;{prompt.prompt_text}&rdquo;
              </p>
              <p className="mt-4 text-sm text-[#6b6757]">
                Write a short response — up to {MAX_WORDS} words. Your
                classmates will read it, and you can read theirs.
              </p>
            </section>
          ) : (
            <section className="rounded-2xl border border-[#3d3929]/10 bg-white p-8 text-center shadow-sm">
              <p className="font-serif text-xl font-semibold text-[#3d3929]">
                No prompt today — yet.
              </p>
              <p className="mt-2 text-sm text-[#6b6757]">
                Today&apos;s prompt hasn&apos;t been seeded. You can still read
                your classmates&apos; earlier responses below.
              </p>
            </section>
          )}

          {/* Write card */}
          {prompt && (
            <section className="rounded-2xl border border-[#3d3929]/10 bg-white p-8 shadow-sm sm:p-10">
              <h2 className="font-serif text-xl font-semibold text-[#3d3929]">
                Your response
              </h2>

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
                  onClick={() => void handlePost()}
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

              {postError && (
                <p className="mt-3 font-sans text-sm text-red-600">{postError}</p>
              )}
              {posted && (
                <p className="mt-3 font-sans text-sm font-medium text-green-700">
                  Posted! Your classmates can read it now.
                </p>
              )}
            </section>
          )}

          {/* Classroom responses — read-only, grouped by prompt */}
          <section>
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-[#3d3929]">
                Classmates&apos; responses
              </h2>
              <span className="rounded-full bg-[#f0d78c]/30 px-3 py-1 font-sans text-xs font-medium text-[#8b6914]">
                {responses.length}{" "}
                {responses.length === 1 ? "piece" : "pieces"}
              </span>
            </div>

            {responses.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-[#c88c32]/30 bg-[#f0d78c]/10 p-10 text-center">
                <p className="font-serif text-lg text-[#3d3929]">
                  No responses yet — be the first to write.
                </p>
                <p className="mt-2 text-sm text-[#6b6757]">
                  Your words will sit at the top of your classroom&apos;s
                  conversation.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-10">
                {groups.map((group) => (
                  <div key={group.promptId}>
                    <h3 className="font-serif text-sm font-semibold uppercase tracking-widest text-[#8b6914]">
                      Prompt · {group.promptText}
                    </h3>
                    <ul className="mt-4 space-y-4">
                      {group.responses.map((r) => (
                        <li
                          key={r.id}
                          className="rounded-2xl border border-[#3d3929]/10 bg-white p-6 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-sans text-sm font-semibold text-[#3d3929]">
                              {r.author_name}
                            </span>
                            <span className="font-mono text-xs text-[#6b6757]/70">
                              {formatDateTime(r.created_at)}
                            </span>
                          </div>
                          <ResponseContent content={r.content} />
                          <p className="mt-3 font-sans text-xs text-[#6b6757]/70">
                            {r.word_count} words
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/**
 * Response body, clamped to four lines with a read-more toggle for long
 * pieces. Same pattern as the teacher's classroom view.
 */
function ResponseContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = content.length > 320;
  return (
    <div>
      <p
        className={`mt-3 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-[#3d3929]/90 ${
          expanded ? "" : "line-clamp-4"
        }`}
      >
        {content}
      </p>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 font-sans text-xs font-semibold text-[#c88c32] transition-colors hover:text-[#a6731f] hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#fefcf5]">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
    </div>
  );
}

/** "2026-08-07T14:03:00Z" -> "Aug 7, 14:03" (browser locale). */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
