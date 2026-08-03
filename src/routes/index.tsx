import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { readFile, writeFile } from "node:fs/promises";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Subscriber {
  email: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Server function: email capture
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-dvh">
      <Nav />
      <Hero />
      <WhyJoin />
      <HowItWorks />
      <CommunityPromise />
      <SocialProof />
      <StayInTouch />
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#3d3929]/10 bg-[#fefcf5]/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <a href="/" className="font-serif text-lg font-bold tracking-tight text-[#3d3929]">
          The Daily Draft
        </a>
        <nav className="hidden items-center gap-8 font-sans text-sm font-medium text-[#6b6757] sm:flex">
          <a href="#how-it-works" className="transition-colors hover:text-[#c88c32]">
            How it works
          </a>
          <a href="#why-join" className="transition-colors hover:text-[#c88c32]">
            Why join
          </a>
          <Link
            to="/app"
            className="rounded-full bg-[#c88c32] px-4 py-2 font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f]"
          >
            Start writing
          </Link>
        </nav>
        <Link
          to="/app"
          className="rounded-full bg-[#c88c32] px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f] sm:hidden"
        >
          Start writing
        </Link>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-20 sm:pt-28 lg:px-8">
      <div
        aria-hidden
        className="absolute -top-24 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[#f0d78c]/20 blur-3xl"
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <span className="inline-block rounded-full border border-[#c88c32]/30 bg-[#f0d78c]/20 px-4 py-1.5 font-serif text-sm italic tracking-wide text-[#c88c32]">
          A daily writing ritual for real people
        </span>

        <h1 className="mt-8 text-4xl font-bold leading-tight tracking-tight text-[#3d3929] sm:text-6xl">
          Your words belong in a room
          <br />
          <span className="text-[#c88c32]">with other human minds.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#6b6757] sm:text-xl">
          One creative prompt. A few hundred words. A community writing
          alongside you. The Daily Draft is a warm, low-pressure place to make
          something real and discover what other people imagined from the same
          starting point.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/app"
            className="inline-block rounded-lg bg-[#c88c32] px-8 py-4 font-sans text-base font-semibold text-white shadow-md transition-all hover:bg-[#a6731f] hover:shadow-lg active:scale-[0.98]"
          >
            Start writing — free during beta
          </Link>
        </div>
        <p className="mt-5 font-sans text-sm text-[#6b6757]">
          Be part of the first group of writers. No pressure to be perfect —
          just a reason to write.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Why join — value proposition
// ---------------------------------------------------------------------------

const valueProps = [
  {
    title: "Writing feels better together.",
    body: "The internet is full of content. What's harder to find is a small moment of genuine human imagination: a person noticing something, feeling something, and putting it into words. We're building a community where that kind of creativity gets time, attention, and company.",
  },
  {
    title: "One prompt to get you moving.",
    body: "A fresh creative writing prompt arrives every day. It might take you somewhere tender, strange, funny, or unexpected. No blank-page spiral and no need to plan a novel — just a starting point and a few minutes to see where it leads.",
  },
  {
    title: "Share the piece you made.",
    body: "Write a short response within a friendly word limit, then post it to the day's conversation. You don't need to call yourself a writer or have a polished draft. Bring the idea that surprised you and the sentence you're glad you followed.",
  },
  {
    title: "Read a hundred different possibilities.",
    body: "Everyone begins with the same prompt; no two people take it to the same place. Read what other writers saw in it, leave a thoughtful reaction, and feel the quiet encouragement of people making something alongside you.",
  },
];

function WhyJoin() {
  return (
    <section id="why-join" className="border-y border-[#3d3929]/10 bg-[#f5f0e3] px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-serif text-3xl font-bold tracking-tight text-[#3d3929] sm:text-4xl">
          Why join
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-[#6b6757]">
          A small, welcoming room where your imagination gets company.
        </p>
        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {valueProps.map((vp) => (
            <div
              key={vp.title}
              className="rounded-2xl border border-[#3d3929]/10 bg-white p-8 shadow-sm transition-all hover:shadow-md"
            >
              <h3 className="font-serif text-xl font-semibold text-[#3d3929]">
                {vp.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[#6b6757]">
                {vp.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const steps = [
  {
    number: "01",
    title: "A prompt drops",
    description: "Each day starts with one new creative invitation for the community.",
  },
  {
    number: "02",
    title: "You write",
    description: "Take a few minutes and respond in your own voice. Short, honest, unfinished, or strange is welcome.",
  },
  {
    number: "03",
    title: "We read together",
    description: "Share your piece, discover the other responses, and join the conversation around the prompt.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-serif text-3xl font-bold tracking-tight text-[#3d3929] sm:text-4xl">
          How it works
        </h2>
        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#c88c32] font-mono text-lg font-bold text-white shadow-sm">
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

// ---------------------------------------------------------------------------
// Community promise
// ---------------------------------------------------------------------------

function CommunityPromise() {
  return (
    <section className="border-y border-[#3d3929]/10 bg-[#f5f0e3] px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-3xl font-bold tracking-tight text-[#3d3929] sm:text-4xl">
          Human creativity is worth protecting.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-[#6b6757]">
          The Daily Draft is not a publishing contest, a critique room, or a
          machine-made content feed. It&rsquo;s a place for people to show up,
          experiment, and be surprised by one another. You can write for the joy
          of it, even when you have nothing to prove.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Social proof placeholder
// ---------------------------------------------------------------------------

function SocialProof() {
  return (
    <section className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-3xl font-bold tracking-tight text-[#3d3929] sm:text-4xl">
          Words from the writers who find us
        </h2>
        <p className="mt-3 text-[#6b6757]">
          We&rsquo;re gathering the first stories from our early community. Soon,
          you&rsquo;ll see notes from writers about the prompts that stayed with
          them, the pieces they never expected to write, and the people they met
          along the way.
        </p>
        <blockquote className="mt-10 rounded-2xl border border-[#3d3929]/10 bg-white p-10 shadow-sm">
          <p className="font-serif text-xl italic leading-relaxed text-[#3d3929]">
            &ldquo;A future community member will share what writing together has
            meant to them.&rdquo;
          </p>
          <footer className="mt-4 font-sans text-sm font-medium text-[#6b6757]">
            — Early member, coming soon
          </footer>
        </blockquote>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stay in touch
// ---------------------------------------------------------------------------

function StayInTouch() {
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
      id="stay-in-touch"
      className="border-t border-[#3d3929]/10 bg-[#f5f0e3] px-6 py-20 lg:px-8"
    >
      <div className="mx-auto max-w-xl text-center">
        <h2 className="font-serif text-3xl font-bold tracking-tight text-[#3d3929] sm:text-4xl">
          Stay in the loop
        </h2>
        <p className="mt-3 text-[#6b6757]">
          Get an occasional note when new features drop or the community hits a
          milestone. No spam, no daily marketing.
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="mt-4 font-serif text-xl font-semibold text-green-800">
              You&rsquo;re on the list.
            </h3>
            <p className="mt-2 text-sm text-green-700">
              We&rsquo;ll reach out when something worth sharing happens.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "loading"}
                className="flex-1 rounded-lg border border-[#3d3929]/20 bg-white px-4 py-3.5 font-sans text-base text-[#3d3929] placeholder:text-[#6b6757]/50 focus:border-[#c88c32] focus:outline-none focus:ring-2 focus:ring-[#c88c32]/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="rounded-lg bg-[#c88c32] px-6 py-3.5 font-sans text-base font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f] active:scale-[0.98] disabled:opacity-60"
              >
                {status === "loading" ? "Subscribing…" : "Keep me posted"}
              </button>
            </div>
            {status === "error" && (
              <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
            )}
            <p className="mt-4 font-sans text-xs text-[#6b6757]">
              Unsubscribe anytime. We&rsquo;ll only write when there&rsquo;s real
              news from The Daily Draft.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-[#3d3929]/10 px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="max-w-xs">
          <p className="font-serif text-base font-bold text-[#3d3929]">
            The Daily Draft
          </p>
          <p className="mt-2 font-sans text-xs leading-relaxed text-[#6b6757]">
            A daily creative writing community for people who want to write,
            share, and read alongside real human beings. One prompt at a time.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 sm:items-end">
          <div className="flex items-center gap-4 font-sans text-sm text-[#6b6757]">
            <a
              href="https://instagram.com/crea.tu.mente"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[#c88c32]"
            >
              Instagram
            </a>
            <a
              href="https://tiktok.com/@creatumente.journals"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[#c88c32]"
            >
              TikTok
            </a>
            <a
              href="#stay-in-touch"
              className="font-semibold text-[#c88c32] transition-colors hover:text-[#a6731f]"
            >
              Stay in touch
            </a>
          </div>
          <p className="font-sans text-xs text-[#6b6757]/70">
            &copy; {new Date().getFullYear()} The Daily Draft. Made for human creativity.
          </p>
        </div>
      </div>
    </footer>
  );
}
