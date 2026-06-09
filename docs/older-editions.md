# Reproducing pre-ES2015 editions — source notes & decisions

The site renders editions from ES5.1 up to the latest draft. ES5.1 is the oldest
because it's the newest edition ECMA re-publishes as clean, class-tagged HTML at
`262.ecma-international.org/5.1/`, which the re-skin ingester
(`src/build-chapters-es51.mjs`, see [`es5.1-plan.md`](es5.1-plan.md)) can split
into pages. Older editions predate both ecmarkup and that HTML re-publication,
so each needs its own feasibility check. This file records what was found.

## ES5 — 5th edition (December 2009) — NOT reproduced (2026-06-08)

**Does it exist?** Yes. ECMA-262 5th edition (ES5, Dec 2009) is a real published
standard. **ES5.1 (June 2011) is its editorially-corrected reissue** (aligned
with ISO/IEC 16262:2011) — no normative/feature changes, only corrections and
clarifications.

**Source landscape:**

| Source                                                                | Status                                          |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| `262.ecma-international.org/5/` and `/5.0/`                           | **404** — ECMA does not host a 5th-edition HTML |
| ECMA-262 5th edition PDF (`…/ECMA-262_5th_edition_december_2009.pdf`) | exists (also on archive.org)                    |
| `es5.github.io`                                                       | the **Annotated ES5.1**, not ES5                |
| `mozilla.github.io/es5`                                               | 404                                             |

So the re-skin approach used for ES5.1 **cannot apply** — there is no clean HTML
to re-skin, only the PDF.

**Why not worth it:**

- **No clean source.** PDF conversion is lossy (rejected for the same reason as
  the ES5.1 PDF). An archived community HTML would be different markup needing
  its own ingester.
- **~Zero content delta.** ES5 vs ES5.1 differs only by editorial corrections;
  the full list is already on the site in ES5.1's Annex F, "Technically
  Significant Corrections and Clarifications in the 5.1 Edition." ES5.1 is the
  canonical, superseding text.
- Reverse-applying the 5.1 corrections to derive ES5 is impractical — they are
  described in prose, not machine-applicable.

**Decision:** skip ES5. ES5.1 already covers the content and is the better text.
If historical completeness is ever wanted, the lightest option is a note on the
ES5.1 page ("5.1 is the editorial correction of the 5th edition, 2009") rather
than a separate render.

## ES2 — 2nd edition (August 1998) — pursuing via Marker

**Does it exist?** Yes. ECMA-262 2nd edition (ES2) is an **editorial reissue of
ES1 (1997)** — ISO/IEC 16262 alignment, no feature changes (confirmed by MDN:
"Edition 2 consisted of minor editorial changes and bug fixes to the Edition 1
specification"). So ES2 ≈ ES1, and both are far smaller than ES3 (pre-RegExp /
try-catch).

**Source landscape:** worse than ES3/ES5 — there is **no HTML at all**:
`262.../2/` and `/2.0/` 404; Mozilla `E262-2.html` 404; no bclary-style
community rendering; nothing hosted on GitHub. Only the **PDF** exists
(`ECMA-262_2nd_edition_august_1998.pdf`, plus the ES1 PDF and a Mozilla mirror).

**Approach:** since no HTML can be re-skinned, manufacture one from the PDF with
[Marker](https://github.com/datalab-to/marker) (ML PDF→structured), vendor that
output, and re-skin it like ES3. Full design and quality gate in
[`es2-plan.md`](es2-plan.md). This is a genuine try, but gated on Marker output
quality (grammar fidelity in particular) — it may still end up not-reproduced.
