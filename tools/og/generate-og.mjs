// OG image generator — renders the committed lume/og/*.png set.
//
// Two designs (mock history in docs/og-mockups/):
//   - og-site.png      site-wide card (a2): big title + tagline + amber badge
//   - og-<edition>.png per edition (b): edition mark + 1997–2027 dot timeline
//     with the edition's year lit, qual badge (draft/candidate) when present
//
// Everything derives from lume/editions.json (the single source of truth the
// site chrome uses), so a new edition only needs a re-run. Images are
// committed: they change only when editions.json does, and CI stays
// browser-free.
//
// Usage (from a dir with playwright installed, e.g. the /tmp/pwtest sandbox,
// with the dist static server running so the IBM Plex woff2 resolve):
//   node generate-og.mjs <editionsJson> <fontsBaseURL> <outDir>
//   e.g. node generate-og.mjs /workspace/ecma262/lume/editions.json \
//          http://localhost:8907/ecma262/draft/fonts /workspace/ecma262/lume/og
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [editionsJson, fontsBase, outDir] = process.argv.slice(2);
const editions = JSON.parse(fs.readFileSync(editionsJson, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

// id → presentation facts not encoded in editions.json
const yearOf = (e) => {
  const m = e.title.match(/ES(\d{4})/) ?? e.title.match(/\b(19|20)\d{2}\b/);
  return Number(m[0].replace("ES", ""));
};
const markOf = (e) =>
  e.title.match(/ES\d{4}/)?.[0] ?? `ES${e.id.replace(/^es/, "")}`;
const qualOf = (e) => e.title.match(/\b(draft|candidate)$/i)?.[1] ?? "";
const subOf = (e) => {
  const base = qualOf(e)
    ? e.title.replace(/\s+\b(draft|candidate)$/i, "")
    : e.title;
  const note = e.id === "es1" || e.id === "es2"
    ? " — restored from the printed PDF"
    : "";
  return base + note;
};

const SITE = "kt3k.github.io/ecma262";
const base = `
  @font-face { font-family: Serif0; src: url(${fontsBase}/IBMPlexSerif-Regular-SlashedZero.woff2); }
  @font-face { font-family: Serif0; font-weight: 700; src: url(${fontsBase}/IBMPlexSerif-Bold-SlashedZero.woff2); }
  @font-face { font-family: Serif0; font-style: italic; src: url(${fontsBase}/IBMPlexSerif-Italic-SlashedZero.woff2); }
  @font-face { font-family: Mono0; src: url(${fontsBase}/IBMPlexMono-Regular-SlashedZero.woff2); }
  @font-face { font-family: Mono0; font-weight: 700; src: url(${fontsBase}/IBMPlexMono-Bold-SlashedZero.woff2); }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: #0f1117;
    color: #e5e7eb;
    font-family: Serif0, Georgia, serif;
    position: relative;
    overflow: hidden;
  }
  /* soft accent glow so the card doesn't read as a flat slab */
  body::before {
    content: "";
    position: absolute;
    inset: -40%;
    background:
      radial-gradient(600px 380px at 82% 18%, rgba(96,165,250,0.13), transparent 70%),
      radial-gradient(520px 340px at 12% 92%, rgba(251,191,36,0.07), transparent 70%);
  }
  .muted { color: #9ca3af; }
  .badge {
    font-family: Mono0, monospace; letter-spacing: 0.08em;
    text-transform: uppercase; color: #fbbf24;
    border: 1px solid rgba(251,191,36,0.45); background: rgba(251,191,36,0.08);
    white-space: nowrap;
  }
`;

// --- site-wide (a2) ----------------------------------------------------------
const yrs = editions.map(yearOf);
const span = `${Math.min(...yrs)}–${Math.max(...yrs)}`;
const siteHTML = `<!doctype html><meta charset="utf-8"><style>${base}
  .wrap { position: relative; padding: 72px; height: 100%; display: flex; flex-direction: column; justify-content: center; }
  h1 { font-size: 96px; font-weight: 700; letter-spacing: -0.011em; white-space: nowrap; }
  .tag { font-size: 36px; margin-top: 26px; max-width: 21em; line-height: 1.5; }
  .badge { width: fit-content; margin-top: 44px; font-size: 24px; border-radius: 8px; padding: 10px 20px; }
  .site { position: absolute; right: 72px; bottom: 56px;
          font-family: Mono0, monospace; font-size: 22px; color: #9ca3af; }
</style>
<div class="wrap">
  <h1>ECMA-262 Restyled</h1>
  <div class="tag muted">The ECMAScript® Language Specification, restyled for reading.</div>
  <div class="badge">${editions.length} editions · ${span}</div>
  <div class="site">${SITE}</div>
</div>`;

// --- per-edition (b) ---------------------------------------------------------
const editionHTML = (cur) => {
  const y0 = Math.min(...yrs) - 2, y1 = Math.max(...yrs) + 2;
  const x = (y) => ((y - y0) / (y1 - y0)) * 100;
  const dots = editions.map((e) => {
    const on = e.id === cur.id;
    return `<div class="dot ${on ? "on" : ""}" style="left:${
      x(yearOf(e))
    }%"></div>` +
      (on
        ? `<div class="dotlbl" style="left:${x(yearOf(e))}%">${
          yearOf(cur)
        }</div>`
        : "");
  }).join("");
  const qual = qualOf(cur);
  return `<!doctype html><meta charset="utf-8"><style>${base}
  .wrap { position: relative; padding: 64px 72px; height: 100%; display: flex; flex-direction: column; }
  .mark { font-size: 150px; font-weight: 700; letter-spacing: -0.011em; line-height: 1; }
  .sub { font-size: 32px; margin-top: 18px; }
  .badge { display: inline-block; vertical-align: 24px; margin-left: 28px;
           font-size: 26px; border-radius: 8px; padding: 10px 20px; }
  .timeline { position: relative; margin-top: auto; height: 64px; }
  .rail { position: absolute; top: 18px; left: 0; right: 0; height: 2px; background: #2a2e37; }
  .dot { position: absolute; top: 13px; width: 12px; height: 12px; border-radius: 50%;
         background: #3a3f4b; transform: translateX(-50%); }
  .dot.on { width: 22px; height: 22px; top: 8px; background: #fbbf24;
            box-shadow: 0 0 0 7px rgba(251,191,36,0.18); }
  .dotlbl { position: absolute; top: 42px; transform: translateX(-50%);
            font-family: Mono0, monospace; font-size: 22px; color: #fbbf24; }
  .brandline { display: flex; align-items: baseline; margin-top: 26px; }
  .brand { font-size: 34px; font-weight: 700; }
  .site { font-family: Mono0, monospace; font-size: 22px; color: #9ca3af; margin-left: auto; }
</style>
<div class="wrap">
  <div>
    <div class="mark">${markOf(cur)}${
    qual ? `<span class="badge">${qual}</span>` : ""
  }</div>
    <div class="sub muted">${subOf(cur)}</div>
  </div>
  <div class="timeline"><div class="rail"></div>${dots}</div>
  <div class="brandline">
    <div class="brand">ECMA-262 Restyled</div>
    <div class="site">${SITE}</div>
  </div>
</div>`;
};

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
const shots = [
  ["og-site.png", siteHTML],
  ...editions.map((e) => [`og-${e.id}.png`, editionHTML(e)]),
];
for (const [name, html] of shots) {
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, name) });
  console.error(`wrote ${name}`);
}
await browser.close();
