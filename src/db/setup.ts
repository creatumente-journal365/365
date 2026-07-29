/**
 * One-shot migration script. Run with:
 *   bun run src/db/setup.ts
 */
import { setupDatabase } from "./index.js";

async function main() {
  console.log("Running database setup...");
  await setupDatabase();
  console.log("Setup complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
