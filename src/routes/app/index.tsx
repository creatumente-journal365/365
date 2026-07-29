import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SignedIn, SignedOut, useAuth, UserButton } from "@clerk/tanstack-start";
import { useEffect } from "react";

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

function DashboardContent() {
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
          {/* Streak card */}
          <div className="rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm">
            <p className="font-sans text-xs font-medium uppercase tracking-widest text-[#c88c32]">
              Current Streak
            </p>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-serif text-5xl font-bold text-[#3d3929]">
                0
              </span>
              <span className="font-serif text-lg text-[#6b6757]">days</span>
            </div>
            <p className="mt-2 text-sm text-[#6b6757]">
              Start your streak today!
            </p>
          </div>

          {/* Today&apos;s prompt card */}
          <div className="rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm">
            <p className="font-sans text-xs font-medium uppercase tracking-widest text-[#c88c32]">
              Today&apos;s Prompt
            </p>
            <p className="mt-4 font-serif text-lg italic leading-relaxed text-[#3d3929]">
              Your daily prompt will appear here. Check back soon!
            </p>
          </div>
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
