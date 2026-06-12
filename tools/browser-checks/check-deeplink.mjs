// Check 4: deep-link scroll position.
//
// Navigating to /<chapter>/#fragment must land the target visible below the
// sticky header (scroll-padding-top: var(--header-h) is supposed to handle
// this). For every page we sample the first / middle / last clause anchor
// plus, when present, one #step-, #prod- and table anchor, and assert the
// target's box starts at or below the header's bottom edge and within the
// viewport.
//
// Memory policy (the first version OOM-killed the host): each page is loaded
// ONCE and its fragments are exercised via in-page hash jumps (same
// scroll-padding path as a fresh deep link), concurrency is 2, and the
// browser context is recycled every 25 pages so renderers can't accumulate.
//
// Usage: node check-deeplink.mjs <distDir> <baseURL>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [distDir, baseURL] = process.argv.slice(2);

const pages = [];
const walk = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "nextra-poc" || e.name === "pagefind") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, `${rel}${e.name}/`);
    else if (e.name === "index.html") pages.push(rel);
  }
};
walk(distDir, "/");

// Static pass: pick sample fragments per page.
const targets = []; // { page, frags: [...] }
for (const rel of pages) {
  const html = fs.readFileSync(path.join(distDir, rel, "index.html"), "utf8");
  const clauseIds = [
    ...html.matchAll(/<emu-clause[^>]*\bid="([^"]+)"/g),
  ].map((m) => m[1]);
  // es3/es5.1 use <a name> anchors instead of emu-clause ids.
  if (clauseIds.length === 0) {
    clauseIds.push(
      ...[...html.matchAll(/<a name="([^"]+)"/g)].map((m) => m[1]),
    );
  }
  const picks = new Set();
  if (clauseIds.length) {
    picks.add(clauseIds[0]);
    picks.add(clauseIds[Math.floor(clauseIds.length / 2)]);
    picks.add(clauseIds[clauseIds.length - 1]);
  }
  const step = html.match(/<li id="(step-[^"]+)"/)?.[1];
  if (step) picks.add(step);
  const prod = html.match(/<emu-production id="(prod-[^"]+)"/)?.[1];
  if (prod) picks.add(prod);
  const table = html.match(/<emu-table[^>]*\bid="([^"]+)"/)?.[1];
  if (table) picks.add(table);
  if (picks.size) targets.push({ page: rel, frags: [...picks] });
}
const total = targets.reduce((n, t) => n + t.frags.length, 0);
console.error(`${total} deep links over ${targets.length} pages`);

const problems = [];
const browser = await chromium.launch();
let next = 0;
let done = 0;
const worker = async () => {
  let ctx, page, loads = 0;
  const fresh = async () => {
    if (ctx) await ctx.close();
    ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    page = await ctx.newPage();
    loads = 0;
  };
  await fresh();
  while (next < targets.length) {
    const t = targets[next++];
    if (++loads > 25) await fresh(); // recycle renderer memory
    try {
      await page.goto(`${baseURL}${t.page}`, {
        waitUntil: "load",
        timeout: 60000,
      });
    } catch (e) {
      for (const frag of t.frags) {
        problems.push({
          page: t.page,
          frag,
          why: `NAV FAIL: ${String(e).split("\n")[0]}`,
        });
      }
      done += t.frags.length;
      continue;
    }
    for (const frag of t.frags) {
      try {
        const r = await page.evaluate(async (frag) => {
          // Reset, then jump — the same scroll-padding-driven anchor scroll
          // a fresh #frag load performs.
          location.hash = "";
          window.scrollTo(0, 0);
          await new Promise((f) => requestAnimationFrame(f));
          location.hash = frag;
          await new Promise((f) => setTimeout(f, 50));
          const el = document.getElementById(frag) ||
            document.getElementsByName(frag)[0];
          if (!el) return { missing: true };
          const header = document.querySelector(".site-header");
          const headerBottom = header
            ? header.getBoundingClientRect().bottom
            : 0;
          const top = el.getBoundingClientRect().top;
          return {
            top: Math.round(top),
            headerBottom: Math.round(headerBottom),
            viewport: window.innerHeight,
          };
        }, frag);
        if (r.missing) {
          problems.push({ page: t.page, frag, why: "target element missing" });
        } else if (r.top < r.headerBottom - 2) {
          problems.push({
            page: t.page,
            frag,
            why: `hidden under header (top=${r.top}, header=${r.headerBottom})`,
          });
        } else if (r.top >= r.viewport) {
          problems.push({
            page: t.page,
            frag,
            why: `below the fold (top=${r.top}, viewport=${r.viewport})`,
          });
        }
      } catch (e) {
        problems.push({
          page: t.page,
          frag,
          why: `EVAL FAIL: ${String(e).split("\n")[0]}`,
        });
      }
      done++;
    }
    if (next % 50 === 0) console.error(`...${done}/${total}`);
  }
  if (ctx) await ctx.close();
};
await Promise.all(Array.from({ length: 2 }, worker));
await browser.close();

console.log(`\n${total} deep links checked, ${problems.length} bad`);
for (const p of problems.slice(0, 50)) {
  console.log(`  ${p.page}#${p.frag} — ${p.why}`);
}
fs.writeFileSync(
  "/tmp/pwtest/deeplink-report.json",
  JSON.stringify(problems, null, 2),
);
