import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readFile, writeFile } from "node:fs/promises";
import { useEffect, useState } from "react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/tanstack-start";

// ---- Types ----
interface Subscriber {
  email: string;
  timestamp: string;
}

// ---- Server function: email capture ----
const subscribe = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid data");
    }
    const { email } = data as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new Error("Please provide a valid email address.");
    }
    return { email: email.trim().toLowerCase() };
  })
  .handler(async ({ data }) => {
    const filePath = "/home/team/shared/subscribers.json";
    let subscribers: Subscriber[] = [];
    try {
      const raw = await readFile(filePath, "utf8");
      subscribers = JSON.parse(raw);
      if (!Array.isArray(subscribers)) subscribers = [];
    } catch {
      // File doesn't exist yet — start fresh
    }

    // Don't duplicate
    const exists = subscribers.some((s) => s.email === data.email);
    if (!exists) {
      subscribers.push({
        email: data.email,
        timestamp: new Date().toISOString(),
      });
      await writeFile(filePath, JSON.stringify(subscribers, null, 2) + "\n");
    }

    return { success: true, alreadySubscribed: exists };
  });

// ---- Sample prompts ----
const samplePrompts = [
  {
    number: 12,
    text: "What would you do differently if you knew nobody would judge you?",
  },
  {
    number: 47,
    text: "Describe a moment from this week that you want to remember ten years from now.",
  },
  {
    number: 83,
    text: "What's a belief you held strongly five years ago that you've since changed your mind about?",
  },
  {
    number: 156,
    text: "Write a letter to your future self one year from now. What do you hope they remember?",
  },
  {
    number: 204,
    text: "What is the kindest thing someone has done for you — and have you ever thanked them for it?",
  },
  {
    number: 319,
    text: "If you could spend one hour with anyone, living or gone, what would you ask them?",
  },
];

// ---- Steps ----
const steps = [
  {
    number: 1,
    title: "Open your journal",
    description:
      "Each page has a prompt waiting for you — no staring at a blank page wondering what to write.",
  },
  {
    number: 2,
    title: "Read the daily prompt",
    description:
      "A single, thoughtful question or idea that invites reflection. Just enough to get you started.",
  },
  {
    number: 3,
    title: "Write freely",
    description:
      "Write freely — on paper, in Notion, or in your browser. No wrong answers, just your thoughts.",
  },
];

// ---- Formats ----
const formats = [
  {
    icon: "🖨️",
    name: "Printable PDF",
    description:
      "For the pen-and-paper crowd. Print at home and write by hand. One-time purchase, yours forever.",
    pricing: "One-time purchase",
  },
  {
    icon: "📓",
    name: "Notion Template",
    description:
      "Syncs across all your devices. Interactive daily prompts inside Notion. One-time purchase.",
    pricing: "One-time purchase",
  },
  {
    icon: "💻",
    name: "Web App",
    description:
      "Daily prompts delivered in your browser. Track your streak, get reminders. Free during beta — no credit card required.",
    pricing: "Free during beta",
  },
];

// ---- Route ----
export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-dvh">
      <Hero />
      <HowItWorks />
      <ChooseFormat />
      <SamplePrompts />
      <EmailCapture />
      <Footer />
    </div>
  );
}

