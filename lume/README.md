# lume

The [Lume](https://lume.land/) site that renders the ECMA-262 spec. It replaces
the Nextra `packages/site-draft` app and currently ships the **draft** edition
at `/ecma262/draft/`; the same build is edition-parametrized so it can render
es2026 / es2025 / es2024 too (see `docs/lume_multiversion_todo.md`).

Each chapter is produced by the shared `build-chapters.mjs` conversion: one
`<Sec>` component (`lib/<slug>.jsx`) + one Lume page (`<slug>.mdx`) per chapter.
That generated content — `lib/`, `*.mdx`, `img/`, `_includes/chapters.json` — is
**gitignored and regenerated per build** (`deno task pages`), so nothing
edition-specific is committed.

## What's here (committed)

- `_config.ts` — Lume entry point; enables the `jsx` + `mdx` plugins, copies the
  static assets, builds the right-rail TOC, and calls `site.build()` inline.
- `_includes/` — the shared chrome: `page.tsx` (layout), `header.tsx`,
  `sidebar.tsx`, `footer.tsx`, `prev-next.tsx`, plus `editions.ts` (full edition
  list) and `chapters.ts` (thin typed loader for the generated `chapters.json`).
- `scripts/build-pages.ts` — regenerates the per-edition pages
  (`deno task
  pages`); see env vars below.
- `styles.css`, `search.js`, `hljs-github.css`, `favicon.svg`, `fonts/` — static
  assets copied verbatim into `_site/`.

## Running

```
deno task pages    # regenerate lib/ + *.mdx + chapters.json + img/ for EDITION
deno task build    # writes _site/<slug>/index.html for every chapter
deno task pagefind # (optional) build the search index into _site/pagefind/
```

Driven by two env vars (defaults render the draft for localhost):

| var         | default | meaning                                  |
| ----------- | ------- | ---------------------------------------- |
| `EDITION`   | `draft` | which `ecma262/<id>/spec.html` to render |
| `BASE_PATH` | `` (/)  | deploy prefix, e.g. `/ecma262/es2026`    |

`build-pages.ts` passes `BASE_PATH` to `build-chapters --base-path` so every
cross-page content link is prefixed, and `editions.ts` reads `EDITION` so the
header/title/version-switcher match the rendered content. Build another edition
with, e.g.:

```
EDITION=es2025 BASE_PATH=/ecma262/es2025 deno task pages
EDITION=es2025 BASE_PATH=/ecma262/es2025 deno task build
```

`assemble-dist.mjs` folds `_site/` into `dist/<id>/`; the root redirect, footer
and version switcher list editions via `src/scripts/editions.mjs`.

## Deviations from tc39.es

Intentional typography/colour differences are logged in
`docs/lume_poc_tc39_deviations.md`; the structural DOM matches ecmarkup's output
(verified against tc39's multipage build).
