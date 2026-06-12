// Check 6: search (Pagefind) smoke test.
//
// Per edition: the pagefind bundle exists in dist, typing a query into the
// navbar search renders grouped results in the dropdown, every result link
// points at an existing page of the SAME edition (stale-index guard: a
// rebuilt edition whose index still carries old slugs fails here), and on
// one edition a result click actually navigates. Browser work is one page
// load per edition (OOM policy).
//
// Usage: node check-search.mjs <distDir> <baseURL>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [distDir, baseURL] = process.argv.slice(2);
const basePath = new URL(baseURL).pathname.replace(/\/$/, "");

const problems = [];
const bad = (page, why) => problems.push({ page, why });

const editions = fs.readdirSync(distDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !["about", "nextra-poc"].includes(e.name))
  .map((e) => e.name)
  .sort();

// A term every edition's spec text contains.
const QUERY = "string";

const browser = await chromium.launch();
for (const ed of editions) {
  const rel = `/${ed}/`;
  if (!fs.existsSync(path.join(distDir, ed, "pagefind", "pagefind.js"))) {
    bad(rel, "pagefind bundle missing from dist");
    continue;
  }
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  const requestFailures = [];
  page.on("response", (r) => {
    if (r.status() >= 400) requestFailures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${baseURL}${rel}`, { waitUntil: "load", timeout: 60000 });

  // The navbar instance is the visible one on desktop.
  const input = page.locator(
    ".site-header .site-search .search-input, .site-search:not(.sidebar-search) .search-input",
  ).first();
  await input.click();
  await input.fill(QUERY);
  let hrefs = [];
  try {
    await page.waitForSelector(".search-panel.open a[href]", {
      timeout: 15000,
    });
    hrefs = await page.$$eval(
      ".search-panel.open a[href]",
      (as) => as.map((a) => a.getAttribute("href")),
    );
  } catch {
    const status = await page.evaluate(() =>
      document.querySelector(".search-panel")?.textContent.trim().slice(0, 80)
    );
    bad(
      rel,
      `no results rendered for "${QUERY}" (panel: ${status ?? "absent"})`,
    );
  }
  if (hrefs.length) {
    for (const href of new Set(hrefs)) {
      const clean = href.split("#")[0];
      if (!clean.startsWith(`${basePath}/${ed}/`)) {
        bad(rel, `result link leaves the edition: ${href}`);
        continue;
      }
      const file = path.join(
        distDir,
        clean.slice(basePath.length + 1),
        "index.html",
      );
      if (!fs.existsSync(file)) bad(rel, `result link has no page: ${href}`);
    }
  }
  for (const f of requestFailures) bad(rel, `request failed: ${f}`);
  await ctx.close();
}

// one real click-through on draft
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(`${baseURL}/draft/`, { waitUntil: "load", timeout: 60000 });
  const input = page.locator(".site-search .search-input").first();
  await input.click();
  await input.fill(QUERY);
  try {
    await page.waitForSelector(".search-panel.open a[href]", {
      timeout: 15000,
    });
    const href = await page.$eval(
      ".search-panel.open a[href]",
      (a) => a.getAttribute("href"),
    );
    await page.click(".search-panel.open a[href]");
    await page.waitForLoadState("load");
    const landed = new URL(page.url());
    if (landed.pathname + landed.hash !== href) {
      bad(
        "/draft/",
        `click landed on ${landed.pathname}${landed.hash}, expected ${href}`,
      );
    }
  } catch (e) {
    bad("/draft/", `click-through failed: ${String(e).split("\n")[0]}`);
  }
  await ctx.close();
}
await browser.close();

console.log(
  `\nsearch check: ${editions.length} editions, ${problems.length} problems`,
);
for (const p of problems.slice(0, 60)) console.log(`  ${p.page} — ${p.why}`);
fs.writeFileSync(
  "/tmp/pwtest/search-report.json",
  JSON.stringify(problems, null, 2),
);
