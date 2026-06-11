// Check 3: text fidelity vs the official ecmarkup rendering.
//
// Oracle = the SAME vendored spec.html rendered by real ecmarkup (no
// upstream drift). Both sides are reduced to per-clause normalised text:
// every text node is attributed to its nearest ancestor emu-clause/emu-annex
// with an id, then whitespace-collapsed. Clause ids are shared between the
// two renderings (both come from the source ids), so a mismatch means the
// custom resolver lost, duplicated, or rewrote text.
//
// Usage: node check-fidelity.mjs <oracleURL> <editionBaseURL> <distEditionDir>
//   e.g. node check-fidelity.mjs http://localhost:8907/oracle-draft.html \
//          http://localhost:8907/ecma262/draft /workspace/ecma262/dist/draft
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [oracleURL, editionBase, editionDir] = process.argv.slice(2);

const EXTRACT = () => {
  // Materialise CSS-generated captions (our emu-table/figure captions render
  // via ::before/::after content) as real text nodes in their true position,
  // so the walk below sees them where the oracle has its <figcaption>.
  for (const el of document.querySelectorAll("emu-table, emu-figure")) {
    for (
      const [ps, pos] of [["::before", "afterbegin"], ["::after", "beforeend"]]
    ) {
      const c = getComputedStyle(el, ps).content;
      if (c && c !== "none" && c !== "normal") {
        el.insertAdjacentText(pos, ` ${c.replace(/^"|"$/g, "")} `);
      }
    }
  }
  const own = new Map(); // clause id -> [text, ...]
  const clauseOf = (el) => {
    for (let a = el; a; a = a.parentElement) {
      if (
        (a.tagName === "EMU-CLAUSE" || a.tagName === "EMU-ANNEX" ||
          a.tagName === "EMU-INTRO") && a.id
      ) return a.id;
    }
    return null;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent;
    if (!t.trim()) continue;
    const el = n.parentElement;
    if (!el) continue;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE") continue;
    // ecmarkup.js injects copy/paste list markers ("1.", "a.") and other UI
    // as aria-hidden spans at runtime — presentation, not spec text.
    if (el.closest('[aria-hidden="true"], .list-marker, .utils')) continue;
    const id = clauseOf(el);
    if (!id) continue;
    if (!own.has(id)) own.set(id, []);
    own.get(id).push(t);
  }
  const out = {};
  for (const [id, parts] of own) {
    out[id] = parts.join(" ").replace(/\s+/g, " ").trim();
  }
  return out;
};

const browser = await chromium.launch();
const page = await browser.newPage();

// --- oracle ---
await page.goto(oracleURL, { waitUntil: "load", timeout: 120000 });
const oracle = await page.evaluate(EXTRACT);
console.error(`oracle: ${Object.keys(oracle).length} clauses`);

// --- our rendering: every chapter page of the edition ---
const ours = {};
const pages = fs.readdirSync(editionDir, { withFileTypes: true })
  .filter((e) =>
    e.isDirectory() && !["img", "pagefind"].includes(e.name) &&
    fs.existsSync(path.join(editionDir, e.name, "index.html"))
  )
  .map((e) => e.name);
for (const slug of pages) {
  await page.goto(`${editionBase}/${slug}/`, { waitUntil: "load" });
  Object.assign(ours, await page.evaluate(EXTRACT));
}
console.error(
  `ours: ${Object.keys(ours).length} clauses over ${pages.length} pages`,
);
await browser.close();

// --- compare ---
const ids = new Set([...Object.keys(oracle), ...Object.keys(ours)]);
const missing = [], extra = [], diff = [];
// Compare whitespace-free: inter-token spacing differs legitimately between
// the two renderings; content loss/duplication/rewrites still show.
const key = (s) => s.replace(/\s+/g, "");
for (const id of ids) {
  const a = oracle[id], b = ours[id];
  if (a !== undefined && b === undefined) missing.push(id);
  else if (a === undefined && b !== undefined) extra.push(id);
  else if (key(a) !== key(b)) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    let j = 0;
    while (
      j < a.length - i && j < b.length - i &&
      a[a.length - 1 - j] === b[b.length - 1 - j]
    ) j++;
    diff.push({
      id,
      oracle: a.slice(Math.max(0, i - 40), a.length - j).slice(0, 160),
      ours: b.slice(Math.max(0, i - 40), b.length - j).slice(0, 160),
    });
  }
}
console.log(
  `\n${ids.size} clauses: ${missing.length} missing from ours, ` +
    `${extra.length} extra in ours, ${diff.length} text mismatches`,
);
if (missing.length) {
  console.log(`\nmissing: ${missing.slice(0, 30).join(", ")}`);
}
if (extra.length) console.log(`\nextra: ${extra.slice(0, 30).join(", ")}`);
for (const d of diff.slice(0, 40)) {
  console.log(
    `\n== ${d.id} ==\n  oracle: …${d.oracle}…\n  ours:   …${d.ours}…`,
  );
}
fs.writeFileSync(
  "/tmp/pwtest/fidelity-report.json",
  JSON.stringify({ missing, extra, diff }, null, 2),
);
