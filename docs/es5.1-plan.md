# ES5.1 edition — design plan (Approach A: re-skin the official HTML)

Plan for adding **ECMA-262 5.1 Edition (June 2011)** to the restyled site. ES5.1
predates ecmarkup, so the existing `build-chapters.mjs` pipeline (which
_resolves_ ecmarkup source) does not apply directly. This documents the chosen
approach and the conversion design.

## 1. Why ES5.1 is different

The modern editions (ES2015 … draft) are vendored as **ecmarkup _source_**:
`<emu-clause>`, empty `<emu-xref href="#sec-foo"></emu-xref>`, `<emu-grammar>`
with raw production text, `<emu-alg>` with Markdown steps. `build-chapters.mjs`
re-implements the subset of ecmarkup's build that _fills in_ all of that (two
numbering passes, xref substitution, grammar tokenisation, autolinking).

ES5.1 has no ecmarkup source. But the official ECMA re-publication at
`https://262.ecma-international.org/5.1/` is a single, fully-rendered,
**consistently class-tagged** HTML page. Everything `build-chapters.mjs` works
hard to compute is **already baked in**: section numbers, cross-reference link
text, tokenised grammar, numbered algorithm steps.

> The two pipelines are mirror images: the modern path **fills empty tags**; the
> ES5.1 path **consumes already-filled HTML**. So the right move is a small
> dedicated _re-skin_ ingester beside `build-chapters.mjs`, not a fork of it.

## 2. Source choice

| Candidate                                             | Verdict          | Why                                                                                                                                  |
| ----------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **`262.ecma-international.org/5.1/`** (official HTML) | **Chosen**       | Single page, clean recursive `<section>` nesting, stable `sec-X.Y.Z` ids, every construct class-tagged (see §3). Authoritative text. |
| `es5.github.io` (Annotated ES5)                       | Rejected as base | Different anchors (`#x15.4`), mixes in non-normative annotations. _May be mined later for annotations as an enrichment layer._       |
| ECMA-262 5.1 PDF / Word                               | Rejected         | No usable structure; lossy.                                                                                                          |

## 3. Anatomy of the official HTML

Single `<body>` containing a flat list of top-level `<section>`s, each
recursively nesting child `<section>`s. Headings are **always `<h1>`** — depth
is carried by `<section>` nesting and the dotted secnum, _not_ by `<h1>`…`<h6>`
levels.

```html
<section id="sec-4">
  <h1>
    <span class="secnum"><a href="#sec-4" title="link to this section"
      >4</a></span> Overview
  </h1>
  ...
  <section id="sec-4.2">
    <h1>
      <span class="secnum"><a href="#sec-4.2" ...>4.2</a></span> Language
      Overview
    </h1>
    <section id="sec-4.2.1">
      <h1>
        <span class="secnum"><a href="#sec-4.2.1" ...>4.2.1</a></span> Objects
      </h1>
      ...
    </section>
  </section>
</section>
```

Front matter (before `sec-1`) is `<section>`s without a `sec-` id:
`Copyright notice`, `Contents` (`id="contents"`), `Introduction`. Top-level
chapters are `sec-1`…`sec-15`; annexes are `sec-A`…`sec-F` with heading text
`Annex A` etc.

Construct vocabulary (occurrence counts from the live page):

| ES5.1 class                           |                ~count | Construct                         | Modern analogue                  |
| ------------------------------------- | --------------------: | --------------------------------- | -------------------------------- |
| `span.secnum`                         |                   961 | section number anchor             | `<span class="secnum">` (same)   |
| `.nt` / `.t`                          |           2893 / 1623 | grammar nonterminal / terminal    | `emu-nt` / terminal span         |
| `.prod` / `.lhs` / `.rhs` / `.gp`     | 343 / 445 / 979 / 436 | grammar production block          | `emu-grammar` / `emu-production` |
| `.grhsmod` / `.grhsannot` / `.gprose` |                     — | rhs modifier / annotation / prose | grammar modifiers                |
| `.gsumxref`                           |                   205 | grammar-summary xref              | `emu-xref`                       |
| `ol.proc` / `.nested.proc`            |              360 / 11 | algorithm step list               | `emu-alg` → `<ol>`               |
| `.note` / `.nh`                       |             207 / 207 | note body / "NOTE" head           | `emu-note`                       |
| `.real-table` / `.lightweight-table`  |               25 / 12 | tables                            | `emu-table`                      |
| `.block` / `.display`                 |              373 / 27 | code / displayed block            | `<pre>` / display                |
| `.section-status`                     |                    12 | annex normative/informative tag   | annex `(normative)` label        |

Images: only **2** (`Ecma_RVB-003.jpg` logo, `figure-1.png`). Trivial to vendor.

## 4. Output contract to satisfy

`build-pages.ts` (Deno) consumes a **scratch directory** emitted by the chapter
generator and adapts it into the Lume site. The ES5.1 ingester must emit the
**same contract** so `build-pages.ts` is reused (with only a format branch):

```
<scratch>/lib/<slug>.jsx        // export function Sec({id}) — { sectionId: bodyHTML } map
<scratch>/content/<slug>.mdx    // <div id="spec-container" className="ecma-spec"> wrapper,
                                //   heading markdown (#/##/…) interleaved with <Sec id="…"/>
<scratch>/content/_meta.js      // { slug: "display title" }, document order
<scratch>/img/                  // figures
```

