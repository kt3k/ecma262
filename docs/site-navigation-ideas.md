# Site navigation improvement ideas

Navigation / sharing improvements for the restyled ECMA-262 site, beyond the
reading-experience track (see `reading-experience-ideas.md`).

## Shipped

- **N1 — Heading anchor links.** A `#` permalink injected into every clause
  heading, revealed on hover/focus; clicking copies the shareable URL (and
  reflects it in the address bar via `replaceState`, without scrolling). The `#`
  glyph is a CSS `::before` so it stays out of `heading.textContent`; the xref
  hover card is suppressed on these anchors. Files: `lume/_config.ts`
  (injection), `lume/heading-anchors.js` (copy), styles in `lume/styles.css`.
- **N2 — sitemap.xml + robots.txt.** `scripts/assemble-dist.mjs` walks the
  assembled `dist/` and emits `sitemap.xml` (root + /about + every edition's
  pages; asset/comparison dirs skipped) and a `robots.txt` with a Sitemap
  directive. Caveat: at `/ecma262/`, robots.txt isn't the domain-root robots, so
  the sitemap is meant for direct submission (Search Console).

## Candidates

- **N3 — Back to top.** An unobtrusive "back to top" control on long chapters
  (the spec has very long pages), shown after scrolling down a screenful.
