import { createFileRoute } from "@tanstack/react-router";
import { SignIn } from "@clerk/tanstack-start";

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
});

/**
 * Clerk-hosted sign-in, rendered in-app. Teachers land here when they visit a
 * classroom page signed out; after signing in they return to the classrooms
 * dashboard.
 */
function SignInPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#fefcf5] px-4 py-12">
      <p className="mb-6 font-serif text-2xl font-semibold text-[#3d3929]">
        The Daily Draft
      </p>
      <SignIn fallbackRedirectUrl="/app/classrooms" />
    </div>
  );
}
