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

## Completed groundwork

- **Xref-index coverage.** Extended from clauses/dfns to grammar productions,
  equations, tables and algorithm steps — 69% → 99.8% of linked fragments
  resolve to a card. The remainder are genuinely external (WHATWG/Unicode)
  references.

## Open — aids for reading the spec end-to-end

A separate track from the per-section/per-term aids above: helping a reader get
_through_ the whole specification. Candidates under consideration (not yet
committed). All ride on the site's existing footing — static generation,
`localStorage`, the single-source per-edition build, and the existing prev/next
links — and are chosen to stay non-intrusive.

- **A — Resume reading.** Remember the last section read and the in-chapter
  scroll position in `localStorage`; offer a "continue from §22.2.6" entry on
  the landing page / header. Removes the main friction of a multi-session
  read-through ("where was I"). State is per edition (see the editioning note
  below). Essentially zero added on-page chrome.
- **B — Whole-spec reading map / read-completion.** Idea 5 tracks progress
  _within_ a chapter; this tracks the _whole_ spec. Mark a chapter read once it
  has been scrolled to the end, show a check / faint heatmap in the sidebar and
  an overall "N% read". Local-only, so nothing is imposed on the reader.
- **C — Estimated reading time.** A muted "~12 min" per chapter (from word
  count, computed at build time) in the sidebar/TOC, plus a spec-wide total, so
  a read-through can be planned. One small number — low noise.
- **D — Keyboard sequential navigation.** `j`/`k` for next/previous section,
  `n`/`p` for next/previous chapter, `?` for a help overlay — read through
  without the mouse. Adds nothing to the page surface.
- **E — "Up next" chapter preview.** Extend the chapter-end prev/next with a
  short teaser of the next chapter (its opening sentences or subsection list) to
  pull the reader forward. Only at chapter boundaries, never in the prose.
- **F — Whole-spec position indicator.** Distinct from Idea 4 (the tree-depth
  breadcrumb): a thin overall progress marker showing how far through the entire
  spec the current position is, for a sense of "early vs late".

Front-runners: **A + B** (the core read-through pair); C/D are light
reinforcements; E guards against drop-off.

### Editioning note (applies to A and B)

Per-reader state must be keyed by edition. Section slugs and ids differ across
editions, so a position or read-flag from one edition is meaningless in another;
a global key would resume to the wrong place (or nowhere) after a version
switch. Plan: namespace the `localStorage` keys by edition id (e.g.
`ecma262:resume:<editionId>`, `ecma262:read:<editionId>`), so each edition keeps
its own independent reading state.
