import { useState } from "react";

/**
 * Copy-to-clipboard button for a classroom join code. By default it shows the
 * code itself (for cards/lists); pass `label` to show a plain button instead
 * (for pages where the code is already displayed large).
 */
export function CopyCode({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context) — fall back to a
      // hidden textarea + execCommand, the classic approach.
      try {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
      } catch {
        // Nothing left to try — the code is still visible on screen.
        return;
      }
    }
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (label) {
    return (
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy join code ${code}`}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 font-sans text-sm font-semibold transition-all active:scale-[0.98] ${
          copied
            ? "bg-green-600 text-white"
            : "bg-[#c88c32] text-white shadow-sm hover:bg-[#a6731f] hover:shadow-md"
        }`}
      >
        {copied ? "Copied!" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy join code ${code}`}
      title="Copy join code"
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-sm tracking-wider transition-all ${
        copied
          ? "border-green-300 bg-green-50 text-green-700"
          : "border-[#c88c32]/40 bg-[#f0d78c]/20 text-[#3d3929] hover:border-[#c88c32] hover:bg-[#f0d78c]/40"
      }`}
    >
      {copied ? "Copied!" : code}
      {!copied && (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-[#8b6914]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}
