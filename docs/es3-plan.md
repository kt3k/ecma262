# ES3 edition — design plan (re-skin the bclary HTML)

Plan for adding **ECMA-262 3rd Edition (December 1999)** to the site. ES3
predates ecmarkup _and_ ECMA's clean HTML re-publication (`262.../3/` 404s), so
the source is the well-known community rendering by Bob Clary,
`bclary.com/2004/11/07/ecma-262.html` (vendored as `ecma262/es3/spec.html`).
Unlike ES5 — see [`older-editions.md`](older-editions.md) — ES3 is a genuinely
distinct edition (no strict mode, JSON, getters/setters, `Object.*`, Array
iteration methods, …), so it's worth reproducing.

It needs a **third ingester** (`src/build-chapters-es3.mjs`) because its markup
differs from both the ecmarkup editions and the ES5.1 official HTML.

## Anatomy of the bclary HTML

The whole spec is one big **definition list** — no heading tags, no `<section>`,
no `<ol>`. Each section is a `<dt>`/`<dd>` pair:

```html
<dt><a name="a-11.1" id="a-11.1">11.1 Primary Expressions</a></dt>
<dd>… body …</dd>
<dt>
  <a name="a-11.1.1" id="a-11.1.1">11.1.1</a> The <b><tt>this</tt> Keyword</b>
</dt>
<dd>… body …</dd>
```

Key facts (from the vendored file):

- **Anchors:** `<a name="a-X.Y.Z" id="a-X.Y.Z">` — the `a-` prefix + dotted
  section number. ~525 section anchors.
- **Hierarchy is purely numeric.** Sections are _flat siblings_ in the (only 2)
  structural `<dl>`s — a child section is NOT nested inside its parent's `<dd>`;
  depth comes from the dot count (`a-11` chapter → `a-11.1` → `a-11.1.1`). So
  each `<dd>` already holds only its own body (no child-stripping needed, unlike
  the ES5.1 `<section>` nesting).
- **Title:** sometimes inside the `<a>` (`11.1 Primary Expressions`), sometimes
  after it (`11</a>. Expressions`, `11.1.1</a> The <b>…</b>`). Derive the number
  from the id and strip exactly that leading number to get the title.
- **Top level:** chapters `a-1`…`a-16`; annexes `annex-a` (Grammar Summary) /
  `annex-b` (Compatibility) use different anchors.
- **Grammar:** `<dl class="grammar">` (385 of the 387 `<dl>`s) with
  `class="nonterminal"`; `class="gsee"` is the "See clause N" reference.
- **Cross-references:** `href="#a-X.Y.Z"` (the `#a-` analogue of ES5.1's
  `#sec-`).
- **Tables:** plain `<table>`; some operators are defined by a table (e.g. §9
  Type Conversion). **Figures: one** — `figure-1.gif`.

## Architecture (mirrors the ES5.1 path)

`src/build-chapters-es3.mjs` emits the same scratch contract build-pages.ts
already consumes (`lib/<slug>.jsx` + `content/<slug>.mdx` + `content/_meta.js`),
so `build-pages.ts` only needs another format branch:

```ts
const isRendered = edition === "es5.1" || edition === "es3";
const generator = edition === "es3"
  ? "build-chapters-es3.mjs"
  : edition === "es5.1"
  ? "build-chapters-es51.mjs"
  : "build-chapters.mjs";
```

Everything downstream (Lume render, `_config.ts` TOC, Pagefind, assemble-dist)
is unchanged.

## Conversion steps (the ingester)

1. **Scan** every section `<dt>`:
   `/<dt>\s*<a name="(a-[\d.A-Za-z]+)"[^>]*>
   (…)<\/a>(…)<\/dt>/g`. Grammar
   `<dt>`s have no `a-` anchor, so they're skipped.
2. **Body** of section _i_ = the slice from its `</dt>` to the next section
   `<dt>` (sections are flat), with the wrapping `<dd>…</dd>` stripped. The
   inner grammar `<dl>`s are carried through untouched.
3. **Number/title:** number = id without the `a-`; title = (anchor text + text
   after `</a>`) with the exact leading number stripped, markup kept.
4. **Rebuild the tree** from the flat list by dot-depth (stack: pop while
   top.depth ≥ this.depth, then push) → top-level chapters with nested children.
5. **Emit** per chapter, like ES5.1: nested `<emu-clause id="a-X.Y.Z">` +
   `#`/`##`/… heading + `<Sec id>`; the emu-clause id makes `#a-X.Y.Z` links and
   the on-this-page TOC work.
6. **Re-skin pipeline** (reused from ES5.1): rewrite `href="#a-X.Y.Z"` to
   per-page basePath URLs (id→slug map), neutralise hardcoded inline colours for
   dark mode, point image refs at `${BASE_PATH}/img/…`.

## Class mapping (CSS add-on)

ES3 uses a sparse class set: `grammar` / `nonterminal` / `gsee`, plus plain
`<dl>`/`<dt>`/`<dd>`, `<table>`, `<i>`/`<b>`/`<tt>` for grammar tokens. Add an
`es3` block to `styles.css` (or extend the ES5.1 one) styling `dl.grammar`,
`.nonterminal`, `.gsee`, and the definition-list body so it reads like the rest
of the site, theme-aware.

## Integration

- `src/editions.json`: append
  `{ "id": "es3", "title": "ECMA-262, 3rd Edition,
  December 1999" }`.
- Vendor `figure-1.gif` under `ecma262/es3/img/`.
- Note in About / the page that this is the **bclary** community rendering, not
  ECMA's (the official ES3 exists only as PDF).

## Phased rollout (mirrors ES5.1)

- **P0** — convert one chapter end to end (validate the dt/dd parser + re-skin).
- **P1** — all chapters + annexes (annex-a/annex-b need their own anchor
  handling); register in editions.json.
- **P2** — dark-mode pass for the ES3-specific classes.
- **P4** — polish: grammar layout, tables, figure, "See clause" refs.
