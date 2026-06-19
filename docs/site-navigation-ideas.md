# Site navigation improvement ideas

Navigation / sharing improvements for the restyled ECMA-262 site, beyond the
reading-experience track (see `reading-experience-ideas.md`).

## Candidates

- **N1 — Heading anchor links.** Hovering a clause heading reveals a `#`
  permalink to that section; clicking jumps to it (and copies the shareable
  URL). The standard docs affordance for grabbing a deep link to a clause —
  currently missing. Build-time injection into each `<emu-clause id>` heading +
  a small copy-to-clipboard enhancement.
- **N2 — sitemap.xml + robots.txt.** Emit a sitemap (per edition, or one index)
  and a robots.txt so search engines crawl all 17 editions' pages cleanly.
  Cheap, helps discoverability of a public reference.
- **N3 — Back to top.** An unobtrusive "back to top" control on long chapters
  (the spec has very long pages), shown after scrolling down a screenful.
