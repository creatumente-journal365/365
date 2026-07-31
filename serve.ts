// Production server for the built site. The TanStack Start build emits a portable
// fetch handler (dist/server/server.js) plus static client assets (dist/client);
// this wraps them in a Bun server on port 3000 — static files first, SSR for the
// rest. Run `bun run build` before starting. Restart it with `bun run publish`.
//
// Starting a new instance supersedes the old one: it frees the port no matter
// which user owns the current server (provisioning starts it as `engine`; a team
// member's `bun run publish` runs as their own user), so publish never collides
// with an already-running server. Every sandbox user has passwordless sudo, so
// the takeover works across user boundaries.
import { appendFile, mkdir } from "node:fs/promises";
import handler from "./dist/server/server.js";
import { setupDatabase } from "./src/db/index.js";
import { startNotificationScheduler } from "./src/notifications/scheduler.js";

// Run database migration on startup
try {
  await setupDatabase();
  console.log("Database setup complete.");
} catch (err) {
  console.warn("Database setup skipped (DB may not be connected yet):", err);
}

// Pinned, NOT read from the environment. The published preview URL
// (<label>.<PUBLIC_SITE_DOMAIN>) is reverse-proxied to 0.0.0.0:3000 inside the
// sandbox, so the default site MUST bind there. Bun auto-loads .env files, so
// honouring process.env.PORT/HOST would let a stray env var or a .env in the site
// dir silently move the site off :3000 (or onto loopback) and break the public URL.
const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;
const ACCESS_LOG = `${import.meta.dir}/.run/access.log`;

await mkdir(`${import.meta.dir}/.run`, { recursive: true });

async function logRequest(req: Request, response: Response) {
  const url = new URL(req.url);
  const entry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: url.pathname,
    status: response.status,
    userAgent: req.headers.get("user-agent") ?? "",
    referer: req.headers.get("referer") ?? "",
  };

  try {
    await appendFile(ACCESS_LOG, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.warn("Request log write failed:", err);
  }
}

// Free PORT regardless of which user owns the current listener. lsof runs under
// sudo so it can see (and the kill can signal) a process owned by another user;
// the loop waits for the socket to actually release before we bind.
const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

// Take over the port, re-freeing and retrying if another publish grabbed it in the
// gap between freeing and binding (last publish wins). Bun.serve throws EADDRINUSE
// synchronously, so without this a raced publish would die while the shell already
// reported success.
for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const { pathname } = new URL(req.url);
        let response: Response;
        // Serve the PDF for owner review
        if (pathname === "/api/preview-pdf") {
          const pdf = Bun.file("/home/team/shared/journal-365.pdf");
          response = await pdf.exists()
            ? new Response(pdf, {
                headers: {
                  "Content-Type": "application/pdf",
                  "Content-Disposition": 'attachment; filename="journal-365.pdf"',
                },
              })
            : new Response("PDF not found", { status: 404 });
        } else if (pathname !== "/") {
          const file = Bun.file(CLIENT_DIR + pathname);
          response = (await file.exists())
            ? new Response(file)
            : await (
                handler as { fetch: (r: Request) => Response | Promise<Response> }
              ).fetch(req);
        } else {
          response = await (
            handler as { fetch: (r: Request) => Response | Promise<Response> }
          ).fetch(req);
        }
        await logRequest(req, response);
        return response;
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

console.log(`team-site serving on http://${HOST}:${String(PORT)}`);

// Start the push notification scheduler for daily reminders
try {
  startNotificationScheduler();
} catch (err) {
  console.warn("Notification scheduler skipped (VAPID keys may not be configured):", err);
}
