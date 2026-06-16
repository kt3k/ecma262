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
_through_ the whole specification. Candidates under discussion (not yet
committed); see the chat thread for the latest thinking.
