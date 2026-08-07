import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-start";
import { useState, type FormEvent } from "react";
import { createClassroom } from "~/serverFunctions";
import { AppHeader } from "~/components/AppHeader";

export const Route = createFileRoute("/app/classrooms/new")({
  component: NewClassroom,
});

function NewClassroom() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const classroom = await createClassroom({ data: { name: trimmed } });
      await navigate({
        to: "/app/classrooms/$classroomId",
        params: { classroomId: classroom.id },
      });
    } catch (err) {
      console.error("Failed to create classroom:", err);
      setError(
        err instanceof Error ? err.message : "Couldn't create the classroom.",
      );
      setSubmitting(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#fefcf5]">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#c88c32] border-t-transparent" />
      </div>
    );
  }
  if (!isSignedIn) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#fefcf5]">
        <Link to="/sign-in" className="font-sans text-sm font-medium text-[#c88c32] underline underline-offset-2">
          Sign in to create a classroom
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#fefcf5]">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link
          to="/app/classrooms"
          className="font-sans text-sm font-medium text-[#6b6757] transition-colors hover:text-[#c88c32]"
        >
          ← All classrooms
        </Link>

        <h1 className="mt-6 font-serif text-2xl font-semibold text-[#3d3929] sm:text-3xl">
          Create a classroom
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#6b6757]">
          Name it whatever makes sense for your group. You&apos;ll get a join
          code to share with your students — they can join without an account.
        </p>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-8 rounded-2xl border border-[#3d3929]/10 bg-white p-8 shadow-sm"
        >
          <label
            htmlFor="classroom-name"
            className="block font-sans text-sm font-semibold text-[#3d3929]"
          >
            Classroom name
          </label>
          <input
            id="classroom-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            autoFocus
            placeholder="e.g. Period 3 English"
            className="mt-2 w-full rounded-lg border border-[#3d3929]/15 bg-white px-3 py-2.5 font-sans text-base text-[#3d3929] placeholder:text-[#6b6757]/50 focus:border-[#c88c32] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/20"
          />

          {error && (
            <p className="mt-3 font-sans text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#c88c32] px-6 py-3 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Creating…
              </>
            ) : (
              "Create Classroom"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
