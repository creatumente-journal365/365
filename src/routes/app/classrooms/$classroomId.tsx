import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-start";
import { useEffect, useMemo, useState } from "react";
import {
  getClassroomResponses,
  getTeacherClassroom,
  type Classroom,
  type ClassroomResponse,
} from "~/serverFunctions";
import { AppHeader } from "~/components/AppHeader";
import { CopyCode } from "~/components/CopyCode";

export const Route = createFileRoute("/app/classrooms/$classroomId")({
  component: ClassroomDetail,
});

interface ResponseGroup {
  promptId: number;
  promptText: string;
  responses: ClassroomResponse[];
}

function ClassroomDetail() {
  const { classroomId } = Route.useParams();
  const { isLoaded, isSignedIn } = useAuth();

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [responses, setResponses] = useState<ClassroomResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load once auth is settled. Both server functions verify the teacher owns
  // this classroom, so a wrong id just becomes a friendly error below.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    (async () => {
      try {
        const [c, rs] = await Promise.all([
          getTeacherClassroom({ data: { classroomId } }),
          getClassroomResponses({ data: { classroomId } }),
        ]);
        setClassroom(c);
        setResponses(rs);
      } catch (err) {
        console.error("Failed to load classroom:", err);
        setError(
          err instanceof Error ? err.message : "Couldn't load this classroom.",
        );
      }
    })();
  }, [isLoaded, isSignedIn, classroomId]);

  // Group the responses (newest first from the server) by prompt, keeping the
  // order of first appearance so the freshest prompt's group is on top.
  const groups = useMemo<ResponseGroup[]>(() => {
    if (!responses) return [];
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

  if (!isLoaded) return <FullPageSpinner />;
  if (!isSignedIn) return <Navigate to="/sign-in" />;

  return (
    <div className="min-h-dvh bg-[#fefcf5]">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          to="/app/classrooms"
          className="font-sans text-sm font-medium text-[#6b6757] transition-colors hover:text-[#c88c32]"
        >
          ← All classrooms
        </Link>

        {error && (
          <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="font-serif text-lg text-red-800">{error}</p>
            <Link
              to="/app/classrooms"
              className="mt-4 inline-block font-sans text-sm font-medium text-red-700 underline underline-offset-2"
            >
              Back to your classrooms
            </Link>
          </div>
        )}

        {!error && classroom === null && (
          <div className="mt-16 flex justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
          </div>
        )}

        {!error && classroom && (
          <>
            <h1 className="mt-6 font-serif text-2xl font-semibold text-[#3d3929] sm:text-3xl">
              {classroom.name}
            </h1>

            {/* Join code — the one thing teachers need from this page */}
            <section className="mt-6 rounded-2xl border border-[#c88c32]/30 bg-[#f0d78c]/10 p-6 sm:p-8">
              <p className="font-sans text-xs font-semibold uppercase tracking-widest text-[#8b6914]">
                Join code
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <span className="font-mono text-3xl font-bold tracking-[0.2em] text-[#3d3929]">
                  {classroom.code}
                </span>
                <CopyCode code={classroom.code} label="Copy" />
              </div>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-[#6b6757]">
                Share this code with your students. They can join from the home
                page without an account and respond to the daily prompt — their
                writing shows up here.
              </p>
              <p className="mt-2 font-sans text-xs text-[#6b6757]/70">
                {classroom.student_count}{" "}
                {classroom.student_count === 1 ? "student has" : "students have"}{" "}
                joined
              </p>
            </section>

            {/* Student responses, grouped by prompt */}
            <section className="mt-12">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl font-semibold text-[#3d3929]">
                  Student Responses
                </h2>
                {responses !== null && (
                  <span className="rounded-full bg-[#f0d78c]/30 px-3 py-1 font-sans text-xs font-medium text-[#8b6914]">
                    {responses.length}{" "}
                    {responses.length === 1 ? "response" : "responses"}
                  </span>
                )}
              </div>

              {responses === null ? (
                <div className="mt-6 flex justify-center py-10">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
                </div>
              ) : groups.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-[#c88c32]/30 bg-[#f0d78c]/10 p-10 text-center">
                  <p className="font-serif text-lg text-[#3d3929]">
                    No responses yet.
                  </p>
                  <p className="mt-2 text-sm text-[#6b6757]">
                    Share the join code with your students to get started.
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
      </main>
    </div>
  );
}

/** Response body, clamped to four lines with a read-more toggle for long pieces. */
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
