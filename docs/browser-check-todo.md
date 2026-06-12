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
3. ~~**Clause badges not rendered (12 clauses)**~~ _Fixed — the
   normative-optional / legacy / deprecated attributes now carry through to the
   rendered emu-clause wrapper, algorithm steps (leading […] step annotations)
   and the pass-through inline span/ul carriers, each prepended with ecmarkup's
   `<div class="attributes-tag">` label (auto-linked to §2 like tc39). Styled on
   the site's panel grammar: soft amber wash, 3px accent edge, panel radius,
   uppercase tag (light #b45309 / dark #fbbf24). 52 → 39 mismatches; note that
   the one remaining "badge-looking" diff in sec-conformance is actually finding
   4's misattributed paragraph._
4. ~~**Clause-boundary misattribution**~~ _Fixed — parseTree glued parent prose
   that follows a nested clause into the previous child's body (its only slot
   was `pre`). The tree now records per-child `gaps` (parent-owned content after
   child k), flattenTree emits them as `<path>~` segments with the parent's
   clause context, and renderMdxTree renders them after the child's
   `</emu-clause>` — outside any badge box. sec-conformance's trailing paragraph
   sits between 2.1 and 2.2 again; 39 → 33 mismatches, conformance diffs zero._
5. ~~**Grammarkdown production annotations leak**~~ _Fixed: a trailing " #word"
   on a grammar line is cover-grammar bookkeeping and is stripped before
   tokenising (the `#` terminal of PrivateIdentifier is backtick-quoted, so it
   is unaffected)._
6. ~~**emu-xref auto-text**~~ _Fixed: id-bearing `<dfn>`s register as xref
   targets (empty xref renders the term text, "Use Strict Directive"), and note
   ids resolve to "<clause number> Note <n>" like ecmarkup's buildFigureLink
   (the sec-code-realms reference was to a note id)._
7. ~~**Table auto-numbering drift**~~ _Fixed — the real cause: `<emu-import>`
   was unsupported, so the three imported Unicode property tables (table-\*.html
   fragments) never rendered and every later table number ran behind. Imports
   are now inlined at load; the fragments are vendored for es2018–es2026
   (fetched from the tc39 release tags). Same sweep also normalised
   `<emu-caption>` elements and `type=… of=…` synthesised captions onto the
   caption attribute, and renders informative floats as "Table N (Informative):
   …". 118 → 63 mismatches; table-number category is at zero._ 7b. ~~**`[> …]`
   prose constraints render raw**~~ _Fixed: rendered as emu-gprose with the
   inline transforms applied (|NT|s resolved, marker and brackets dropped)._
8. ~~**SDO/host-hook boilerplate drift**~~ _Fixed — the real rule (ecmarkup
   header-parser): the "It performs the following steps when called:" / "It is
   defined piecewise…" sentence is emitted only when the element directly
   following the header dl — skipping emu-notes — is the clause's own emu-alg
   (sans replaces-step) / emu-grammar. Our looser "any alg before the next
   subsection" condition invented the sentence on host hooks and doubled it
   where the source hand-writes the connective
   (FunctionDeclarationInstantiation). Adjacency rule ported verbatim; 63 → 52
   mismatches, all three boilerplate signatures at zero._
