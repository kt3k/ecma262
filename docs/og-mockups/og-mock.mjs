// OG image mockups (1200x630) using the site's real design tokens + fonts.
// Usage: node og-mock.mjs <outDir>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });

const FONTS = "http://localhost:8907/ecma262/draft/fonts";
const base = `
  @font-face { font-family: Serif0; src: url(${FONTS}/IBMPlexSerif-Regular-SlashedZero.woff2); }
  @font-face { font-family: Serif0; font-weight: 700; src: url(${FONTS}/IBMPlexSerif-Bold-SlashedZero.woff2); }
  @font-face { font-family: Serif0; font-style: italic; src: url(${FONTS}/IBMPlexSerif-Italic-SlashedZero.woff2); }
  @font-face { font-family: Mono0; src: url(${FONTS}/IBMPlexMono-Regular-SlashedZero.woff2); }
  @font-face { font-family: Mono0; font-weight: 700; src: url(${FONTS}/IBMPlexMono-Bold-SlashedZero.woff2); }
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
  .panel {
    background: rgba(115, 115, 115, 0.08);
    border: 1px solid rgba(115, 115, 115, 0.25);
    border-radius: 10px;
  }
  .nt { font-style: italic; }
  .t { font-family: Mono0, monospace; font-weight: 700; font-size: 0.92em; margin: 0 0.18em; }
  .geq { color: #9ca3af; margin: 0 0.45em; }
  .muted { color: #9ca3af; }
  .amber { color: #fbbf24; }
`;

// --- 案 a: site-wide -------------------------------------------------------
const siteHTML = `<!doctype html><meta charset="utf-8"><style>${base}
  .wrap { position: relative; padding: 64px 72px; height: 100%; display: flex; flex-direction: column; }
  .prod { font-size: 30px; line-height: 1.75; padding: 36px 44px; width: fit-content; }
  .rhs { padding-left: 2.2em; }
  .brand { margin-top: auto; display: flex; align-items: baseline; gap: 24px; }
  h1 { font-size: 64px; font-weight: 700; letter-spacing: -0.011em; white-space: nowrap; }
  .tag { font-size: 30px; margin-top: 14px; }
  .badge {
    font-family: Mono0, monospace; font-size: 22px; letter-spacing: 0.08em;
    text-transform: uppercase; color: #fbbf24;
    border: 1px solid rgba(251,191,36,0.45); background: rgba(251,191,36,0.08);
    border-radius: 7px; padding: 8px 16px; margin-left: auto; white-space: nowrap;
  }
</style>
<div class="wrap">
  <div class="panel prod">
    <div><span class="nt">IfStatement</span><span class="geq">:</span></div>
    <div class="rhs"><span class="t">if</span> <span class="t">(</span> <span class="nt">Expression</span> <span class="t">)</span> <span class="nt">Statement</span> <span class="t">else</span> <span class="nt">Statement</span></div>
    <div class="rhs"><span class="t">if</span> <span class="t">(</span> <span class="nt">Expression</span> <span class="t">)</span> <span class="nt">Statement</span></div>
  </div>
  <div class="brand">
    <div>
      <h1>ECMA-262 Restyled</h1>
      <div class="tag muted">The ECMAScript® Language Specification, restyled for reading.</div>
    </div>
    <div class="badge">17 editions · 1997–2027</div>
  </div>
</div>`;

// --- 案 b: per-edition ------------------------------------------------------
const EDITIONS = [
  { id: "es1", year: 1997 },
  { id: "es2", year: 1998 },
  { id: "es3", year: 1999 },
  { id: "es5.1", year: 2011 },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `es${2015 + i}`,
    year: 2015 + i,
  })),
  { id: "draft", year: 2027 },
];

const editionHTML = (cur, mark, sub, badge) => {
  const y0 = 1995, y1 = 2029;
  const x = (y) => ((y - y0) / (y1 - y0)) * 100;
  const dots = EDITIONS.map((e) => {
    const on = e.id === cur;
    return `<div class="dot ${on ? "on" : ""}" style="left:${
      x(e.year)
    }%"></div>` +
      (on
        ? `<div class="dotlbl" style="left:${x(e.year)}%">${e.year}</div>`
        : "");
  }).join("");
  return `<!doctype html><meta charset="utf-8"><style>${base}
  .wrap { position: relative; padding: 64px 72px; height: 100%; display: flex; flex-direction: column; }
  .mark { font-size: 150px; font-weight: 700; letter-spacing: -0.011em; line-height: 1; }
  .sub { font-size: 32px; margin-top: 18px; }
  .badge {
    display: inline-block; vertical-align: 24px; margin-left: 28px;
    font-family: Mono0, monospace; font-size: 26px; letter-spacing: 0.08em;
    text-transform: uppercase; color: #fbbf24;
    border: 1px solid rgba(251,191,36,0.45); background: rgba(251,191,36,0.08);
    border-radius: 8px; padding: 10px 20px;
  }
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
    <div class="mark">${mark}${
    badge ? `<span class="badge">${badge}</span>` : ""
  }</div>
    <div class="sub muted">${sub}</div>
  </div>
  <div class="timeline"><div class="rail"></div>${dots}</div>
  <div class="brandline">
    <div class="brand">ECMA-262 Restyled</div>
    <div class="site">kt3k.github.io/ecma262</div>
  </div>
</div>`;
};

const MOCKS = [
  ["og-a-site.png", siteHTML],
  [
    "og-b-draft.png",
    editionHTML(
      "draft",
      "ES2027",
      "ECMA-262, 18th edition — the editor's draft",
      "draft",
    ),
  ],
  [
    "og-b-es2024.png",
    editionHTML("es2024", "ES2024", "ECMA-262, 15th edition — June 2024"),
  ],
  [
    "og-b-es1.png",
    editionHTML(
      "es1",
      "ES1",
      "ECMA-262, 1st edition — June 1997, restored from the printed PDF",
    ),
  ],
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
for (const [name, html] of MOCKS) {
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, name) });
  console.error(`wrote ${name}`);
}
await browser.close();
