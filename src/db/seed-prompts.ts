import { sql } from "./index.js";

/**
 * The first 30 daily creative writing prompts for the Create Your Mind
 * community. Deliberately diverse: scene starters, dialogue, character-driven,
 * sci-fi, fantasy, literary, and a few that bend genres.
 *
 * Seeding strategy: each prompt is anchored to a calendar day (prompts.day is
 * UNIQUE). `seedPrompts()` inserts the list starting from today, skipping any
 * day already present (ON CONFLICT DO NOTHING), so re-running is idempotent and
 * a server restart simply extends the window forward by the days that passed.
 */
export const PROMPTS: string[] = [
  "The door had been locked for eleven years. This morning, it was ajar.",
  "Write a short scene where a person discovers their reflection is one second behind.",
  "Two strangers on a night bus are the only ones who saw the same impossible thing. Write their conversation.",
  "A village baker discovers her bread can reveal the true name of anyone who eats it.",
  "Describe a character only through the contents of their pockets or bag — no direct description.",
  "Write about a moment when a house felt like a person.",
  "The last librarian on Earth is digitizing the final physical books. She finds one she wrote.",
  "A parent and child switch roles for one day. Write their first conversation as the switch begins.",
  "\"The invitation said to bring nothing, so of course she brought everything.\" Continue.",
  "A dragon has to file its taxes in human form and is losing its mind over the paperwork.",
  "Write about someone who always leaves parties early — and the one party they stayed for.",
  "A letter that was never sent finds its way home. Write what happens when it arrives.",
  "Time travel exists, but it only lets you visit waiting rooms.",
  "Two ex-friends meet in a grocery store checkout line during a power outage.",
  "The storm knocked out the lights, and in the dark, someone began to sing.",
  "The prophecy says the chosen one will be born under the harvest moon. The baby is born in spring, and the prophecy is wrong.",
  "Write a villain's morning routine.",
  "Describe grief as a room you keep rearranging.",
  "A child asks their grandparent what the world was like before the internet. The answer surprises them.",
  "A robot caretaker learns what \"goodbye\" means.",
  "Everyone in the village could remember tomorrow — except the one person who had to live it.",
  "A knight who is terrified of everything is sent on the kingdom's most dangerous quest.",
  "Write about a character who lies only about small, useless things — and why.",
  "In a seaside town, everyone's dreams wash up on the beach each morning. Write what one character finds.",
  "Two colleagues share an elevator that stops between floors. They have never spoken before.",
  "The radio plays a song that hasn't been recorded yet.",
  "A space station's AI develops a sense of humor on the eve of a dangerous mission.",
  "Write about the one object your character would save from a fire — and the one they'd secretly let burn.",
  "A mirror that shows you not who you are, but who you could have been.",
  "The last conversation between a lighthouse keeper and the sea.",
];

/**
 * Insert the prompt list starting from `startDate` (defaults to today, UTC).
 * Idempotent: days that already exist are left untouched.
 * Returns the number of prompts considered (not necessarily inserted).
 */
export async function seedPrompts(startDate: Date = new Date()): Promise<number> {
  const db = sql();
  const anchor = startDate.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  for (let i = 0; i < PROMPTS.length; i++) {
    const d = new Date(`${anchor}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const day = d.toISOString().slice(0, 10);

    await db`
      INSERT INTO prompts (day, prompt_text)
      VALUES (${day}, ${PROMPTS[i]})
      ON CONFLICT (day) DO NOTHING
    `;
  }

  return PROMPTS.length;
}

// Allow running directly: `bun run src/db/seed-prompts.ts`
if (import.meta.main) {
  const n = await seedPrompts();
  console.log(`Seeded ${n} prompts (starting today, UTC).`);
  process.exit(0);
}
