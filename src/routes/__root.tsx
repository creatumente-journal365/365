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
      { title: "Journal 365 — A prompted journal with one writing prompt per day" },
      { name: "description", content: "Journal 365 eliminates the blank-page problem. One thoughtful prompt per day helps you build a daily writing habit that lasts." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/logo-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;500;600&display=swap" },
    ],
    scripts: [
      {
        src: "https://www.paypal.com/sdk/js?client-id=BAACy9gww_NfZime0ME1YsCFY6ZcqGTh_4a1LyLU6S8ExF5kNjOeFwoaMyPbaerzrEOO6mK9I6nkkE1J3I&components=hosted-buttons&disable-funding=venmo&currency=USD",
      },
    ],
  }),
  notFoundComponent: () => <div>Page not found</div>,
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
        {children}
        <Scripts />
      </body>
    </html>
  );
}
