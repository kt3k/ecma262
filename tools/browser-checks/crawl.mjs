// Site-wide Playwright audit for the assembled dist/.
//
// For every page (each index.html under dist/, nextra-poc excluded):
//   - console errors + uncaught page errors
//   - failed resource loads (HTTP >= 400)
//   - horizontal page overflow at desktop (1280px) and mobile (375px)
//   - leftover ingester artifacts in the rendered text
//
// Usage: node crawl.mjs <distDir> <baseURL>
//   (serve the PARENT of dist as ecma262/, e.g. http://localhost:8907/ecma262)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [distDir, baseURL] = process.argv.slice(2);
if (!distDir || !baseURL) {
  console.error("usage: node crawl.mjs <distDir> <baseURL>");
  process.exit(2);
}

// Collect page paths: dist/<edition>/.../index.html -> /<edition>/.../
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

const ARTIFACTS = [
  /emu-format ignore/,
  /block-type="/,
  /\[object Object\]/,
  /\bNaNundefined\b/,
];

const results = [];
const browser = await chromium.launch();

const CONCURRENCY = 6;
let next = 0;
const worker = async () => {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  const issues = { console: [], pageerror: [], badResponse: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") issues.console.push(msg.text());
  });
  page.on("pageerror", (err) => issues.pageerror.push(String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) {
      issues.badResponse.push(`${res.status()} ${res.url()}`);
    }
  });

  while (next < pages.length) {
    const rel = pages[next++];
    issues.console.length = 0;
    issues.pageerror.length = 0;
    issues.badResponse.length = 0;
    const url = baseURL + rel;
    const rec = { page: rel, problems: [] };
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
      // settle a tick for late console errors
      await page.waitForTimeout(50);

      const desktopOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
      );
      if (desktopOverflow > 1) {
        rec.problems.push(`desktop h-overflow +${desktopOverflow}px`);
      }

      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(30);
      const mobileOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
      );
      if (mobileOverflow > 1) {
        rec.problems.push(`mobile h-overflow +${mobileOverflow}px`);
      }

      const text = await page.evaluate(() => document.body.innerText);
      for (const re of ARTIFACTS) {
        if (re.test(text)) rec.problems.push(`artifact ${re}`);
      }
      const h1 = await page.locator("h1").count();
      if (h1 === 0) rec.problems.push("no h1");

      for (const c of issues.console) rec.problems.push(`console: ${c}`);
      for (const e of issues.pageerror) rec.problems.push(`pageerror: ${e}`);
      for (const r of issues.badResponse) rec.problems.push(`http: ${r}`);
    } catch (e) {
      rec.problems.push(`NAV FAIL: ${String(e).split("\n")[0]}`);
    }
    if (rec.problems.length) results.push(rec);
    if (next % 100 === 0) console.error(`...${next}/${pages.length}`);
  }
  await ctx.close();
};

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();

console.log(`\nchecked ${pages.length} pages, ${results.length} with problems`);
for (const r of results) {
  console.log(`\n${r.page}`);
  for (const p of r.problems) console.log(`  - ${p}`);
}
fs.writeFileSync("/tmp/pwtest/report.json", JSON.stringify(results, null, 2));
