// Check 9: extra viewports / zoom (WCAG 1.4.10 reflow).
//
// Every page is loaded once and then measured at three widths by resizing
// the viewport (no reload): 320px (= 1280 CSS px at 400% zoom, the WCAG
// reflow breakpoint), 640px (= 1280 at 200%), and 768px (tablet). A page
// fails a width when the document scrolls horizontally (scrollWidth beyond
// the viewport, > 1px tolerance). The base crawl already covers desktop
// (1280) and phone (375).
//
// Memory policy: 2 workers, one load per page, context recycled every 25
// pages.
//
// Usage: node check-viewports.mjs <distDir> <baseURL>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [distDir, baseURL] = process.argv.slice(2);
const WIDTHS = [320, 640, 768];

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
console.error(`${pages.length} pages × ${WIDTHS.length} widths`);

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
  while (next < pages.length) {
    const rel = pages[next++];
    if (++loads > 25) await fresh();
    try {
      await page.goto(`${baseURL}${rel}`, {
        waitUntil: "load",
        timeout: 60000,
      });
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(80); // settle reflow
        const over = await page.evaluate(() => {
          const d = document.scrollingElement;
          if (d.scrollWidth <= innerWidth + 1) return null;
          // name the widest offender to make reports actionable
          let worst = null, worstRight = innerWidth + 1;
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (r.right > worstRight && r.width > 0) {
              worstRight = r.right;
              worst = el.tagName.toLowerCase() +
                (el.id ? `#${el.id}` : "") +
                (el.className && typeof el.className === "string"
                  ? `.${el.className.trim().split(/\s+/)[0]}`
                  : "");
            }
          }
          return { scrollWidth: d.scrollWidth, worst };
        });
        if (over) {
          problems.push({
            page: rel,
            width: w,
            why: `h-overflow scrollWidth=${over.scrollWidth} (${
              over.worst ?? "?"
            })`,
          });
        }
      }
    } catch (e) {
      problems.push({ page: rel, width: 0, why: String(e).split("\n")[0] });
    }
    if (++done % 50 === 0) console.error(`...${done}/${pages.length}`);
  }
  if (ctx) await ctx.close();
};
await Promise.all(Array.from({ length: 2 }, worker));
await browser.close();

console.log(
  `\nviewport check: ${pages.length} pages × ${WIDTHS.length} widths, ` +
    `${problems.length} problems`,
);
for (const p of problems.slice(0, 60)) {
  console.log(`  ${p.page} @${p.width} — ${p.why}`);
}
fs.writeFileSync(
  "/tmp/pwtest/viewport-report.json",
  JSON.stringify(problems, null, 2),
);
