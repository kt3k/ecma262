# ES2 edition — design plan (Marker PDF → re-skin)

Plan for adding **ECMA-262 2nd Edition (August 1998)** to the site. ES2 is the
hardest case so far: there is **no HTML source at all** — not official
(`262.../2/` 404s), not Mozilla, not a bclary-style community rendering, not on
GitHub. The only artifact is the **PDF**. So the source has to be _manufactured_
from the PDF with [Marker](https://github.com/datalab-to/marker) (an ML
PDF→structured-document converter), then re-skinned like the other pre-ecmarkup
editions. See [`older-editions.md`](older-editions.md) for the source survey.

> **Caveat up front.** ES2 (1998) is an editorial-only reissue of ES1 (1997) —
> no feature changes, just ISO/IEC 16262 alignment — so its content is
> ~identical to ES1 and far smaller than ES3 (no RegExp / try-catch / etc.). And
> a Marker-converted PDF is a _best-effort ML reconstruction_, not
> authoritative. Both facts mean ES2 is lower-value and higher-effort than
> ES3/ES5.1; this plan exists to try the Marker pipeline, with a quality gate
> before committing to it.

## Pipeline shape

Marker is a heavy Python/PyTorch tool with downloaded ML models — it must run
**offline, once**, never in CI. Its output is **vendored** into the repo (like
the Nextra `nextra-poc/` export or the bclary `es3/spec.html`), and a new
ingester turns that vendored output into the standard scratch contract.

```
ES2 PDF  ──(Marker, offline)──▶  vendored HTML/JSON  ──(build-chapters-es2.mjs)──▶  scratch contract  ──▶  Lume
```

## Step 1 — vendor the PDF

- Download `ECMA-262_2nd_edition_august_1998.pdf` from ecma-international.org
  and commit it as `ecma262/es2/ECMA-262-2nd.pdf` (provenance; ~small).

## Step 2 — Marker conversion (offline, one-time)

```sh
pip install marker-pdf            # Python 3.10+, PyTorch; GPU optional
# HTML is closest to our other re-skin sources (headings + tables + <p>):
marker_single ecma262/es2/ECMA-262-2nd.pdf \
  --output_format html --output_dir /tmp/es2-marker
# optional: --use_llm sharpens tables/structure (needs an LLM API key)
```

- Marker's HTML output gives `<h1>`/`<h2>`…, `<table>`, `<p>`, `<pre>` (code),
  `$$…$$` (equations), plus extracted images. Its JSON output additionally
  carries `SectionHeader` blocks + a `section_hierarchy` and typed blocks
  (`Table`, `ListItem`, `Equation`, `Code`, `PageHeader/Footer`, …) — more
  precise for rebuilding the tree if the HTML headings are unreliable.
- **Decision:** start with **HTML** (re-skin like ES5.1/ES3); fall back to
  **JSON** (walk blocks by `section_hierarchy`) if the heading structure is
  poor.
- **Vendor the chosen Marker output** into `ecma262/es2/` (e.g.
  `ecma262/es2/marker.html` or `marker.json` + any images). Commit it so CI
  never needs Python/Marker — same posture as `nextra-poc/`.

## Step 3 — quality gate (eyeball before building)

Before writing the ingester, manually review the Marker output for:

- **Section numbering** preserved and parseable (e.g. headings read "11.1
  Primary Expressions", or numbers sit in a predictable place).
- **Grammar productions** — the weakest area. ES2 typesets grammar with italic
  nonterminals and a specific layout; Marker may flatten it to prose or a table.
  If grammar is mangled, that's the main risk to the edition's usefulness.
- **Algorithms** — numbered steps should land as list items.
- **Tables / special characters / math** — ToNumber tables, δ/×/− symbols, etc.
- **Page headers/footers/page numbers** — present as `PageHeader`/`PageFooter`
  (JSON) or stray lines (HTML); must be strippable.

If the output is too noisy to clean up economically, **stop here** and record
ES2 as not-reproduced (like ES5), rather than shipping a garbled edition.

## Step 4 — ingester (`src/build-chapters-es2.mjs`)

Mirrors the ES3 ingester (flat list → tree by dotted section number), but parses
Marker output instead of bclary `<dt>`/`<dd>`:

1. **Split** on section headings (HTML `<h*>` whose text starts with a dotted
   number, or JSON `SectionHeader` blocks). Each section = (number, title,
   body).
2. **Rebuild the tree** from the dotted number by dot-depth (same stack walk as
   ES3) → top-level chapters (1…16) + annexes.
3. **Synthesise anchors** from the section numbers (`id="sec-11.1"`) — the PDF
   has none. These ids drive intra-edition links + the on-this-page TOC.
4. **Reconstruct cross-references**: the PDF refers to sections by _text_ ("see
   11.2"), not links. A pass rewrites recognised "see N.N" patterns into
   `<a href="…#sec-N.N">`. Imperfect; unmatched ones stay plain text.
5. **Clean up**: drop page headers/footers/numbers, fix obvious OCR artefacts,
   wrap algorithm list items as `<ol>`, keep Marker tables.
6. **Emit** the scratch contract (`lib/<slug>.jsx` + `<slug>.mdx` + `_meta.js`)
   and run the shared re-skin pipeline (basePath image paths, theme-aware
   colours) — exactly like ES3/ES5.1. `build-pages.ts` gets another
   `edition === "es2"` branch.

## Step 5 — styling, index, integration

- CSS add-on for whatever classes the Marker output uses (likely plain
  `<table>`/`<p>` — reuse the `.ecma-es3` table treatment via an `ecma-es2`
  container class).
- Index page with a **prominent provenance note**: "Reconstructed from the ES2
  PDF with Marker (ML). Not the official text; expect conversion artefacts. ES2
  is an editorial reissue of ES1 (1997)."
- Register `{ "id": "es2", "title": "ECMA-262, 2nd Edition, August 1998" }` in
  `src/editions.json` only once quality is acceptable.

## Phased rollout

- **P-1 (prep + gate)** — vendor PDF, run Marker offline, vendor output, eyeball
  quality (Step 3). Go/no-go decision here.
- **P0** — ingester on one chapter; validate parsing + scope the cleanup.
- **P1** — all chapters + annexes; anchors + xref reconstruction; register.
- **P2 / P4** — styling, grammar/table cleanup, QA sweep of OCR artefacts.

## Open questions / risks

- **Grammar fidelity** is the deciding factor — if Marker can't keep the
  production layout, the edition loses most of its (already small) value.
- **Marker availability here** — this sandbox has no Python/Marker and likely
  can't install the models, so Step 2 runs on the user's machine; the vendored
  output is what lands in the repo.
- **Value vs effort** — ES2 ≈ ES1 and is dwarfed by ES3 (already live). Worth a
  prototype to see how good Marker is, but the quality gate (Step 3) is a real
  stop point, not a formality.
