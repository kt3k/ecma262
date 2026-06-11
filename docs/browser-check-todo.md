# Browser-based site checks — TODO

Playwright audits to run against the assembled `dist/` (all editions, served
under the deploy prefix, e.g. `/tmp/serve-root/ecma262 -> dist` +
`python3 -m http.server`). The scripts live in `tools/browser-checks/`:
`crawl.mjs` is the base sweep (console/page errors, HTTP >= 400, desktop+mobile
horizontal overflow, ingester-artifact text scan, missing h1) and runs clean at
550 pages / 0 findings as of 2026-06-11.

Environment note: ubuntu 26.04 needs
`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install
chromium`
plus the apt libraries listed in the project memory.

## High priority — targets known bug classes

- [x] **1. Anchor / internal-link integrity (full sweep)** Collect every
      `a[href]` on every page; for same-page and cross-page fragments (`#sec-…`,
      `#prod-…`) verify the target element exists on the destination page.
      Catches resolver regressions like the `// emu-format ignore` bug that
      silently dropped `id="prod-AsciiLetter"` and broke inbound production
      links. _Done: `tools/browser-checks/check-links.mjs`; first run found 28
      broken links (all es3 — markdown-link-mangled `[[Get]](P)` headings, named
      anchors `#_Value_`/`#annex-a` not rewritten cross-page, bclary metabottom
      chrome with dead site links, source typo `#-a13`, missing URIError section
      target) — fixed in build-chapters-es3.mjs; now 47k links / 0 broken._
- [ ] **2. Dark-mode audit** Toggle `html.dark` (and emulate
      `prefers-color-scheme`), walk visible text nodes, flag computed fg/bg
      contrast below threshold. Guards the themeColors inline-style rewrites
      (es5.1/es2015) and any hardcoded colours that sink into the dark
      background.
- [ ] **3. Text fidelity vs tc39.es (modern editions)** For draft/es2026,
      compare normalised `innerText` per section against the official tc39.es
      rendering to detect text loss/duplication from the custom ecmarkup
      resolver (the modern-edition analogue of the ES1/ES2 Marker bugs).
- [ ] **4. Deep-link scroll position** Navigate to `/<chapter>/#sec-x.y.z` URLs
      and assert the heading lands visible below the sticky navbar
      (scroll-margin-top class of bugs). Rides along with check 1's crawl.

## Medium priority — UI behaviour

- [ ] **5. Navigation wiring** prev/next links chain in chapter order; sidebar
      lists every chapter; version switcher lands on the right edition; mobile
      hamburger opens/closes.
- [ ] **6. Search (Pagefind) smoke test** Per edition: type a query, results
      render, result links resolve. Catches missing/stale pagefind indexes.
- [ ] **7. Accessibility scan (axe-core)** Missing alt, landmarks, contrast,
      focus visibility.

## Low priority

- [ ] **8. Visual regression** Baseline screenshots of representative pages
      (§5.1.5 notation, §7.4.2 keyword grid, ch.15 formulas, emu-table, code
      blocks); pixelmatch on ingester/CSS changes.
- [ ] **9. Extra viewports / zoom** 320px, tablet widths, 200% zoom (WCAG
      reflow) overflow re-check.
- [ ] **10. JS-disabled rendering** Body content fully visible without JS
      (search inert is expected).
