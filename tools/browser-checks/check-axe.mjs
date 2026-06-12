// Check 7: accessibility scan (axe-core).
//
// Runs axe-core on every page of every edition (light mode, desktop) and
// reports violations grouped by rule. Memory policy: 2 workers, one load
// per page, context recycled every 25 pages.
//
// Contrast already has its own dedicated audit (check-dark.mjs), and axe's
// color-contrast rule dominates the runtime on these huge spec DOMs — it is
// disabled here. This run covers structure: alt text, landmarks,
// names/roles, focus order, ARIA validity.
//
// Usage: node check-axe.mjs <distDir> <baseURL> [edition,edition,…]
//        (run from a directory with axe-core installed: npm i axe-core)
//        The optional third arg restricts the sweep to those top-level
//        directories — handy for re-checking just-rebuilt editions.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [distDir, baseURL, only] = process.argv.slice(2);
const onlySet = only ? new Set(only.split(",")) : null;
const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(
  require.resolve("axe-core/axe.min.js"),
  "utf8",
);

const pages = [];
const walk = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "nextra-poc" || e.name === "pagefind") continue;
    if (onlySet && rel === "/" && e.isDirectory() && !onlySet.has(e.name)) {
      continue;
    }
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, `${rel}${e.name}/`);
    else if (e.name === "index.html") pages.push(rel);
  }
};
walk(distDir, "/");
console.error(`${pages.length} pages`);

const violations = []; // { page, id, impact, count, sample }
const failures = [];
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
  while (next < pages.length) {
    const rel = pages[next++];
    if (++loads > 25) await fresh();
    try {
      await page.goto(`${baseURL}${rel}`, {
        waitUntil: "load",
        timeout: 60000,
      });
      await page.addScriptTag({ content: axeSource });
      const res = await page.evaluate(() =>
        // eslint-disable-next-line no-undef
        axe.run(document, {
          resultTypes: ["violations"],
          reporter: "v2",
          rules: { "color-contrast": { enabled: false } },
        })
      );
      for (const v of res.violations) {
        violations.push({
          page: rel,
          id: v.id,
          impact: v.impact,
          count: v.nodes.length,
          sample: v.nodes[0]?.target?.join(" ") ?? "",
        });
      }
    } catch (e) {
      failures.push({ page: rel, why: String(e).split("\n")[0] });
    }
    if (++done % 50 === 0) console.error(`...${done}/${pages.length}`);
  }
  if (ctx) await ctx.close();
};
await Promise.all(Array.from({ length: 2 }, worker));
await browser.close();

// aggregate by rule
const byRule = new Map();
for (const v of violations) {
  if (!byRule.has(v.id)) {
    byRule.set(v.id, { impact: v.impact, pages: 0, nodes: 0, samples: [] });
  }
  const r = byRule.get(v.id);
  r.pages++;
  r.nodes += v.count;
  if (r.samples.length < 3) r.samples.push(`${v.page} → ${v.sample}`);
}

console.log(
  `\naxe: ${pages.length} pages, ${byRule.size} violated rules, ` +
    `${failures.length} page failures`,
);
for (const [id, r] of [...byRule].sort((a, b) => b[1].nodes - a[1].nodes)) {
  console.log(`\n[${r.impact}] ${id} — ${r.nodes} nodes on ${r.pages} pages`);
  for (const s of r.samples) console.log(`    ${s}`);
}
for (const f of failures.slice(0, 10)) console.log(`FAIL ${f.page} — ${f.why}`);
fs.writeFileSync(
  "/tmp/pwtest/axe-report.json",
  JSON.stringify({ violations, failures }, null, 2),
);
