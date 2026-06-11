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
      chrome with dead site links, source typos `#-a13` and the URIError section
      anchored as `a-15.1.6.6` instead of `a-15.11.6.6`) — fixed in
      build-chapters-es3.mjs; now 47k links / 0 broken._
- [x] **2. Dark-mode audit** Toggle `html.dark` (and emulate
      `prefers-color-scheme`), walk visible text nodes, flag computed fg/bg
      contrast below threshold. Guards the themeColors inline-style rewrites
      (es5.1/es2015) and any hardcoded colours that sink into the dark
      background. _Done: `tools/browser-checks/check-dark.mjs` (alpha-composited
      effective colours, WCAG ratio, < 3:1 flagged). First run: 10 signatures —
      /about/ had no dark mode at all; hljs regexp tokens were 1.2:1 (invisible)
      and title/number/literal/attr below 3:1; the site footer (gray-600) and
      the skip-nav button (white on blue-400) sat ~2.3–2.5:1. All fixed; re-run
      is clean at 550 pages / 0 findings._
- [x] **3. Text fidelity vs tc39.es (modern editions)** For draft/es2026,
      compare normalised `innerText` per section against the official tc39.es
      rendering to detect text loss/duplication from the custom ecmarkup
      resolver (the modern-edition analogue of the ES1/ES2 Marker bugs). _Check
      done: `tools/browser-checks/check-fidelity.mjs` — the oracle is the SAME
      vendored spec.html rendered by real ecmarkup (v24, dev-only test oracle;
      no upstream drift), both renderings reduced to per-clause text (text nodes
      attributed to the nearest emu-clause id; ecmarkup.js's aria-hidden
      copy/paste list markers excluded; our CSS-generated table/figure captions
      materialised in place; whitespace-free compare). draft: 2273 clauses, 149
      mismatches → real resolver bugs, fixes pending — see the findings list
      below._

### Check-3 findings (draft, 2026-06-11) — resolver bugs to fix

1. ~~**Template-literal grammar mis-tokenised**~~ _Fixed: `` ``` is the
   grammarkdown spelling of a backtick terminal; `\\` inside a terminal is an
   escaped backslash. Bonus from the same sweep: lookahead operators now render
   as their glyphs (`==` → `=`, `!=` → `≠`) like ecmarkup._
2. ~~**Backslash artifacts (18 clauses)**~~ _Fixed: backslash-escaped formatting
   characters (`\*`, `\~`, …) are protected before the inline transforms and
   restored as bare characters; `\\` inside inline code is one backslash._
3. **Clause badges not rendered (12 clauses)** — `normative-optional` / `legacy`
   clause attributes get no "Normative Optional" / "Legacy" badge
   (sec-conformance-*, sec-toboolean, sec-islooselyequal, …).
4. **Clause-boundary misattribution** — a paragraph that follows a nested clause
   is emitted inside that child instead of the parent (sec-conformance's "A
   conforming implementation … Legacy subclauses…").
5. ~~**Grammarkdown production annotations leak**~~ _Fixed: a trailing " #word"
   on a grammar line is cover-grammar bookkeeping and is stripped before
   tokenising (the `#` terminal of PrivateIdentifier is backtick-quoted, so it
   is unaffected)._
6. **emu-xref auto-text** — empty xref to a clause with `aoid`-less title
   renders the slug ("use-strict-directive") instead of the title; some
   clause-number xrefs render empty (sec-code-realms loses "16.2.1.10").
7. **Table auto-numbering drift** — our global counter is 3 behind by Table ~98
   (prose xrefs say "Table 95" where the oracle says "Table 98").
8. **SDO/host-hook boilerplate drift** — we emit ecmarkup's old "It is defined
   piecewise over the following productions:" (v24 dropped it) and duplicate "It
   performs the following steps when called:" on host hooks
   (sec-hostcalljobcallback shows it twice).
9. **Structured-header table cells** — Table 14's method column includes
   parameter types (`( name : a String, )`) where the oracle strips them; its
   caption also arrives empty.
10. sec-intro / sec-copyright-and-software-license absent from our rendering —
    verify intentional (front matter) and exclude from the check if so.

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
