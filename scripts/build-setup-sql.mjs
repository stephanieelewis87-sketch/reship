// Joins every file in supabase/migrations into supabase/setup-all.sql, in order, so the whole
// database can be set up (or brought up to date) by pasting one file into Supabase's SQL editor.
// Every migration is written to be safe to run again, so running the whole file twice is fine.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const parts = files.map((f) => `-- ============================================================\n-- ${f}\n-- ============================================================\n\n${readFileSync(new URL(f, dir), "utf8").trim()}\n`);
const head = `-- Hubby database setup: every migration, ${files[0].slice(0, 4)} to ${files.at(-1).slice(0, 4)}, in order.
-- Paste all of this into Supabase > SQL Editor > New query and press Run.
-- Safe to run again on a database that already has some or all of it.
-- Made by \`node scripts/build-setup-sql.mjs\`; don't edit by hand.

`;
writeFileSync(new URL("../supabase/setup-all.sql", import.meta.url), head + parts.join("\n"));
console.log(`supabase/setup-all.sql: ${files.length} migrations`);
