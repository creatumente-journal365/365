import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/pricing")({
  component: Pricing,
});

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

interface Tier {
  name: string;
  price: string;
  sub: string;
  highlight: boolean;
  features: { included: boolean; label: string; detail?: string }[];
  cta: { label: string; to: string };
}

const tiers: Tier[] = [
  {
    name: "Free",
    price: "$0",
    sub: "Forever. No card required.",
    highlight: false,
    features: [
      { included: true, label: "Daily creative writing prompt" },
      { included: true, label: "Write 1 response per day", detail: "500-word limit" },
      { included: true, label: "Read all community responses" },
      { included: true, label: "Like responses" },
      { included: true, label: "Guest or account access" },
      { included: false, label: "Unlimited daily responses" },
      { included: false, label: "Comment on responses" },
      { included: false, label: "Browse prompt archive" },
      { included: false, label: "Chain stories" },
      { included: false, label: "Monthly book club" },
    ],
    cta: { label: "Start writing free", to: "/app" },
  },
  {
    name: "Premium",
    price: "$5",
    sub: "/month. Cancel anytime.",
    highlight: true,
    features: [
      { included: true, label: "Everything in Free, plus:" },
      { included: true, label: "Unlimited daily responses" },
      { included: true, label: "Comment on any response", detail: "Start conversations, not just like" },
      { included: true, label: "Full prompt archive", detail: "Revisit and write to past prompts" },
      { included: true, label: "Chain stories", detail: "Write collaboratively, one turn at a time" },
      { included: true, label: "Monthly book club", detail: "Read and discuss craft books together" },
      { included: true, label: "Early access to new features" },
      { included: true, label: "Premium badge on your profile" },
    ],
    cta: { label: "Join the waitlist", to: "/#stay-in-touch" },
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function Pricing() {
  return (
    <div className="min-h-dvh bg-[#fefcf5]">
      <Nav />
      <Header />
      <Tiers />
      <WhyFreeFirst />
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
        <nav className="flex items-center gap-6 font-sans text-sm font-medium text-[#6b6757]">
          <a href="/#how-it-works" className="hidden transition-colors hover:text-[#c88c32] sm:inline">
            How it works
          </a>
          <Link
            to="/app"
            className="rounded-full bg-[#c88c32] px-4 py-2 font-semibold text-white shadow-sm transition-all hover:bg-[#a6731f]"
          >
            Start writing
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header() {
  return (
    <section className="px-6 pb-12 pt-16 text-center lg:px-8">
      <h1 className="font-serif text-4xl font-bold tracking-tight text-[#3d3929] sm:text-5xl">
        Simple, honest pricing
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-[#6b6757]">
        Free during beta. When we launch paid tiers, it'll be because the
        community has proven it's worth paying for — and you'll know it because
        you were here first.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tier cards
// ---------------------------------------------------------------------------

function Tiers() {
  return (
    <section className="px-6 pb-24 lg:px-8">
      <div className="mx-auto grid max-w-3xl gap-8 sm:grid-cols-2">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative rounded-2xl border p-8 shadow-sm ${
              tier.highlight
                ? "border-[#c88c32]/40 bg-white ring-1 ring-[#c88c32]/20"
                : "border-[#3d3929]/10 bg-white"
            }`}
          >
            {tier.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#c88c32] px-4 py-1 font-sans text-xs font-semibold text-white">
                Recommended
              </span>
            )}

            <h2 className="font-serif text-2xl font-bold text-[#3d3929]">
              {tier.name}
            </h2>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-serif text-4xl font-bold text-[#3d3929]">
                {tier.price}
              </span>
              {tier.price !== "$0" && (
                <span className="font-sans text-sm text-[#6b6757]">{tier.sub}</span>
              )}
            </div>
            {tier.price === "$0" && (
              <p className="mt-1 font-sans text-sm text-[#6b6757]">{tier.sub}</p>
            )}

            <Link
              to={tier.cta.to}
              className={`mt-6 block w-full rounded-lg px-6 py-3 text-center font-sans text-sm font-semibold shadow-sm transition-all active:scale-[0.98] ${
                tier.highlight
                  ? "bg-[#c88c32] text-white hover:bg-[#a6731f] hover:shadow-md"
                  : "border border-[#3d3929]/20 bg-white text-[#3d3929] hover:border-[#c88c32]/40 hover:text-[#c88c32]"
              }`}
            >
              {tier.cta.label}
            </Link>

            <ul className="mt-8 space-y-3">
              {tier.features.map((f) => (
                <li key={f.label} className="flex items-start gap-3 font-sans text-sm">
                  {f.included ? (
                    <svg
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#c88c32]"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#d4cfc4]"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={f.included ? "text-[#3d3929]" : "text-[#b8b3a6]"}>
                    {f.label}
                    {f.detail && (
                      <span className="mt-0.5 block text-xs text-[#6b6757]">{f.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Why free first
// ---------------------------------------------------------------------------

function WhyFreeFirst() {
  return (
    <section className="border-t border-[#3d3929]/10 bg-[#f5f0e3] px-6 py-16 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-2xl font-bold tracking-tight text-[#3d3929] sm:text-3xl">
          Why free during beta?
        </h2>
        <p className="mt-4 leading-relaxed text-[#6b6757]">
          We won't ask for your money until we've earned it. The first writers
          who show up, write, and come back are the ones who'll shape what this
          community becomes. When we launch Premium, you'll already know whether
          it's worth it — because you'll have lived it.
        </p>
        <p className="mt-3 leading-relaxed text-[#6b6757]">
          No bait-and-switch. No "try it free then we charge you." Just an
          honest community growing at its own pace.
        </p>
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
            <Link to="/pricing" className="font-semibold text-[#c88c32] transition-colors hover:text-[#a6731f]">
              Pricing
            </Link>
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
              href="/#stay-in-touch"
              className="transition-colors hover:text-[#c88c32]"
            >
              Stay in touch
            </a>
          </div>
          <p className="font-sans text-xs text-[#6b6757]">
            &copy; {new Date().getFullYear()} The Daily Draft
          </p>
        </div>
      </div>
    </footer>
  );
}
