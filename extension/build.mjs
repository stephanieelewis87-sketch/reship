// Builds the Reship browser extension into extension/dist (load it unpacked in Chrome).
// Uses the same Supabase settings as the web app: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, existsSync } from "fs";

const env = { ...process.env };
for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) env[m[1]] = m[2];
  }
}

mkdirSync("extension/dist", { recursive: true });
cpSync("extension/public", "extension/dist", { recursive: true });

await build({
  entryPoints: { background: "extension/src/background.ts", popup: "extension/src/popup.ts" },
  outdir: "extension/dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
  minify: true,
  define: {
    __SUPABASE_URL__: JSON.stringify(env.VITE_SUPABASE_URL ?? ""),
    __SUPABASE_ANON_KEY__: JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ""),
  },
});

if (!env.VITE_SUPABASE_URL) console.warn("Built without VITE_SUPABASE_URL; the extension can't sign in until it's set.");
console.log("Built extension/dist");
