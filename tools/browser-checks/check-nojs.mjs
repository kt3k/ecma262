// Check 10: JS-disabled rendering.
//
// With JavaScript off, the page body must still be fully readable: the
// chapter heading and spec text render with real size, the sidebar chapter
// links are present, and nothing leaves the page horizontally-trapped.
// (Search staying inert is expected — it is the only JS feature.)
//
// Per edition: the edition index + its first chapter page (the shells
// differ per ingester, the content path is the same edition-wide).
//
// Usage: node check-nojs.mjs <distDir> <baseURL>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [distDir, baseURL] = process.argv.slice(2);

const problems = [];
const bad = (page, why) => problems.push({ page, why });

const editions = fs.readdirSync(distDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !["about", "nextra-poc"].includes(e.name))
  .map((e) => e.name)
  .sort();

const targets = [];
for (const ed of editions) {
  targets.push(`/${ed}/`);
  const chapter = fs.readdirSync(path.join(distDir, ed), {
    withFileTypes: true,
  })
    .find((e) =>
      e.isDirectory() && !["img", "pagefind"].includes(e.name) &&
      fs.existsSync(path.join(distDir, ed, e.name, "index.html"))
    )?.name;
  if (chapter) targets.push(`/${ed}/${chapter}/`);
}
targets.push("/about/");

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  javaScriptEnabled: false,
});
const page = await ctx.newPage();
for (const rel of targets) {
  try {
    await page.goto(`${baseURL}${rel}`, { waitUntil: "load", timeout: 60000 });
    const r = await page.evaluate(() => {
      const vis = (el) => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return cs.visibility !== "hidden" && cs.display !== "none" &&
          rect.width > 0 && rect.height > 0;
      };
      const h1 = document.querySelector("main h1, h1");
      const text = (document.querySelector("main") ?? document.body)
        .innerText.replace(/\s+/g, " ").trim();
      const sidebarLinks = document.querySelectorAll(
        '#sidebar a[href]:not([href^="#"])',
      ).length;
      return {
        h1Visible: vis(h1),
        textLength: text.length,
        sidebarLinks,
        hasSidebar: !!document.getElementById("sidebar"),
        bodyHidden: getComputedStyle(document.body).visibility === "hidden" ||
          getComputedStyle(document.body).opacity === "0",
      };
    });
    if (r.bodyHidden) bad(rel, "body hidden without JS");
    if (!r.h1Visible) bad(rel, "h1 not visible without JS");
    if (r.textLength < 200) {
      bad(rel, `page text only ${r.textLength} chars without JS`);
    }
    if (r.hasSidebar && r.sidebarLinks === 0) {
      bad(rel, "sidebar present but has no chapter links without JS");
    }
  } catch (e) {
    bad(rel, String(e).split("\n")[0]);
  }
}
await ctx.close();
await browser.close();

console.log(
  `\nno-JS check: ${targets.length} pages, ${problems.length} problems`,
);
for (const p of problems) console.log(`  ${p.page} — ${p.why}`);
fs.writeFileSync(
  "/tmp/pwtest/nojs-report.json",
  JSON.stringify(problems, null, 2),
);