9. ~~**Structured-header table cells**~~ _Fixed: `type="abstract methods"` table
   rows now mirror ecmarkup's Table.js — the first cell shows the untyped
   signature, the description cell gets the generated "The abstract method X
   takes … and returns …." paragraph, and `<emu-concrete-method-dfns>` expands
   to the linked "<number> <record type>" list (collection regex tempered so a
   parent clause's h1 can't swallow its child's)._
10. ~~sec-intro / sec-copyright-and-software-license~~ _Verified intentional:
    sec-intro renders as the edition index page; the copyright annex is
    ecmarkup-generated boilerplate from frontmatter metadata, absent from the
    source. Excluded in check-fidelity.mjs (which also gained a
    FIDELITY_DUMP=<id> debug switch)._
11. **`__proto__`-style headings** — ~~the MDX heading line read `__proto__` as
    markdown strong emphasis ("Object.prototype.<strong>proto</strong>") across
    six clauses~~ _fixed: underscores left after the inline transforms are
    literal title text and are entity-escaped in the heading line._
12. ~~**Numeric character references in code blocks**~~ _Fixed: decoded before
    highlighting._
13. ~~**Step-reference labels past depth 6**~~ _Fixed: ecmarkup caps the bullet
    cycle at six levels (depth 7+ stays lower-roman); stepOrdinal and the
    list-style CSS now match ("step 12.b.ii.2.a.ii.iii")._
14. ~~**Caption attributes with text markers**~~ _Fixed: CSS attr() captions
    can't carry markup, so `_E_`-style markers reduce to plain text._
15. ~~**Annex A prodref leakage**~~ _Fixed: grammar definitions resolve
    first-in-document (Annex B redefinitions no longer shadow the main grammar)
    and `<emu-prodref a="…">` selects the single annotated alternative for the
    cover-grammar refinements._

**2026-06-11: the draft fidelity check is at ZERO mismatches (2271 clauses).**

- [x] **4. Deep-link scroll position** Navigate to `/<chapter>/#sec-x.y.z` URLs
      and assert the heading lands visible below the sticky navbar
      (scroll-margin-top class of bugs). _Done:
      `tools/browser-checks/check-deeplink.mjs` — samples first/middle/last
      clause anchors per page plus a `#step-`/`#prod-`/table id when present,
      jumps to each and asserts the target's top sits between the sticky
      header's bottom edge and the fold. First run: 1753 deep links / 473 pages,
      34 bad — every one a WIDE `emu-table` target hidden under the header. Root
      cause: Chrome makes scrollable containers keyboard-focusable, so a
      fragment jump to a horizontally-scrolling table focuses the table itself,
      which defeated the Nextra-derived `html:not(:has(*:focus))` guard and
      turned `scroll-padding-top` off for exactly that jump. Fixed by narrowing
      the guard to input-like elements
      (`input/textarea/select/[contenteditable]:focus`); verified top=64 on the
      failing tables with no double offset on the rest. Memory note: the first
      version of this checker (6 workers × ~2000 full page loads) OOM-killed the
      host — the rewrite loads each page once, exercises fragments via in-page
      hash jumps, runs 2 workers, and recycles the browser context every 25
      pages._

## Medium priority — UI behaviour

- [x] **5. Navigation wiring** prev/next links chain in chapter order; sidebar
      lists every chapter; version switcher lands on the right edition; mobile
      hamburger opens/closes. _Done: `tools/browser-checks/check-nav.mjs` —
      static pass over all 548 pages / 17 editions (sidebar lists exactly the
      edition's pages in index order on every page; prev/next links chain that
      order with absent ends; the switcher menu lists exactly the editions in
      dist with one aria-current item pointing at the edition root) plus a light
      browser pass (one chapter per edition: hamburger opens/closes the mobile
      sidebar with body.menu-open + aria-expanded, the switcher trigger
      shows/hides the menu, and one real click-through lands on /es2026/). Clean
      on first valid run: 0 problems — the only findings were checker bugs (the
      active chapter's nested section `<ol>` defeating a lazy `…*?</ol>` match
      again, and the mobile sidebar hiding by sliding UP, so visibility needs a
      both-axes viewport overlap test)._
- [x] **6. Search (Pagefind) smoke test** Per edition: type a query, results
      render, result links resolve. Catches missing/stale pagefind indexes.
      _Done: `tools/browser-checks/check-search.mjs` — per edition asserts the
      pagefind bundle exists in dist, types "string" into the navbar search,
      waits for the dropdown to render result links, and verifies every link
      stays inside the SAME edition and resolves to an existing page
      (stale-index guard); one real click-through on draft must land on the
      link's URL; any HTTP ≥ 400 during the session is flagged. Clean: 17
      editions / 0 problems. Note for local runs: partial edition rebuilds
      (pages+build without the pagefind task) leave dist without an index — CI's
      assemble-dist always runs all three tasks, so only the local dist needs
      the full rebuild before checking._
- [x] **7. Accessibility scan (axe-core)** Missing alt, landmarks, contrast,
      focus visibility. _Check done: `tools/browser-checks/check-axe.mjs` —
      axe-core 4.12.1 over all 550 pages (light mode; the color-contrast rule is
      disabled: it dominates runtime on these huge DOMs and contrast has its own
      audit, check 2). 10 violated rules — findings below, fixes pending._

### Check-7 findings (axe, 2026-06-12) — to fix

1. **link-in-text-block** [serious] 67k nodes / 498 pages — prose links
   (emu-xref etc.) are distinguished from body text by colour alone (WCAG
   1.4.1). Fix candidates: underline content links (MDN-style, possibly with a
   soft `text-decoration-color`), or give the link colour ≥ 3:1 contrast against
   the body text colour.
2. ~~**landmark-unique**~~ _Fixed: `aria-label="Chapters"` on the sidebar aside
   (sidebar.tsx), `aria-label="On this page"` on the right-rail aside.toc
   (page.tsx)._
3. **scrollable-region-focusable** [serious] 174 nodes / 88 pages — horizontally
   scrollable `pre > .hljs` blocks and overflow figures are not
   keyboard-reachable per axe (needs `tabindex="0"` + a role/label on the scroll
   container; Chrome's native focusable-scroller behaviour is not assumed by the
   rule).
4. ~~**heading-order**~~ _Fixed (es1/es2 only — es3 was clean): Marker body HTML
   carries its own `<h1>`/`<h3>` run-in headings ("Syntax", "Description", …) at
   whatever level the PDF's font size suggested; all embedded body headings are
   now normalised to `<h2>`, matching the es5.1 ingester's existing
   `<h2>Syntax</h2>` convention._
5. **dlitem / definition-list** [serious] 36+12 nodes (es1/es2/es3) — bclary
   markup uses `<dl>` with bare `<dt>`s (no `<dd>`) for layout in
   compatibility/errors/grammar-summary; es1/es2 §11.2.1 has a `<dl>` with
   invalid children.
6. ~~**object-alt**~~ _Fixed: `<object>` SVG figures get
   `role="img" aria-label="<caption>"` from the enclosing emu-figure's caption
   (the `<img>` fallback inside is inert once the object loads, so it never
   supplied a name)._
7. ~~**image-alt**~~ _Fixed: the kept Marker figures (both are the §4.2.1
   object/prototype diagram) get a descriptive `alt` via the ingester's
   FIGURE_ALT map._
8. ~~**region / landmark-one-main**~~ _Fixed: the /about/ article body is
   wrapped in `<main>` (assemble-dist writeArticle)._

Items 1, 3 and 5 remain open; everything else re-ran clean on the rebuilt
es1/es2/es2015 + /about/ subset (the other modern editions pick the template
fixes up on the next CI build).

## Low priority

- [x] **8. Visual regression** Baseline screenshots of representative pages
      (§5.1.5 notation, §7.4.2 keyword grid, ch.15 formulas, emu-table, code
      blocks); pixelmatch on ingester/CSS changes. _Done:
      `tools/browser-checks/check-visual.mjs` — element screenshots of 9
      bug-prone widgets (es1 §5.1.5 notation, es2 §7.4.2 keyword grid, es1
      §15.9.1.2 date maths, draft emu-table / production / badges+**proto**
      heading / hljs panel, plus dark-mode table & badges), pinned rendering
      (fixed viewport, deviceScaleFactor 1, fonts awaited, animations disabled),
      pixelmatch vs committed baselines in `tools/browser-checks/baselines/`
      (>0.1% differing pixels or a size change fails; diffs land in
      /tmp/pwtest/visual-diff/). `baseline` mode re-records on INTENDED visual
      changes — commit the new PNGs with the change. Verified: two consecutive
      compares clean (deterministic), and a planted badge-colour change is
      caught on exactly the right target (0.55% diff)._
- [ ] **9. Extra viewports / zoom** 320px, tablet widths, 200% zoom (WCAG
      reflow) overflow re-check.
- [ ] **10. JS-disabled rendering** Body content fully visible without JS
      (search inert is expected).
