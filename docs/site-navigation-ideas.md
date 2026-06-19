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
- **N3 — Back to top.** A subtle "↑ Top" pill (`back-to-top.js`) that fades in
  at the content column's bottom-right after scrolling down a screenful;
  clicking scrolls to the top (smooth, or instant under prefers-reduced-motion).
  Aligned to main's right edge so it clears the right-rail TOC. Style in
  `lume/styles.css`.

_All three navigation candidates are shipped._
