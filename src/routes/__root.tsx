import { ClerkProvider } from "@clerk/tanstack-start";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "The Daily Draft | A writing community for humans, by humans" },
      { name: "description", content: "One daily creative writing prompt, a space to share your response, and a community of real people writing alongside you. No AI, no algorithms, no self-promotion — just humans writing together." },
      { property: "og:title", content: "The Daily Draft | A writing community for humans, by humans" },
      { property: "og:description", content: "One daily creative writing prompt, a space to share your response, and a community of real people writing alongside you. No AI, no algorithms, no self-promotion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;500;600&display=swap" },
    ],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#fefcf5] px-6 text-center">
      <p className="font-serif text-5xl font-bold text-[#c88c32]">404</p>
      <p className="font-serif text-xl text-[#3d3929]">Page not found</p>
      <a href="/" className="font-sans text-sm font-medium text-[#c88c32] underline underline-offset-2">
        Back to The Daily Draft
      </a>
    </div>
  ),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-[#fefcf5] text-[#3d3929] antialiased">
        <ClerkProvider
          publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
        >
          {children}
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  );
}
