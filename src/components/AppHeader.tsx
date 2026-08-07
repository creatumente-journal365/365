import { Link } from "@tanstack/react-router";
import { SignedIn, SignedOut, UserButton } from "@clerk/tanstack-start";

/**
 * Shared header for the classroom pages (teacher area). Mirrors the /app header
 * styling while adding the Classrooms nav link, which is only meaningful to
 * signed-in users (teachers).
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#3d3929]/10 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="font-serif text-lg font-bold tracking-tight text-[#3d3929]"
        >
          The Daily Draft
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="hidden font-sans text-sm font-medium text-[#6b6757] transition-colors hover:text-[#c88c32] sm:block"
          >
            Home
          </Link>
          <SignedIn>
            <Link
              to="/app/classrooms"
              activeOptions={{ exact: false }}
              activeProps={{ className: "text-[#c88c32]" }}
              className="font-sans text-sm font-medium text-[#6b6757] transition-colors hover:text-[#c88c32]"
            >
              Classrooms
            </Link>
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
