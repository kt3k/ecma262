# Rendering active TC39 proposals (ideas)

Exploration: can we collect the active TC39 proposals and present them in the
same restyled reading experience this site gives the spec editions? This is an
ideas / approaches doc — nothing implemented yet.

## Why this fits

Most proposals publish an **ecmarkup-rendered `spec.html`** (the same format the
spec editions use), typically at `https://tc39.es/proposal-<name>/`. The site
already ingests ecmarkup output and restyles it (`scripts/build-chapters.mjs`),
so the rendering machinery largely exists — the new work is _collecting_ the
proposal list and _pointing the pipeline at their specs_.

## What a "proposal" is (data model)

- Each proposal lives in its own repo, `tc39/proposal-<name>`, and (when it has
  a spec) publishes ecmarkup to GitHub Pages at `tc39.es/proposal-<name>/`.
- Stages: 0 (strawperson) → 1 (proposal) → 2 (draft) → 2.7 (candidate, finished
  review) → 3 (candidate) → 4 (finished, merged into the spec).
- "Active" ≈ Stage 1–3 (Stage 4 is already in the editions; Stage 0 is mostly
  ideas without specs).

## Data sources

- **`tc39/proposals` repo** is the index of record:
  - `README.md` — Stage 3, Stage 2.7, Stage 2 tables.
  - `stage-1-proposals.md` — Stage 1; `finished-proposals.md` — Stage 4; plus
    inactive / withdrawn / stage-0 files.
  - Table columns: **Proposal** (links to the _repo_, via a markdown reference
    like `[Decorators][decorators]` +
    `[decorators]: https://github.com/tc39/proposal-decorators`), Author,
    Champion, Test262 flag, Meeting notes. Note: the table links to the
    **repo**, not directly to the spec.
- **Per-proposal spec**: derive `https://tc39.es/proposal-<name>/` from the repo
  name (the conventional GitHub Pages URL), or read the repo's homepage / Pages
  config. Not every proposal has a spec (early stages, slide-only proposals).

## Survey: how many proposals have a real spec? (as of 2026-06)

Fetched the published page at the conventional `https://tc39.es/<repo>/` for
every active proposal in the `tc39/proposals` README (Stage 3 / 2.7 / 2, 41
repos) and counted `<emu-clause>` / `<emu-alg>` to gauge substance.

| Stage | substantial | thin | no spec\* | total |
| ----- | ----------- | ---- | --------- | ----- |
| 3     | 6           | 3    | 1         | 10    |
| 2.7   | 5           | 1    | 0         | 6     |
| 2     | 22          | 1    | 2         | 25    |
| All   | **33**      | 5    | 3         | 41    |

- **substantial** = ≥5 `emu-clause` or ≥5 `emu-alg`. Many are spec-grade, e.g.
  `proposal-structs` (83 clauses / 62 algs), `proposal-async-context` (77/27),
  `proposal-decorators` (57/52), `proposal-defer-import-eval` (60/51),
  `proposal-shadowrealm` (31/17).
- **thin** = a handful of clauses (small proposals like `iterator-join`,
  `math-clamp`) — still real, renderable ecmarkup.
- **\*no spec** = non-200 at the conventional URL (`regexp-legacy-features`,
  `function.sent`, `jobcallback-module`). This is the URL-derivation missing the
  page (alternate Pages path / Pages disabled), _not_ proven absence — treat as
  "needs a per-repo lookup", not "no spec".

**Takeaway**: ~**38 / 41** active Stage 2–3 proposals publish a renderable
ecmarkup `spec.html` (33 of them substantial), so Approach B/C is well-founded.
Deriving the spec URL from the repo name works for ~93%; the rest need the
repo's actual Pages URL (read GitHub Pages config / repo homepage).

## Approaches

### A. Restyled proposals index (metadata only) — MVP

A single restyled `/proposals/` page: the active proposals grouped by stage,
each with title, stage badge, champion, repo link and (if present) a link out to
the official rendered spec. Mirrors the editions list / About page.

- Pros: low cost, low risk, always accurate-ish (links out), no spec ingestion.
- Cons: doesn't bring proposals _into_ the reading experience — it's a
  directory.
- Build: parse the `tc39/proposals` markdown tables at build time (fetch the raw
  files, or vendor a snapshot), emit one page.

### B. Restyle each proposal's `spec.html` into the reading experience

Run the existing ecmarkup ingestion on each proposal's published `spec.html`,
producing restyled pages under `/proposals/<name>/`, with the same chrome
(header, breadcrumb, xref cards, reading progress, etc.).

- Pros: the real payoff — proposals read like the rest of the site; consistent
  navigation and the xref/glossary/anchor features come along.
- Cons / caveats:
  - Proposal specs are **delta specs**: they describe edits to existing ECMA-262
    clauses (`<ins>`/`<del>`, "Modify clause X", emu-clauses keyed to spec
    sections). The renderer must tolerate that structure (it differs from a
    standalone edition).
  - Quality/structure varies; some specs are tiny, some absent.
  - Cross-references point into the main spec (and sometimes other proposals);
    the xref index would need the main-spec index available, or links left as
    external.
- Build: per proposal, fetch `spec.html`, run `build-chapters.mjs`, emit pages.

### C. Hybrid (recommended shape)

The index (A) for **all** active proposals, plus restyled specs (B) for the
**Stage 3 / 2.7** subset only — those are the most stable and most likely to
ship, so the ingestion cost and staleness risk are bounded, while early-stage
proposals are just listed with links out.

## Cross-cutting concerns

- **Staleness**: proposal specs change often. Options: (1) pin a commit per
  proposal and show "as of <date>/<sha>"; (2) a scheduled rebuild (e.g. weekly)
  that re-fetches. Always show a prominent "snapshot, not normative, see the
  official proposal" note.
- **Non-normative / unofficial**: proposals are explicitly drafts. Reuse the
  glossary-style note panel to make provenance + status unmistakable.
- **Discovery / fetching**: pulling N specs from N repos at build time is
  network-heavy and flaky. Prefer fetching only the chosen subset, with
  retries/caching, or vendoring snapshots committed to the repo.
- **Attribution**: surface author/champion and link to the canonical repo +
  rendered spec on every proposal page.
- **Navigation / placement**: a top-level `/proposals/` section; optionally an
  entry in the header (separate from the edition version-switcher, since
  proposals aren't editions). Could later cross-link spec clauses ↔ proposals
  that touch them (ambitious).
- **No-spec proposals**: list them in the index with a "no spec yet" marker;
  don't attempt to render.

## Scope tiers

1. **Tier 1 (MVP)**: Approach A — restyled `/proposals/` index from the
   `tc39/proposals` tables. Self-contained, low risk.
2. **Tier 2**: Approach B for Stage 3 only (handful of stable specs), snapshot
   per commit with an "as of" note.
3. **Tier 3**: extend B to Stage 2.7 / 2, add a scheduled refresh, and
   cross-linking with the main spec.

## Open questions

- Pin-and-snapshot vs. scheduled live fetch? (snapshot is more reproducible and
  CI-friendly.)
- Where do proposal pages sit relative to editions — own section, or folded into
  the version switcher with a "Proposals" group?
- How much does `build-chapters.mjs` need to change to handle delta-spec markup,
  and is that worth it vs. linking out?
- Which edition do proposal xrefs resolve against (draft)? Reuse the draft xref
  index, or leave cross-spec links external?