// ---- Hero ----
function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-24 sm:pt-32 lg:px-8">
      {/* Subtle decorative element */}
      <div
        aria-hidden
        className="absolute -top-24 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[#f0d78c]/20 blur-3xl"
      />

      {/* Auth nav row */}
      <div className="relative mx-auto flex max-w-3xl items-center justify-end gap-3 pb-4">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="font-sans text-sm font-medium text-[#6b6757] transition-colors hover:text-[#3d3929]">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="rounded-lg bg-[#c88c32] px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#b07a28] active:scale-[0.98]">
              Sign up
            </button>
          </SignUpButton>
        </SignedOut>
        <SignedIn>
          <Link
            to="/app"
            className="font-sans text-sm font-medium text-[#c88c32] transition-colors hover:text-[#b07a28]"
          >
            Dashboard
          </Link>
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

      <div className="relative mx-auto max-w-3xl text-center">
        <img
          src="/logo-wordmark.png"
          alt="Journal 365"
          className="mx-auto mb-6 h-10 w-auto sm:h-12"
        />
        <span className="inline-block rounded-full border border-[#c88c32]/30 bg-[#f0d78c]/20 px-4 py-1.5 font-serif text-sm italic tracking-wide text-[#c88c32]">
          365 prompts. One year. Your story.
        </span>

        <h1 className="mt-8 text-4xl font-bold leading-tight tracking-tight text-[#3d3929] sm:text-6xl lg:text-7xl">
          The journal where every page
          <br />
          <span className="text-[#c88c32]">already has a topic.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#6b6757] sm:text-xl">
          Journal 365 gives you one thoughtful prompt per day, in whichever
          format works for you — print it, sync it, or open it in your browser.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="#formats"
            className="inline-block rounded-lg bg-[#c88c32] px-8 py-4 font-sans text-base font-semibold text-white shadow-md transition-all hover:bg-[#b07a28] hover:shadow-lg active:scale-[0.98]"
          >
            Get the PDF
          </a>
          <SignedOut>
            <SignUpButton mode="modal">
              <button className="inline-block rounded-lg border-2 border-[#c88c32] bg-white px-8 py-4 font-sans text-base font-semibold text-[#c88c32] shadow-sm transition-all hover:bg-[#fef9f0] active:scale-[0.98]">
                Try the free beta
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              to="/app"
              className="inline-block rounded-lg border-2 border-[#c88c32] bg-white px-8 py-4 font-sans text-base font-semibold text-[#c88c32] shadow-sm transition-all hover:bg-[#fef9f0] active:scale-[0.98]"
            >
              Go to your dashboard
            </Link>
          </SignedIn>
        </div>
      </div>
    </section>
  );
}

