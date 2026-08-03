import { neon } from "@neondatabase/serverless";

/**
 * Server-only handle to the team's database (Neon serverless Postgres over HTTP).
 * The connection string comes from `NEON_DATABASE_URL`, which is injected into the
 * sandbox and passed to the live host on publish. Resolved lazily so the site
 * still builds and serves before a database is connected.
 *
 * Use only inside a `createServerFn()` handler or `src/routes/api/*` route
 * (never client code).
 */
export const sql = () => {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) {
    throw new Error(
      "NEON_DATABASE_URL is not set — connect a database before running queries.",
    );
  }
  return neon(url);
};

/**
 * Create the Create Your Mind database tables if they don't exist.
 * Safe to call on every server start — uses IF NOT EXISTS.
 *
 * Note: `author_name` is a small extension to the original MVP schema so the
 * community page can display who wrote each response (guests included) without
 * needing a reverse lookup on opaque Clerk user IDs.
 */
export async function setupDatabase(): Promise<void> {
  const db = sql();

  await db`
    CREATE TABLE IF NOT EXISTS prompts (
      id SERIAL PRIMARY KEY,
      day DATE NOT NULL UNIQUE,
      prompt_text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await db`
    CREATE TABLE IF NOT EXISTS responses (
      id SERIAL PRIMARY KEY,
      prompt_id INTEGER REFERENCES prompts(id),
      user_id TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT 'Anonymous',
      content TEXT NOT NULL,
      word_count INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Fast lookup of a day's responses
  await db`
    CREATE INDEX IF NOT EXISTS idx_responses_prompt_id ON responses (prompt_id);
  `;

  // Likes on responses — one per user per response.
  await db`
    CREATE TABLE IF NOT EXISTS response_likes (
      id SERIAL PRIMARY KEY,
      response_id INTEGER REFERENCES responses(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(response_id, user_id)
    );
  `;
  await db`
    CREATE INDEX IF NOT EXISTS idx_response_likes_response_id
    ON response_likes (response_id);
  `;

  // Comments on responses (quiet margin conversation, not a feed).
  await db`
    CREATE TABLE IF NOT EXISTS response_comments (
      id SERIAL PRIMARY KEY,
      response_id INTEGER REFERENCES responses(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await db`
    CREATE INDEX IF NOT EXISTS idx_response_comments_response_id
    ON response_comments (response_id);
  `;

  console.log("Database tables verified/created successfully.");
}
