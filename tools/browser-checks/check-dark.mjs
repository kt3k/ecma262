// Check 2: dark-mode audit.
//
// Emulates prefers-color-scheme: dark (the site's inline script then applies
// html.dark — the real activation path), walks every visible text-bearing
// element, resolves the effective foreground/background colours (alpha
// composited, ancestors walked for the backdrop), and reports WCAG contrast
// below threshold. Two buckets: < 1.6 ("invisible" — sunk text) and < 3.0
// ("poor"). Findings are deduped site-wide by fg/bg/selector signature.
//
// Usage: node check-dark.mjs <distDir> <baseURL> [threshold]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [distDir, baseURL, thresholdArg] = process.argv.slice(2);
const THRESHOLD = Number(thresholdArg ?? 3.0);

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

const findings = new Map(); // signature -> { ...sample, pages: [] }
const browser = await chromium.launch();

let next = 0;
const worker = async () => {
  const ctx = await browser.newContext({
    colorScheme: "dark",
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  while (next < pages.length) {
    const rel = pages[next++];
    await page.goto(baseURL + rel, { waitUntil: "load" });
    const hits = await page.evaluate((threshold) => {
      if (!document.documentElement.classList.contains("dark")) {
        return [{
          sig: "NO-DARK-CLASS",
          ratio: 0,
          sample: "html.dark missing",
        }];
      }
      const parse = (s) => {
        const m = s.match(
          /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/,
        );
        return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
      };
      const composite = (top, bottom) => {
        const a = top[3] + bottom[3] * (1 - top[3]);
        if (a === 0) return [0, 0, 0, 0];
        return [
          (top[0] * top[3] + bottom[0] * bottom[3] * (1 - top[3])) / a,
          (top[1] * top[3] + bottom[1] * bottom[3] * (1 - top[3])) / a,
          (top[2] * top[3] + bottom[2] * bottom[3] * (1 - top[3])) / a,
          a,
        ];
      };
      const lum = ([r, g, b]) => {
        const f = (c) => {
          c /= 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const contrast = (fg, bg) => {
        const [l1, l2] = [lum(fg), lum(bg)];
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const pageBg = (() => {
        for (const el of [document.body, document.documentElement]) {
          const c = parse(getComputedStyle(el).backgroundColor);
          if (c && c[3] > 0) return c;
        }
        return [255, 255, 255, 1];
      })();
      const backdropOf = (el) => {
        let acc = null;
        for (let a = el; a; a = a.parentElement) {
          const c = parse(getComputedStyle(a).backgroundColor);
          if (c && c[3] > 0) {
            acc = acc === null ? c : composite(acc, c);
            if (acc[3] >= 0.999) return acc;
          }
        }
        return acc === null ? pageBg : composite(acc, pageBg);
      };
      const out = [];
      const seen = new Set();
      for (const el of document.querySelectorAll("body *")) {
        // direct text only
        let text = "";
        for (const n of el.childNodes) {
          if (n.nodeType === 3) text += n.textContent;
        }
        text = text.trim();
        if (!text) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        let fg = parse(cs.color);
        if (!fg) continue;
        const op = Number(cs.opacity);
        if (op < 1) fg = [fg[0], fg[1], fg[2], fg[3] * op];
        const bg = backdropOf(el);
        const ratio = contrast(composite(fg, bg).slice(0, 3), bg);
        if (ratio < threshold) {
          const cls = String(el.className || "").split(" ")[0];
          const sig = `${el.tagName}.${cls}|${cs.color}|rgb(${
            bg.slice(0, 3).map(Math.round)
          })`;
          if (seen.has(sig)) continue;
          seen.add(sig);
          out.push({
            sig,
            ratio: Math.round(ratio * 100) / 100,
            sample: text.slice(0, 60),
          });
        }
      }
      return out;
    }, THRESHOLD);
    for (const h of hits) {
      if (!findings.has(h.sig)) findings.set(h.sig, { ...h, pages: [] });
      const f = findings.get(h.sig);
      if (f.pages.length < 4) f.pages.push(rel);
      f.count = (f.count ?? 0) + 1;
    }
    if (next % 100 === 0) console.error(`...${next}/${pages.length}`);
  }
  await ctx.close();
};
await Promise.all(Array.from({ length: 6 }, worker));
await browser.close();

const sorted = [...findings.values()].sort((a, b) => a.ratio - b.ratio);
console.log(
  `\nchecked ${pages.length} pages (dark): ${sorted.length} distinct low-contrast signatures (< ${THRESHOLD})`,
);
for (const f of sorted) {
  console.log(
    `\n  ratio=${f.ratio}  ${f.sig}  (${f.count} page hit${
      f.count > 1 ? "s" : ""
    })` +
      `\n    sample: «${f.sample}»\n    e.g. ${f.pages.join(", ")}`,
  );
}
fs.writeFileSync(
  "/tmp/pwtest/dark-report.json",
  JSON.stringify(sorted, null, 2),
);
