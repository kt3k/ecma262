# Reading-experience improvement ideas

Ideas for non-intrusive reading aids on the restyled ECMA-262 site — metadata
and guides placed so they support reading without disrupting the prose. Tracks
which are shipped and which remain.

## Shipped

- **Idea 3 — Xref hover preview cards.** Hovering a cross-reference link shows a
  small card with the target definition / clause summary. Works across pages
  (cross-page xrefs resolve through the same `#frag` index), and handles wrapped
  (two-line) links and `Object.prototype`-named ids (e.g. `constructor`). Files:
  `lume/xref-hover.js`, `lume/scripts/xref-index.mjs`.
- **Idea 5 — In-chapter reading progress.** A header-anchored progress bar on
  mobile; on desktop a "N / M" counter plus a progress fill in the right-rail
  TOC. File: `lume/reading-progress.js`.
- **Idea 4 — Context breadcrumb.** A sticky bar under the header showing the
  ancestor-clause chain of the section being read; shown only when ≥3 levels
  deep, aligned to the prose column, long chains collapse from the left into a
  leading "…", hidden on mobile. File: `lume/breadcrumb.js`.

## Not yet implemented

- **Idea 1 — Edition provenance (Added in / Changed in).** Show, unobtrusively,
  which edition each clause/definition was added or changed in. Plays to this
  site's distinctive strength: it builds every edition from one source, so the
  data is already on hand.
- **Idea 2 — Referenced by (inbound xrefs).** "Where is this definition
  referenced from?" — a reverse-lookup list. Uses the xref index in the opposite
  direction.
- **Idea 6 — Glossary tooltips for defined terms.** Underline defined terms
  (`<dfn>`) in the prose; hover/tap reveals a short definition. Reuses the dfn
  summaries already collected for Idea 3's index — low cost.
- **Idea 7 — MDN links.** Add a side link to MDN for major APIs / syntax forms.
- **Idea 8 — Algorithm step count / overview.** For `<emu-alg>` blocks, show a
  total step count and/or collapsing, to help survey long procedures.

## Follow-up groundwork

- **Extend xref-index coverage.** The index currently misses ids that originate
  from tables and algorithm steps (~7% gap). Closing it also benefits Ideas 2
  and 6.

## Priority notes

- **Idea 1 (provenance)** best exploits the site's cross-edition build, which no
  other ECMA-262 rendering offers.
- **Idea 6 (glossary)** is the cheapest win — the dfn index from Idea 3 already
  exists.
