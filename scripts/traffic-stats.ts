import { readFile } from "node:fs/promises";

const logPath = `${import.meta.dir}/../.run/access.log`;

type AccessEntry = {
  timestamp?: string;
  method?: string;
  path?: string;
  status?: number;
  userAgent?: string;
  referer?: string;
};

let contents = "";
try {
  contents = await readFile(logPath, "utf8");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log("No access log found. Total requests: 0");
    process.exit(0);
  }
  throw error;
}

const entries = contents
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => {
    try {
      return [JSON.parse(line) as AccessEntry];
    } catch {
      return [];
    }
  });

const now = Date.now();
const countSince = (milliseconds: number) =>
  entries.filter((entry) => {
    const timestamp = Date.parse(entry.timestamp ?? "");
    return Number.isFinite(timestamp) && now - timestamp <= milliseconds;
  }).length;

function topValues(key: "path" | "referer" | "userAgent", limit: number) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const value = entry[key] || "(none)";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function printTable(title: string, values: [string, number][]) {
  console.log(`\n${title}`);
  if (!values.length) {
    console.log("  (none)");
    return;
  }
  for (const [value, count] of values) console.log(`  ${count}\t${value}`);
}

console.log(`Total requests (all time): ${entries.length}`);
console.log(`Requests in last 24 hours: ${countSince(24 * 60 * 60 * 1000)}`);
console.log(`Requests in last 7 days: ${countSince(7 * 24 * 60 * 60 * 1000)}`);
printTable("Top 10 pages by hits", topValues("path", 10));
printTable("Top 5 referrers", topValues("referer", 5));
printTable("Top 5 user agents", topValues("userAgent", 5));
