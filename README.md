# ECMA-262 Restyled

An unofficial, reader-focused rendering of the ECMAScript® Language
Specification. It mirrors the source from
[tc39/ecma262](https://github.com/tc39/ecma262) and restyles it for readability
— it is **not normative**.

Live at **<https://kt3k.github.io/ecma262/>** (the root redirects to the
editor's draft). Every edition from the latest draft down to **ES5.1** is served
at `/ecma262/<id>/`.

## How it builds

A single [Lume](https://lume.land/) (Deno) project renders every edition. The
per-edition input is `ecma262/<id>/spec.html`:

- **draft … ES2015** are ecmarkup _source_; `src/build-chapters.mjs`
  re-implements the subset of ecmarkup's build the site needs (numbering, xref
  resolution, grammar tokenisation, autolinking) with no ecmarkup dependency.
- **ES5.1** predates ecmarkup, so its already-rendered official HTML goes
  through `src/build-chapters-es51.mjs`, a re-skin ingester (see
  [`docs/es5.1-plan.md`](docs/es5.1-plan.md)).

`lume/scripts/build-pages.ts` adapts the generated chapters into Lume pages for
one edition (driven by `EDITION` + `BASE_PATH`); `src/assemble-dist.mjs` loops
over every edition and folds the results into `dist/` for GitHub Pages.

```sh
# one edition, locally (from lume/)
EDITION=es2024 BASE_PATH= deno task pages && deno task build

# the full combined site
node src/assemble-dist.mjs   # → dist/
```

## Directory structure

```
.
├── ecma262/                     # per-edition spec sources (the build inputs)
│   ├── draft/                   #   git submodule → tc39/ecma262
│   ├── es2026 … es2015/         #   vendored ecmarkup snapshots (spec.html + img/)
│   └── es5.1/                   #   vendored official HTML (re-skinned, not ecmarkup)
│
├── src/                         # build scripts + edition list (Node, no workspace)
│   ├── editions.json            #   single source of truth: id + title, newest-first
│   ├── build-chapters.mjs       #   ecmarkup spec.html → per-chapter <Sec> JSX
│   ├── build-chapters-es51.mjs  #   ES5.1 rendered-HTML re-skin ingester
│   ├── editions.mjs             #   reads editions.json (+ spec-source metadata)
│   ├── spec-source.mjs          #   upstream commit info per edition
│   └── assemble-dist.mjs        #   build every edition → dist/
│
├── lume/                        # the Lume (Deno) static site
│   ├── _config.ts               #   plugins, static copy, on-this-page TOC
│   ├── _includes/               #   site chrome (page/header/sidebar/footer/…)
│   ├── scripts/build-pages.ts   #   EDITION/BASE_PATH → per-edition pages
│   ├── styles.css, fonts/, …    #   the ecmarkup look + assets
│   └── (lib/, *.mdx, img/, _includes/chapters.json — gitignored, regenerated)
│
├── nextra-poc/                  # vendored Nextra comparison build (served at /nextra-poc/)
├── docs/                        # design & reference docs
│
├── .github/workflows/nextjs.yml # CI: pnpm install → assemble-dist.mjs → GitHub Pages
├── package.json                 # root scripts (assemble/build) + highlight.js dep
├── deno.json                    # deno fmt config
└── AGENTS.md (CLAUDE.md →)       # project instructions
```

Generated per-edition content under `lume/` (`lib/`, `*.mdx`, `img/`,
`_includes/chapters.json`) is **gitignored and regenerated per build**, so
nothing edition-specific is committed.

## Adding an edition

1. Vendor the spec:
   `git clone --depth 1 --branch <tag> https://github.com/tc39/ecma262`, then
   copy `spec.html` + `img/` into `ecma262/<id>/`.
2. Append `{ "id": "<id>", "title": "…" }` to `src/editions.json`
   (newest-first).

That's it — the Lume build and `assemble-dist` pick it up automatically. (ES5.1
is the one exception: it is rendered HTML, not ecmarkup source, and routes
through the re-skin ingester.)

## Docs

- [`docs/es5.1-plan.md`](docs/es5.1-plan.md) — ES5.1 re-skin architecture
- [`docs/tc39-deviations.md`](docs/tc39-deviations.md) — where the styling
  intentionally differs from tc39.es (and why)
- [`docs/lume_migration_history.md`](docs/lume_migration_history.md) — how the
  site moved from Nextra to Lume
- [`docs/emu-xref-investigation.md`](docs/emu-xref-investigation.md) /
  [`docs/dl-header-investigation.md`](docs/dl-header-investigation.md) —
  `build-chapters.mjs` internals
- [`docs/typography-proposal.md`](docs/typography-proposal.md) — typography
  notes
- [`lume/README.md`](lume/README.md) — Lume site internals

> This is not the official specification. For the authoritative text see
> <https://tc39.es/ecma262/>.
