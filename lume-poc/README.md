# lume-poc

Proof-of-concept replacing Nextra with [Lume](https://lume.land/) for the
ECMA-262 draft. Every chapter is rendered through the same `build-chapters.mjs`
conversion that produced `notational-conventions` (one `<slug>.mdx` page +
`lib/<slug>.jsx` `<Sec>` component each); regenerate them all with
`deno task pages` (see "Running").

## What's here

- `_config.ts` — Lume entry point. Enables the `jsx` and `mdx` plugins and calls
  `site.build()` inline so we can run via `deno task build` without going
  through Lume's CLI (which doesn't see this directory's `deno.json` when
  fetched from `deno.land`).
- `_includes/page.tsx` — minimal layout: `<html>` shell + stylesheet link
  - a single `<main>` content slot. The stripped-down replacement for
    `nextra-theme-docs`'s `<Layout>`.
- `notational-conventions.mdx` — the same MDX `packages/site-draft/content/`
  uses, with the `Sec` import path adjusted to
  `./lib/notational-conventions.jsx`.
- `lib/notational-conventions.jsx` — the `<Sec>` component that
  `build-chapters.mjs` generates from `ecma262/draft/spec.html` (the live
  ECMA-262 draft), copied in untouched (uses `dangerouslySetInnerHTML`, which
  works in Lume's ssx renderer the same way it does in React). Regenerate it
  with the command under "Running" whenever the draft changes.
- `styles.css` — copy of `packages/shared/templates/ecma-spec.css`, unedited.
  Most rules carry over verbatim; a few that key on `main[data-pagefind-body]`
  or `html.dark` are dead in this PoC but harmless.

## Running

```
# 1. (re)generate every chapter page. scripts/build-pages.ts runs
#    build-chapters.mjs into a scratch dir, copies each <Sec> component into
#    lib/<slug>.jsx, and writes one Lume page lume-poc/<slug>.mdx (front matter
#    + import path adapted from build-chapters' Nextra-flavoured output).
deno task pages

# 2. build the site.
deno task build       # writes _site/<slug>/index.html for every chapter
```

To regenerate a single chapter by hand instead (what the original PoC did):

```
node ../packages/shared/scripts/build-chapters.mjs \
  --input ../ecma262/draft/spec.html \
  --lib-dir /tmp/lume-build/lib \
  --content-dir /tmp/lume-build/content \
  --public-img-dir /tmp/lume-build/img \
  --base-path ""
cp /tmp/lume-build/lib/notational-conventions.jsx ./lib/
```

The base spec is `ecma262/draft/spec.html`. Building from a pinned edition (e.g.
`ecma262/es2026/spec.html`) instead is the only thing that changes the rendered
prose — e.g. the draft lowercased the Parse Node variables, so it shows `_p_`
must cover an `_n_` where es2026 still had `_P_`/`_N_`.

## Result vs tc39.es

Element counts inside `#spec-container` (Lume vs tc39's notational-conventions
page):

| element                                    | Lume PoC   | tc39       |
| ------------------------------------------ | ---------- | ---------- |
| `emu-clause`                               | 30         | 30         |
| `emu-grammar`                              | 34         | 34         |
| `emu-production`                           | 42         | 42         |
| `emu-rhs`                                  | 75         | 75         |
| `emu-nt`                                   | 193        | 193        |
| `emu-t`                                    | 75         | 75         |
| `emu-val`                                  | 27         | 27         |
| `emu-note`                                 | 3          | 3          |
| `.secnum` / `.inline` / `.field` / `.note` | 30/21/13/3 | 30/21/13/3 |

Differences from the Nextra-rendered draft site:

- No Tailwind atomic classes (`x:text-4xl`, `x:font-bold`, …) on headings — the
  CSS that fought Nextra's defaults can be deleted.
- No `.subheading-anchor` button next to each heading.
- No breadcrumb. No mobile nav. No right-rail TOC.
- Heading levels are markdown-derived (h1/h2/h3/h4) instead of the all-h1 trick
  Item 9 used. A rehype plugin could flatten them if we want exact tc39 parity,
  but it's now optional rather than fighting the framework.

## What's still missing for a full migration

See `docs/lume_migration.md` for the full inventory. Highlights:

- Left sidebar (page tree) — needs a custom component reading `_meta.js`
- Right TOC (on-this-page) — `lume_plugin_toc` or hand-rolled
- Dark/light mode toggle — JS + CSS, ~50 lines
- Pagefind integration — runs the same way against `_site/`
- Multi-version build (draft / es2024 / es2025 / es2026)
- VersionSwitcher port (currently React, would become ssx JSX)
