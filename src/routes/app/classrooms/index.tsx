import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-start";
import { useEffect, useState } from "react";
import { getTeacherClassrooms, type Classroom } from "~/serverFunctions";
import { AppHeader } from "~/components/AppHeader";
import { CopyCode } from "~/components/CopyCode";

export const Route = createFileRoute("/app/classrooms/")({
  component: ClassroomsDashboard,
});

function ClassroomsDashboard() {
  const { isLoaded, isSignedIn } = useAuth();

  const [classrooms, setClassrooms] = useState<Classroom[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load once auth is settled — the server function reads the session itself.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    (async () => {
      try {
        setClassrooms(await getTeacherClassrooms());
      } catch (err) {
        console.error("Failed to load classrooms:", err);
        setError(
          err instanceof Error ? err.message : "Couldn't load your classrooms.",
        );
      }
    })();
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return <FullPageSpinner />;
  if (!isSignedIn) return <Navigate to="/sign-in" />;

  return (
    <div className="min-h-dvh bg-[#fefcf5]">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-serif text-2xl font-semibold text-[#3d3929] sm:text-3xl">
            Your Classrooms
          </h1>
          <Link
            to="/app/classrooms/new"
            className="inline-flex items-center gap-2 rounded-full bg-[#c88c32] px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f] hover:shadow-md active:scale-[0.98]"
          >
            <PlusIcon />
            Create Classroom
          </Link>
        </div>

        {error && (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="font-serif text-base text-red-800">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setClassrooms(null);
                void getTeacherClassrooms().then(setClassrooms).catch((err) => {
                  setError(err instanceof Error ? err.message : "Couldn't load your classrooms.");
                });
              }}
              className="mt-3 font-sans text-sm font-medium text-red-700 underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {!error && classrooms === null && (
          <div className="mt-16 flex justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
          </div>
        )}

        {!error && classrooms !== null && classrooms.length === 0 && (
          <div className="mt-16 rounded-2xl border border-dashed border-[#c88c32]/30 bg-[#f0d78c]/10 p-10 text-center sm:p-14">
            <h2 className="font-serif text-xl font-semibold text-[#3d3929]">
              Create your first classroom
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#6b6757]">
              A classroom gives your students a private space to respond to the
              daily prompt — you&apos;ll get a join code to share with them, and
              their writing lands here for you to read.
            </p>
            <Link
              to="/app/classrooms/new"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#c88c32] px-6 py-3 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f] hover:shadow-md active:scale-[0.98]"
            >
              <PlusIcon />
              Create your first classroom
            </Link>
          </div>
        )}

        {!error && classrooms !== null && classrooms.length > 0 && (
          <ul className="mt-8 space-y-4">
            {classrooms.map((classroom) => (
              <li
                key={classroom.id}
                className="rounded-2xl border border-[#3d3929]/10 bg-white p-6 shadow-sm transition-all hover:border-[#c88c32]/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      to="/app/classrooms/$classroomId"
                      params={{ classroomId: classroom.id }}
                      className="block"
                    >
                      <h2 className="truncate font-serif text-lg font-semibold text-[#3d3929] transition-colors hover:text-[#a6731f]">
                        {classroom.name}
                      </h2>
                    </Link>
                    <p className="mt-1.5 font-sans text-xs text-[#6b6757]">
                      {classroom.student_count}{" "}
                      {classroom.student_count === 1 ? "student" : "students"} ·{" "}
                      Created {formatDate(classroom.created_at)}
                    </p>
                  </div>
                  <CopyCode code={classroom.code} />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#3d3929]/5 pt-4">
                  <span className="font-mono text-xs tracking-widest text-[#6b6757]/70">
                    {classroom.code}
                  </span>
                  <Link
                    to="/app/classrooms/$classroomId"
                    params={{ classroomId: classroom.id }}
                    className="font-sans text-xs font-semibold text-[#c88c32] transition-colors hover:text-[#a6731f] hover:underline"
                  >
                    View classroom →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
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

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** "2026-08-07T10:00:00Z" -> "Aug 7, 2026" (browser locale). */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
