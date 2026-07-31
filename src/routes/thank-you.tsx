import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/thank-you")({
  component: ThankYou,
});

function ThankYou() {
  return (
    <div className="min-h-screen bg-[#fefcf5] font-serif text-[#3d3929]">
      <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center">
        <span className="text-5xl">🎉</span>
        <h1 className="mt-6 font-serif text-3xl font-bold text-[#3d3929] sm:text-4xl">
          Thank you for your purchase!
        </h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-[#6b6757]">
          Choose your format below to get started.
        </p>

        {/* PDF Section */}
        <div className="mt-10 w-full max-w-md rounded-xl border border-[#3d3929]/10 bg-white p-6 text-left shadow-sm">
          <p className="font-sans text-lg font-semibold text-[#3d3929]">
            🖨️ Printable PDF
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#6b6757]">
            Download, print at home, and write by hand.
          </p>
          <a
            href="/journal-365.pdf"
            download
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#c88c32] px-6 py-2.5 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#b07a28] active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download PDF
          </a>
        </div>

        {/* Notion Section */}
        <div className="mt-4 w-full max-w-md rounded-xl border border-[#3d3929]/10 bg-white p-6 text-left shadow-sm">
          <p className="font-sans text-lg font-semibold text-[#3d3929]">
            📓 Notion Template
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#6b6757]">
            Duplicate to your workspace and write from any device.
          </p>
          <a
            href="https://www.notion.so/Journal-365-3ab183e303d4805cbfcfda2776788cf5"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#c88c32] px-6 py-2.5 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#b07a28] active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Open in Notion
          </a>
        </div>

        <p className="mt-8 font-sans text-sm text-[#a09a85]">
          Questions? DM us on{" "}
          <a href="https://www.instagram.com/crea.tu.mente/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#c88c32]">Instagram</a>{" "}
          or{" "}
          <a href="https://www.tiktok.com/@creatumente.journals" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#c88c32]">TikTok</a>.
        </p>
      </div>
    </div>
  );
}
