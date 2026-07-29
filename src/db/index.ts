import { neon } from "@neondatabase/serverless";

/**
 * Server-only handle to the team's database (Neon serverless Postgres over HTTP).
 * The connection string comes from `DATABASE_URL`, which is injected into the
 * sandbox and passed to the live host on publish. Resolved lazily so the site
 * still builds and serves before a database is connected.
 *
 * Use only inside a `createServerFn()` handler or `src/routes/api/*` route
 * (never client code).
 */
export const sql = () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — connect a database before running queries.",
    );
  }
  return neon(url);
};

/**
 * Create the Journal 365 database tables if they don't exist.
 * Safe to call on every server start — uses IF NOT EXISTS.
 */
export async function setupDatabase(): Promise<void> {
  try {
    const db = sql();

    await db`
      CREATE TABLE IF NOT EXISTS entries (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     TEXT NOT NULL,
        day         INTEGER NOT NULL CHECK (day >= 1 AND day <= 365),
        content     TEXT NOT NULL DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await db`
      CREATE TABLE IF NOT EXISTS streaks (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         TEXT UNIQUE NOT NULL,
        current_streak  INTEGER NOT NULL DEFAULT 0,
        longest_streak  INTEGER NOT NULL DEFAULT 0,
        last_entry_date DATE
      );
    `;

    // Index for fast lookups by user
    await db`
      CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries (user_id);
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_entries_user_day ON entries (user_id, day);
    `;

    console.log("Database tables verified/created successfully.");
  } catch (err) {
    console.error("Database setup failed:", err);
    throw err;
  }
}
