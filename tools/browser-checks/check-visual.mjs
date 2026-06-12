// Check 8: visual regression on representative widgets.
//
// Element screenshots of the bug-prone renderings (grammar notation, keyword
// grids, date maths, emu-tables, productions, badges, code panels — light
// and dark) compared against committed baselines with pixelmatch.
//
//   node check-visual.mjs baseline <baseURL> <baselineDir>   # (re)record
//   node check-visual.mjs compare  <baseURL> <baselineDir>   # diff vs them
//
// Rendering is pinned for determinism: fixed viewport / deviceScaleFactor 1,
// fonts awaited, animations disabled, caret hidden. Baselines live in
// tools/browser-checks/baselines/ and are re-recorded on INTENDED visual
// changes (run `baseline` and commit the new PNGs alongside the change).
// Compare failures write side-by-side diffs to /tmp/pwtest/visual-diff/.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { default: pixelmatch } = await import("pixelmatch");
const { PNG } = require("pngjs");

const [mode, baseURL, baselineDir] = process.argv.slice(2);
if (!["baseline", "compare"].includes(mode) || !baseURL || !baselineDir) {
  console.error(
    "usage: node check-visual.mjs baseline|compare <baseURL> <baselineDir>",
  );
  process.exit(2);
}

// name → { page, selector, dark? } — selectors chosen for the widget classes
// this site has actually shipped bugs in.
const TARGETS = [
  // ES1/ES2 Marker re-skin: grammar notation, keyword grid, date maths
  {
    name: "es1-grammar-notation",
    page: "/es1/notational-conventions/",
    selector: '[id="sec-5.1.5"]',
  },
  {
    name: "es2-keyword-grid",
    page: "/es2/lexical-conventions/",
    selector: '[id="sec-7.4.2"]',
  },
  {
    name: "es1-date-math",
    page: "/es1/native-ecmascript-objects/",
    selector: '[id="sec-15.9.1.2"]',
  },
  // modern resolver: emu-table caption/numbering, grammar production,
  // special-kind badges + __proto__ heading escapes, hljs code panel
  {
    name: "draft-emu-table",
    page: "/draft/ecmascript-data-types-and-values/",
    selector: '[id="table-completion-record-fields"]',
  },
  {
    name: "draft-production",
    page: "/draft/ecmascript-language-statements-and-declarations/",
    selector: '[id="prod-IfStatement"]',
  },
  {
    name: "draft-badges-proto",
    page: "/draft/fundamental-objects/",
    selector: '[id="sec-object.prototype.__proto__"]',
  },
  {
    name: "draft-code-panel",
    page: "/draft/control-abstraction-objects/",
    selector: "pre:has(code.hljs)",
  },
  // dark-mode variants of the most style-sensitive two
  {
    name: "dark-emu-table",
    page: "/draft/ecmascript-data-types-and-values/",
    selector: '[id="table-completion-record-fields"]',
    dark: true,
  },
  {
    name: "dark-badges-proto",
    page: "/draft/fundamental-objects/",
    selector: '[id="sec-object.prototype.__proto__"]',
    dark: true,
  },
];

const DIFF_DIR = "/tmp/pwtest/visual-diff";
fs.mkdirSync(baselineDir, { recursive: true });
fs.mkdirSync(DIFF_DIR, { recursive: true });

const browser = await chromium.launch();
const problems = [];
for (const t of TARGETS) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(`${baseURL}${t.page}`, { waitUntil: "load", timeout: 60000 });
  if (t.dark) {
    await page.evaluate(() => document.documentElement.classList.add("dark"));
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const el = page.locator(t.selector).first();
  const shot = await el.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  const file = path.join(baselineDir, `${t.name}.png`);
  if (mode === "baseline") {
    fs.writeFileSync(file, shot);
    console.error(`recorded ${t.name} (${shot.length} bytes)`);
  } else {
    if (!fs.existsSync(file)) {
      problems.push({ name: t.name, why: "no baseline recorded" });
    } else {
      const a = PNG.sync.read(fs.readFileSync(file));
      const b = PNG.sync.read(shot);
      if (a.width !== b.width || a.height !== b.height) {
        fs.writeFileSync(path.join(DIFF_DIR, `${t.name}.actual.png`), shot);
        problems.push({
          name: t.name,
          why: `size changed ${a.width}x${a.height} → ${b.width}x${b.height}`,
        });
      } else {
        const diff = new PNG({ width: a.width, height: a.height });
        const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
          threshold: 0.1,
        });
        const pct = (n / (a.width * a.height)) * 100;
        if (pct > 0.1) {
          fs.writeFileSync(
            path.join(DIFF_DIR, `${t.name}.diff.png`),
            PNG.sync.write(diff),
          );
          fs.writeFileSync(path.join(DIFF_DIR, `${t.name}.actual.png`), shot);
          problems.push({
            name: t.name,
            why: `${pct.toFixed(2)}% pixels differ (${n}px) — see ${DIFF_DIR}`,
          });
        }
      }
    }
  }
  await ctx.close();
}
await browser.close();

if (mode === "compare") {
  console.log(
    `\nvisual check: ${TARGETS.length} targets, ${problems.length} regressions`,
  );
  for (const p of problems) console.log(`  ${p.name} — ${p.why}`);
  fs.writeFileSync(
    "/tmp/pwtest/visual-report.json",
    JSON.stringify(problems, null, 2),
  );
  process.exit(problems.length ? 1 : 0);
}
