import path from "node:path";
import { readdirSync, accessSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Clerk's @clerk/shared uses wildcard exports ("./*") that Vite/Rollup
// can't resolve during the client build. This plugin catches any
// @clerk/shared/<name> import and maps it to the actual file on disk.
function clerkSharedResolve(): Plugin {
  let sharedRoot: string;
  return {
    name: "clerk-shared-resolve",
    enforce: "pre",
    configResolved() {
      sharedRoot = path.resolve(
        __dirname,
        "node_modules/@clerk/shared/dist/runtime"
      );
      if (!sharedRoot) return;
      // Cache the directory listing for fast lookups
      try {
        const files = readdirSync(sharedRoot);
        this._clerkFiles = new Set(files.filter((f) => f.endsWith(".mjs")));
      } catch {}
    },
    resolveId(id) {
      if (!id.startsWith("@clerk/shared/")) return null;
      const sub = id.slice("@clerk/shared/".length);

      // Direct match first
      const direct = path.join(sharedRoot, sub + ".mjs");
      try {
        accessSync(direct);
        return direct;
      } catch {}

      // Index match (e.g. react -> react/index.mjs)
      const indexed = path.join(sharedRoot, sub, "index.mjs");
      try {
        accessSync(indexed);
        return indexed;
      } catch {}

      // Hashed filename match (starts with <name>-)
      if (this._clerkFiles) {
        for (const f of this._clerkFiles) {
          if (f === sub + ".mjs" || f.startsWith(sub + "-")) {
            return path.join(sharedRoot, f);
          }
        }
      }

      // Fallback
      return path.join(sharedRoot, sub + ".mjs");
    },
  } as Plugin & { _clerkFiles?: Set<string> };
}

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
  plugins: [
    clerkSharedResolve(),
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart(),
    viteReact(),
  ],
  ssr: {
    noExternal: [
      "@clerk/shared",
      "@clerk/clerk-react",
      "@clerk/tanstack-start",
      "@clerk/backend",
    ],
  },
});