- **`Sec` map**: keyed by each (nested) section id; value is that section's
  _own_ body HTML (excluding child sections, which are emitted as their own
  headings + `<Sec>` calls). Mirrors `renderMdxTree`'s interleave so the
  on-this-page TOC (built in `_config.ts` from the `id` tree) still works.
- **Heading depth**: `#` for the chapter, `##`/`###`/… for nested sections,
  derived from `<section>` nesting depth (equivalently secnum dot count).

## 5. Architecture

New script `src/build-chapters-es51.mjs`, same CLI surface as
`build-chapters.mjs`
(`--input --lib-dir --content-dir --public-img-dir
--base-path`).
`build-pages.ts` selects it when the edition's source is rendered HTML rather
than ecmarkup source:

```ts
// build-pages.ts (sketch)
const isRendered = edition === "es5.1"; // or sniff: source has <ol class="proc">
const generator = isRendered ? "build-chapters-es51.mjs" : "build-chapters.mjs";
```

Everything downstream (`build-pages.ts` copy/rewrite/front-matter, sidebar
`chapters.json`, `_config.ts` TOC, Pagefind, `assemble-dist.mjs`) is unchanged.

## 6. Conversion steps (the ingester)

1. **Parse** the single HTML into a section tree. A lightweight recursive
   `<section>…</section>` matcher is enough (the markup is well-formed and
   regular); a DOM lib (e.g. `node-html-parser`) is the robust option.
2. **Select top-level chapters**: direct-child `<section id="sec-N">` (integer)
   and `<section id="sec-A">…` (annex letter). Map front-matter sections
   (`Introduction`, etc.) to intro-style pages; drop the duplicate `Contents`
   (the sidebar replaces it).
3. **Walk the tree** per chapter: each section → a heading (level = depth) + the
   section's own body HTML (strip child `<section>`s before storing into the
   `Sec` map under its `id`).
4. **Map classes** (§7) so the body HTML renders with the site look.
5. **Slug**: derive a readable slug from the heading title (e.g. `4 Overview` →
   `overview`), matching the modern site's slug style; keep the `sec-X.Y.Z` ids
   as anchors (these differ from modern `sec-foo` slugs — see §9).
6. **Emit** the `lib/*.jsx`, `content/*.mdx`, `_meta.js`, `img/` trio.

## 7. Class-mapping strategy

Two options; **start with (a)** for the prototype, optionally converge to (b).

- **(a) Target ES5.1 classes from CSS** — add an `es5.1`-scoped block to
  `styles.css` (or a separate sheet) styling `.proc`, `.prod/.lhs/.rhs/.nt/.t`,
  `.note/.nh`, `.real-table` to match the site. _Least rewriting, fastest to a
  visible result, keeps the source HTML intact._
- **(b) Normalise to `emu-*`** — rewrite `ol.proc`→`<emu-alg>`-equivalent,
  `.prod`→`<emu-grammar>`, `.note`→`<emu-note>`, etc., so the existing site CSS
  applies unchanged and ES5.1 looks pixel-identical to modern editions. _More
  work, better long-term consistency (dark mode, hover, token colours)._

## 8. Integration checklist

- `src/editions.json`: append
  `{ "id": "es5.1", "title": "ECMA-262, 5.1 Edition, June 2011" }`.
- Vendor: save the official HTML as `ecma262/es5.1/spec.html` and the 2 images
  under `ecma262/es5.1/img/` (rename `<img src>` accordingly).
- Build:
  `EDITION=es5.1 BASE_PATH=/ecma262/es5.1 deno task pages && deno task build`.
- Licensing posture: identical to existing editions — an unofficial,
  **non-normative** restyle, covered by the About disclaimer; authoritative text
  remains ECMA's.

## 9. Differences & risks vs the modern path

- **No `<h1>`…`<h6>` levels** — depth comes from `<section>` nesting / secnum
  dots. The ingester derives heading level itself.
- **Everything pre-resolved** — _skip_ the numbering/xref/autolink/tokenise
  passes entirely; re-running them would double-process. The ingester is a
  splitter + re-skin, nothing more.
- **Anchor scheme differs** — ES5.1 uses `sec-4.2.1`; modern uses semantic
  `sec-foo`. Cross-edition deep links won't line up (expected; the editions are
  structurally different documents anyway). Intra-ES5.1 links are preserved.
- **Grammar already tokenised** — do **not** feed ES5.1 grammar through
  `tokenizeGrammarBlock`; reuse its existing `.nt/.t/.rhs` spans.
- **Front matter** — `Copyright notice` / `Contents` are page furniture; only
  `Introduction` becomes a content (intro) page.
- **TOC** — `_config.ts` builds the on-this-page list from the `id` tree, which
  ES5.1 sections carry natively, so it works once bodies keep their `id`s.

## 10. Phased rollout

- **P0 (prototype)** — convert **one chapter** end to end, eyeball the re-skin
  and validate the splitter + class mapping. ← _this PR_
- **P1** — convert all chapters + annexes; full edition renders under Lume.
- **P2** — class normalisation to `emu-*` (option 7b) for dark mode / token
  colour parity.
- **P3** — sidebar, search (Pagefind), version switcher entry, footer link.
- **P4** — polish: figure/table captions, annex normative labels, optional
  annotation enrichment mined from `es5.github.io`.