// ---- How It Works ----
function HowItWorks() {
  return (
    <section className="border-y border-[#3d3929]/10 bg-[#f5f0e3] px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-serif text-3xl font-bold tracking-tight text-[#3d3929] sm:text-4xl">
          How it works
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-[#6b6757]">
          Three simple steps to build a daily writing habit you'll actually keep.
        </p>

        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#c88c32] font-serif text-2xl font-bold text-white shadow-sm">
                {step.number}
              </div>
              <h3 className="mt-5 font-serif text-xl font-semibold text-[#3d3929]">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[#6b6757]">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Choose Your Format ----
function ChooseFormat() {
  useEffect(() => {
    const initPayPal = () => {
      if ((window as any).paypal) {
        (window as any).paypal.HostedButtons({
          hostedButtonId: "544MQ4PAPHGDS",
        }).render("#paypal-container-544MQ4PAPHGDS");

        (window as any).paypal.HostedButtons({
          hostedButtonId: "XZXP9C3DXRFL8",
        }).render("#paypal-container-XZXP9C3DXRFL8");
      } else {
        setTimeout(initPayPal, 200);
      }
    };
    initPayPal();
  }, []);

  return (
    <section id="formats" className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-serif text-3xl font-bold tracking-tight text-[#3d3929] sm:text-4xl">
          Choose your format
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-[#6b6757]">
          The same 365 prompts — pick the format that fits your life.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {formats.map((fmt) => (
            <div
              key={fmt.name}
              className="group flex flex-col rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm transition-all hover:shadow-md"
            >
              <span className="text-3xl" role="img" aria-label={fmt.name}>
                {fmt.icon}
              </span>
              <h3 className="mt-4 font-serif text-xl font-semibold text-[#3d3929]">
                {fmt.name}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[#6b6757]">
                {fmt.description}
              </p>
              {fmt.name === "Printable PDF" ? (
                <div className="mt-4 space-y-3">
                  <span className="inline-block rounded-full border border-[#c88c32]/30 bg-[#f0d78c]/20 px-3 py-1 font-sans text-xs font-medium text-[#c88c32]">
                    {fmt.pricing}
                  </span>
                  <div id="paypal-container-544MQ4PAPHGDS"></div>
                </div>
              ) : fmt.name === "Notion Template" ? (
                <div className="mt-4 space-y-3">
                  <span className="inline-block rounded-full border border-[#c88c32]/30 bg-[#f0d78c]/20 px-3 py-1 font-sans text-xs font-medium text-[#c88c32]">
                    {fmt.pricing}
                  </span>
                  <div id="paypal-container-XZXP9C3DXRFL8"></div>
                  <a
                    href="https://www.notion.so/Journal-365-3ab183e303d4805cbfcfda2776788cf5"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-sans text-sm font-medium text-[#c88c32] underline underline-offset-2 transition-colors hover:text-[#b07a28]"
                  >
                    View template
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <span className="inline-block rounded-full border border-green-300 bg-green-50 px-3 py-1 font-sans text-xs font-medium text-green-700">
                    {fmt.pricing}
                  </span>
                  <SignedOut>
                    <SignUpButton mode="modal">
                      <button className="inline-flex items-center gap-1.5 rounded-lg bg-[#c88c32] px-4 py-2.5 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#b07a28] active:scale-[0.98]">
                        Start writing for free
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                      </button>
                    </SignUpButton>
                  </SignedOut>
                  <SignedIn>
                    <Link
                      to="/app"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#c88c32] px-4 py-2.5 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#b07a28] active:scale-[0.98]"
                    >
                      Go to your dashboard
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>
                  </SignedIn>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Sample Prompts ----
function SamplePrompts() {
  return (
    <section className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-serif text-3xl font-bold tracking-tight text-[#3d3929] sm:text-4xl">
          A taste of what's inside
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-[#6b6757]">
          Every prompt is crafted to spark reflection, not intimidate. Here are a
          few from the journal:
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {samplePrompts.map((prompt) => (
            <div
              key={prompt.number}
              className="group rounded-xl border border-[#3d3929]/10 bg-white p-6 shadow-sm transition-all hover:shadow-md"
            >
              <span className="font-mono text-xs font-medium uppercase tracking-widest text-[#c88c32]">
                Day {prompt.number}
              </span>
              <p className="mt-3 font-serif text-lg italic leading-relaxed text-[#3d3929]">
                &ldquo;{prompt.text}&rdquo;
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Email Capture ----
function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      await subscribe({ data: { email } });
      setStatus("success");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    }
  };

  return (
    <section
      id="notify"
      className="border-t border-[#3d3929]/10 bg-[#f5f0e3] px-6 py-20 lg:px-8"
    >
      <div className="mx-auto max-w-xl text-center">
        <h2 className="font-serif text-3xl font-bold tracking-tight text-[#3d3929] sm:text-4xl">
          Stay in the loop
        </h2>
        <p className="mt-3 text-[#6b6757]">
          Journal 365 is available now in three formats — and we have more on the
          way. Drop your email for updates on new themed packs, features, and
          special offers. No spam, ever.
        </p>

        {status === "success" ? (
          <div className="mt-8 rounded-xl border border-green-200 bg-green-50 px-6 py-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-7 w-7 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <h3 className="mt-4 font-serif text-xl font-semibold text-green-800">
              You&rsquo;re on the list!
            </h3>
            <p className="mt-2 text-sm text-green-700">
              Thank you! We&rsquo;ll keep you posted on new prompts and features.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "loading"}
                className="flex-1 rounded-lg border border-[#3d3929]/20 bg-white px-4 py-3.5 font-sans text-base text-[#3d3929] placeholder:text-[#6b6757]/50 focus:border-[#c88c32] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="rounded-lg bg-[#c88c32] px-6 py-3.5 font-sans text-base font-semibold text-white shadow-sm transition-all hover:bg-[#b07a28] active:scale-[0.98] disabled:opacity-60"
              >
                {status === "loading" ? "Subscribing…" : "Notify Me"}
              </button>
            </div>
            {status === "error" && (
              <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

// ---- Footer ----
function Footer() {
  return (
    <footer className="border-t border-[#3d3929]/10 px-6 py-8">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 text-sm text-[#6b6757] sm:flex-row">
        <p>&copy; {new Date().getFullYear()} Create Your Mind. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <a
            href="https://www.instagram.com/crea.tu.mente/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6b6757] transition-colors hover:text-[#c88c32]"
            aria-label="Instagram"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
          </a>
          <a
            href="https://www.tiktok.com/@creatumente.journals"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6b6757] transition-colors hover:text-[#c88c32]"
            aria-label="TikTok"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>
          </a>
        </div>
        <img
          src="/logo-wordmark.png"
          alt="Journal 365"
          className="h-7 w-auto opacity-70"
        />
      </div>
    </footer>
  );
}
