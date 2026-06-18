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
- **F — Whole-spec position strip.** A thin always-on band under the title row
  (inside the sticky header) with a "done" fill + dot and a "~61% through"
  label, showing how far through the entire spec the scroll position is.
  Position is by cumulative chapter word-count; advanced on scroll by
  `reading-progress.js`. The header height var was split (`--navbar-h` +
  `--specpos-h` = `--header-h`) so every sticky offset clears the strip.

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

Front-runners: **A + B** (the core read-through pair). (C and F shipped; D and E
declined — see above.)

### Editioning note (applies to A and B)

Per-reader state must be keyed by edition, and a single global "last position"
record is _not_ enough. A reader part-way through the draft who briefly opens
another edition would have their draft position clobbered — peeking must not
destroy the main reading place. So:

- **Per-edition records.** Namespace the `localStorage` keys by edition id
  (`ecma262:resume:<editionId>`, `ecma262:read:<editionId>`). Opening edition B
  only ever writes B's key; edition A's resume point stays intact.
- **Update only on meaningful reading.** Write/move a resume point only after
  real engagement (scrolled past a threshold, or dwelled beyond a few seconds),
  not on a quick open. This keeps a brief peek from disturbing the bookmark even
  within the same edition.
- **Global "continue" CTA picks the last _substantial_ read.** The landing /
  about entry surfaces the edition with the most recent meaningful reading (not
  merely the last edition touched), optionally listing other in-progress
  editions. So "read the draft → peek ES2015 → return" still resumes the draft.
