// Weekly link check: visits every fixed marketplace address in src/lib/marketplaces.ts and
// reports any that have stopped working, so a moved page gets fixed before sellers hit it.
//
// Run it with: npx vite-node scripts/check-links.ts
// It exits with an error when a link is broken, and writes link-report.md for the GitHub issue.
//
// Many marketplaces turn away robots (403, 429, a bot check) even when the page is fine, so only
// clear signs of a dead page count as broken: "not found" or "gone" (404, 410), a server error that
// repeats, or a redirect to a different website. Anything else is listed as "couldn't tell".
import { writeFileSync } from "node:fs";
import { linksToCheck, MARKETPLACES } from "../src/lib/marketplaces";

type Verdict = { ok: true } | { ok: false; broken: boolean; why: string };

const HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; SellSyncLinkCheck/1.0; +https://github.com/stephanieelewis87-sketch/reship)",
  accept: "text/html,application/xhtml+xml",
};

async function visit(url: string): Promise<Verdict> {
  let lastWhy = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(20000) });
      const from = new URL(url).hostname.replace(/^www\./, "");
      const to = new URL(res.url || url).hostname.replace(/^www\./, "");
      const sameSite = to === from || to.endsWith(`.${from}`) || from.endsWith(`.${to}`);
      if (res.status === 404 || res.status === 410) return { ok: false, broken: true, why: `${res.status} not found` };
      if (!sameSite) return { ok: false, broken: true, why: `redirects to another site (${to})` };
      if (res.ok) return { ok: true };
      if (res.status >= 500) {
        lastWhy = `${res.status} server error`;
        continue; // try once more; a one-off server hiccup isn't a broken link
      }
      return { ok: false, broken: false, why: `${res.status} (the site turned the robot away)` };
    } catch (e) {
      lastWhy = (e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message;
    }
  }
  return { ok: false, broken: lastWhy.includes("server error"), why: lastWhy };
}

const links = linksToCheck();
const results = [];
for (const link of links) results.push({ ...link, verdict: await visit(link.url) });

const broken = results.filter((r) => !r.verdict.ok && r.verdict.broken);
const unsure = results.filter((r) => !r.verdict.ok && !r.verdict.broken);
const line = (r: (typeof results)[number]) => `- **${MARKETPLACES[r.platform].name}** ${r.what}: ${r.url} — ${r.verdict.ok ? "ok" : r.verdict.why}`;

const report = [
  `Checked ${results.length} marketplace links: ${broken.length} broken, ${unsure.length} couldn't tell, ${results.length - broken.length - unsure.length} working.`,
  "",
  broken.length ? "## Broken\n\nFix these in `src/lib/marketplaces.ts`; every screen picks up the fix.\n\n" + broken.map(line).join("\n") : "Nothing broken.",
  unsure.length ? "\n## Couldn't tell\n\nThese sites block robots. Open them by hand if a seller reports a problem.\n\n" + unsure.map(line).join("\n") : "",
].join("\n");

writeFileSync("link-report.md", report);
console.log(report);
if (broken.length) process.exit(1);
