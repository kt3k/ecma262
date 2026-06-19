# Reading-experience improvement ideas

Ideas for non-intrusive reading aids on the restyled ECMA-262 site — metadata
and guides placed so they support reading without disrupting the prose. Tracks
what shipped, what was declined, and what's still open.

## Shipped

- **Idea 3 — Xref hover preview cards.** Hovering a cross-reference link shows a
  small card with the target definition / clause summary. Works across pages
  (cross-page xrefs resolve through the same `#frag` index), handles wrapped
  (two-line) links and `Object.prototype`-named ids (e.g. `constructor`), and
  covers clauses, dfns, grammar productions, equations, tables and algorithm
  steps (99.8% of linked fragments). Files: `lume/xref-hover.js`,
  `lume/scripts/xref-index.mjs`.
- **Idea 4 — Context breadcrumb.** A full-width sub-header strip showing the
  ancestor-clause chain of the section being read; shown only when ≥3 levels
  deep, text aligned to the prose column, long chains collapse from the left
  into a leading "…", hidden on mobile. File: `lume/breadcrumb.js`.
- **Idea 5 — In-chapter reading progress.** A header-anchored progress bar on
  mobile; on desktop a "N / M" counter plus a progress fill in the right-rail
  TOC. File: `lume/reading-progress.js`.
- **Idea 6 — Glossary (page form).** A generated per-edition `/glossary/` page
  (ES2016+ / draft): an A–Z list of every `<dfn>` term, with variants, defining
  sentence and a link to where it is defined. Reuses the spec page shell, is
  searchable via Pagefind, and carries a note making its provenance and
  non-normative status explicit. Files: `lume/scripts/glossary.mjs`,
  `lume/glossary.js`. (The _inline-tooltip_ form of this idea was declined — see
  below.)
- **C — Reading-time estimates.** Per-chapter "~12 min" labels (word count at
  build time, ~200 wpm) on the sidebar links, plus a "Full read · ~21h 29m"
  total above the chapter list — to help plan an end-to-end read-through.
  Computed in `lume/_config.ts`'s `site.process` pass.
- **F — Whole-spec position strip.** A thin V3 tick timeline (a tick per chapter
  boundary + a "playhead" dot) with a "~61% through" label, showing how far
  through the entire spec the scroll position is. Position is by cumulative
  chapter word-count; advanced on scroll by `reading-progress.js`. Pinned at the
  top of the right-rail TOC, above "On This Page", so it sits in the same place
  on every page. Hovering a chapter segment highlights its span and shows the
  chapter name in a clamped popover. Desktop only (the rail is hidden ≤1100px).
  Skeleton in `page.tsx`; per-page data, ticks and chapter segments injected in
  `lume/_config.ts`.

## Declined (would add noise)

These were considered but rejected: the value is marginal and the cost is a
cluttered or misleading reading surface.

- **Idea 1 — Edition provenance (Added in / Changed in).** Per-clause "added in
  ESXXXX" badges would need a cross-edition diff, and would sprinkle badges
  across most clauses. High risk of inaccurate or noisy annotations for little
  gain while reading.
- **Idea 2 — Referenced by (inbound xrefs).** A reverse-lookup list appended to
  each definition clutters the prose, and the heavily-referenced definitions
  (e.g. Completion Record, referenced hundreds of times) produce unusable walls
  of back-links.
- **Idea 6 (inline-tooltip / autolink variant).** Underlining defined terms in
  the running prose, or autolinking unlinked mentions, was measured to be
  dominated by ambiguous common words ("constructor", "list", "object",
  "integer") — marking them would litter the prose with false positives. The
  genuinely useful linked mentions are already covered by Idea 3. Shipped the
  standalone glossary page instead.
- **Idea 7 — MDN links.** Mapping spec clauses to MDN is fuzzy and manual, the
  links rot over time, and they inject editorial content that isn't in the spec.
- **Idea 8 — Algorithm step count / overview.** Step counts and collapse toggles
  add chrome to every `<emu-alg>` for marginal benefit; the step numbers are
  already visible inline.
- **D — Keyboard sequential navigation (end-to-end track).** `j`/`k`/`n`/`p`
  read-through shortcuts. Very few readers would use them, they're hard to
  discover, and unmodified single-key shortcuts trip WCAG 2.1 SC 2.1.4
  (Character Key Shortcuts) — risky for speech-input users. Existing means
  (Space/PageDown to scroll, prev/next links, `/` to find) already cover the
  need.
- **E — "Up next" chapter preview (end-to-end track).** Built and reverted. The
  chapter-end prev/next already names the next chapter, so a separate "Up next"
  card duplicated that. A variant that instead hung the next chapter's
  subsection list under the existing next link (no duplicated title) was mocked
  in three forms, but the extra section list still read as clutter in the
  pagination row. Not worth it.
- **A — Resume reading (end-to-end track).** A `localStorage` "continue from §…"
  pointer. Dropped: per-reader browser state is low-value for a reference spec
  that people jump around rather than read linearly in one browser, and it needs
  fragile machinery (per-edition keys, an engagement gate so peeks don't clobber
  the bookmark, a "last substantial read" CTA) for a payoff that only helps a
  narrow return-visitor case.
- **B — Whole-spec reading map / read-completion (end-to-end track).** Marking
  chapters read + an overall "N% read". Dropped with A for the same reason — the
  state is local-only and speculative, and the position timeline (F) already
  gives a lightweight sense of where you are.

## Completed groundwork

- **Xref-index coverage.** Extended from clauses/dfns to grammar productions,
  equations, tables and algorithm steps — 69% → 99.8% of linked fragments
  resolve to a card. The remainder are genuinely external (WHATWG/Unicode)
  references.

## End-to-end reading track — closed

The "reading the spec end-to-end" track is resolved: **C** (reading-time
estimates) and **F** (whole-spec position timeline) shipped; **D** (keyboard
nav), **E** ("Up next"), **A** (resume reading) and **B** (reading map) were
declined — see above. No open candidates remain.
