import lume from "lume/mod.ts";
import mdx from "lume/plugins/mdx.ts";
import jsx from "lume/plugins/jsx.ts";
import { writeXrefIndex } from "./scripts/xref-index.mjs";
import { writeGlossary } from "./scripts/glossary.mjs";
import chapters from "./_includes/chapters.ts";
import {
  currentEditionId,
  hasGlossary,
  titleMain,
} from "./_includes/editions.ts";

// Minimal Lume PoC for the notational-conventions page.
// Goal: prove that Lume + MDX + Preact JSX can render the same DOM that
// Next.js + Nextra currently does, without the Nextra typography utility
// classes fighting our CSS. See docs/lume_migration_history.md for the background.
const site = lume({
  src: ".",
  dest: "_site",
});

site.use(jsx());

// Flatten <h2>..<h6> down to <h1> at the HAST level so the depth-based
// CSS rules in styles.css (`.ecma-spec emu-clause emu-clause > h1`,
// `... > h1 { line-height: 1em }`, etc.) actually match every spec
// heading — without this they only catch the page-top h1 and the
// nested ones render at browser-default h2/h3/h4 sizes. Mirrors what the
// former Nextra mdx-components layer did at the MDX
// components layer (the Next.js MDX has React component substitution;
// Lume's MDX uses rehype). The visual hierarchy comes back from the
// <emu-clause> nesting depth, the same scheme tc39.es/ecma262 uses.
//
function rehypeFlattenHeadings() {
  // deno-lint-ignore no-explicit-any
  return (tree: any) => {
    // deno-lint-ignore no-explicit-any
    const walk = (node: any) => {
      if (node.type === "element" && /^h[2-6]$/.test(node.tagName)) {
        node.tagName = "h1";
      }
      if (node.children) { for (const c of node.children) walk(c); }
    };
    walk(tree);
  };
}

site.use(mdx({
  rehypePlugins: [rehypeFlattenHeadings],
}));

// README.md is dev documentation, not a page to ship.
site.ignore("README.md");

// Static assets that ship as-is into _site/.
site.copy("styles.css");
site.copy("search.js");
// Vendored highlight.js GitHub theme — same file the Nextra build picks
// up via `import "highlight.js/styles/github.css"` in spec-layout.jsx.
// styles.css below loads after this in page.tsx and zeroes out the
// theme's white .hljs background so it sits on the page bg (tc39.es
// uses the same trick in ecmarkup.css `pre code.hljs { background: 0 0 }`).
site.copy("hljs-github.css");
// xref hover-card client — lazy-fetches xref-index.json (written after the
// build, below) on first hover and shows a definition card. See page.tsx.
site.copy("xref-hover.js");
// In-chapter reading-progress client (header bar on mobile, TOC counter +
// read-dimming on desktop). See page.tsx.
site.copy("reading-progress.js");
// Context breadcrumb client — sticky ancestor-clause chain under the header,
// shown only in deeply nested sections. See page.tsx.
site.copy("breadcrumb.js");
// Glossary A–Z bar "stuck" detector — loaded only by the generated glossary
// page (scripts/glossary.mjs injects the tag), so it ships as an asset but
// isn't referenced elsewhere.
site.copy("glossary.js");
// Spec figures (emu-figure images), copied in per-edition by
// scripts/build-pages.ts from the spec's img/ dir. Gitignored; absent until
// `deno task pages` runs (then served under <base>/img/).
site.copy("img");
// IBM Plex Mono WOFF2 files (4 weights, slashed-zero variant) — same
// files tc39.es itself ships at /ecma262/assets/fonts/. Used by the
// @font-face declarations at the top of styles.css so spec inline
// <code> renders in Plex Mono like tc39.es rather than a system mono.
site.copy("fonts");
// Site favicon (the "JS" mark, same as the Nextra build's app/icon.svg); see
// the <link rel="icon"> in _includes/page.tsx.
site.copy("favicon.svg");

// Build the per-page right-rail TOC after rendering. Lume parses each .html
// page's content into a Document on demand (`page.document`); we walk the
// <emu-clause id=…> tree inside <main> to read the section number/heading,
// then fill in the empty <aside class="toc"><ol/></aside> the layout left.
// Using the <emu-clause> structure (rather than scanning h2/h3 directly) gets
// us anchor ids that match the spec's `#sec-…` convention out of the box.
site.process([".html"], (pages) => {
  // Reading-time estimates (idea C): count the words in each chapter's <main>
  // once, turn them into minutes (~200 wpm), and total the whole edition. The
  // labels are injected into the sidebar below, so every page needs all the
  // chapter times up front — hence this first pass over `pages`.
  const basePath = Deno.env.get("BASE_PATH") ?? "";
  const slugOf = (url: string) => url.replace(/^\/+|\/+$/g, "") || "index";
  const minutes: Record<string, number> = {};
  let totalMin = 0;
  // For the "Up next" preview (idea E): each chapter's top-level sections, so a
  // page can show what the *following* chapter covers. Built here because that
  // data belongs to a different page than the one being rendered.
  const sectionsBySlug: Record<string, { id: string; title: string }[]> = {};
  const ledeBySlug: Record<string, string> = {};
  for (const page of pages) {
    const main = page.document?.querySelector("main");
    if (!main) continue;
    const slug = slugOf(page.data.url as string);
    const words =
      (main.textContent ?? "").trim().split(/\s+/).filter(Boolean).length;
    minutes[slug] = Math.max(1, Math.round(words / 200));
    totalMin += minutes[slug];

    const secs: { id: string; title: string }[] = [];
    for (const clause of main.querySelectorAll("emu-clause[id]")) {
      let depth = 0;
      let p = clause.parentElement;
      while (p) {
        if (p.tagName?.toLowerCase() === "emu-clause") depth++;
        p = p.parentElement;
      }
      if (depth !== 1) continue; // top-level sections only
      let h: Element | null = null;
      for (const ch of clause.children) {
        if (/^h[1-6]$/i.test(ch.tagName)) {
          h = ch;
          break;
        }
      }
      if (h) {
        secs.push({
          id: clause.id,
          title: (h.textContent ?? "").replace(/\s+/g, " ").trim(),
        });
      }
    }
    sectionsBySlug[slug] = secs;
    if (!secs.length) {
      const t = (main.querySelector("p")?.textContent ?? "").replace(
        /\s+/g,
        " ",
      ).trim();
      if (t) ledeBySlug[slug] = t.length > 180 ? t.slice(0, 179) + "…" : t;
    }
  }
  const hrefFor = (slug: string) =>
    slug === "index" ? `${basePath}/` : `${basePath}/${slug}/`;
  const fmtTime = (m: number) =>
    m >= 60
      ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""}`
      : `${m} min`;

  for (const page of pages) {
    const document = page.document;
    if (!document) continue;

    // Annotate the sidebar: a "~12 min" label per chapter and a spec-wide
    // total line above the list. Runs on every page (the sidebar is shared).
    const list = document.querySelector(".sidebar-list");
    if (list) {
      for (const li of Array.from(list.children)) {
        if (li.tagName?.toLowerCase() !== "li") continue;
        const a = li.querySelector("a");
        if (!a) continue;
        const href = a.getAttribute("href") ?? "";
        const rel = href.startsWith(basePath)
          ? href.slice(basePath.length)
          : href;
        const m = minutes[slugOf(rel)];
        if (!m) continue;
        const span = document.createElement("span");
        span.setAttribute("class", "ch-time");
        span.textContent = fmtTime(m);
        a.appendChild(span);
      }
      if (totalMin && !document.querySelector(".sidebar-readtime")) {
        const tot = document.createElement("div");
        tot.setAttribute("class", "sidebar-readtime");
        tot.textContent = `Full read · ~${fmtTime(totalMin)}`;
        list.parentElement?.insertBefore(tot, list);
      }
    }

    const tocOl = document.querySelector("aside.toc > ol");
    const main = document.querySelector("main");
    if (!tocOl || !main) continue;

    // Sidebar inline TOC: clone the top-level entries into a nested <ol>
    // under the current chapter's <li>. Mirrors Nextra's <File> rendering
    // h2 anchors as a <ul> child of the active item (sidebar.js:249-258).
    // Mobile users have no other way to reach in-page anchors, since
    // aside.toc is display:none below 1100px; CSS hides this inline copy
    // again above 1100px so we don't duplicate the right-rail TOC.
    const sidebarCurrent = document.querySelector(".sidebar-list li.current");
    let sidebarToc: Element | null = null;
    if (sidebarCurrent) {
      sidebarToc = document.createElement("ol");
      sidebarToc.setAttribute("class", "sidebar-toc");
      sidebarCurrent.appendChild(sidebarToc);
    }

    const clauses = main.querySelectorAll("emu-clause[id]");
    for (const clause of clauses) {
      // Depth = how many <emu-clause> wrappers we're nested inside.
      let depth = 0;
      let p = clause.parentElement;
      while (p) {
        if (p.tagName?.toLowerCase() === "emu-clause") depth++;
        p = p.parentElement;
      }
      // Skip the chapter-top clause (depth 0) — it's the page title, the TOC
      // is per-section.
      if (depth < 1) continue;

      // First direct-child h1-h6 of this clause carries its visible title.
      let heading: Element | null = null;
      for (const child of clause.children) {
        if (/^h[1-6]$/i.test(child.tagName)) {
          heading = child;
          break;
        }
      }
      if (!heading) continue;
      const text = (heading.textContent ?? clause.id).replace(/\s+/g, " ")
        .trim();

      const li = document.createElement("li");
      li.setAttribute("data-level", String(depth));
      const a = document.createElement("a");
      a.setAttribute("href", `#${clause.id}`);
      a.textContent = text;
      li.appendChild(a);
      tocOl.appendChild(li);

      // Only top-level sections of the active chapter go into the sidebar
      // inline TOC — matches Nextra's h2-only rendering and keeps the
      // mobile menu uncluttered.
      if (sidebarToc && depth === 1) {
        const sli = document.createElement("li");
        const sa = document.createElement("a");
        sa.setAttribute("href", `#${clause.id}`);
        sa.textContent = text;
        sli.appendChild(sa);
        sidebarToc.appendChild(sli);
      }
    }

    // Drop the empty <ol> on pages with no top-level sections (e.g. the
    // introduction stub) so we don't leave a hollow container behind.
    if (sidebarToc && !sidebarToc.firstChild) {
      sidebarToc.remove();
    }

    // Pages with no sections have an empty right-rail TOC. Match Nextra, which
    // renders the "On This Page" heading + list only when there are headings:
    // drop the heading and the empty <ol>, leaving just the feedback link, and
    // flag the <aside> so its CSS can drop the now-orphaned top rule.
    if (!tocOl.firstChild) {
      const aside = document.querySelector("aside.toc");
      aside?.querySelector("h2")?.remove();
      tocOl.remove();
      aside?.classList.add("toc-empty");
    }

    // "Up next" preview (idea E): a teaser of the following chapter — its
    // top-level sections (or, failing that, its opening sentence) — inserted
    // just above the prev/next links to carry a cover-to-cover reader forward.
    const here = slugOf(page.data.url as string);
    const ci = chapters.findIndex((c: { slug: string }) => c.slug === here);
    const nextCh = ci >= 0 && ci + 1 < chapters.length
      ? chapters[ci + 1]
      : null;
    if (nextCh) {
      const nextHref = hrefFor(nextCh.slug);
      const box = document.createElement("aside");
      box.setAttribute("class", "up-next");

      const label = document.createElement("span");
      label.setAttribute("class", "un-label");
      label.textContent = "Up next";
      box.appendChild(label);

      const title = document.createElement("a");
      title.setAttribute("class", "un-title");
      title.setAttribute("href", nextHref);
      title.textContent = nextCh.title;
      box.appendChild(title);

      const secs = sectionsBySlug[nextCh.slug] ?? [];
      const SHOW = 6;
      if (secs.length) {
        const ul = document.createElement("ul");
        ul.setAttribute("class", "un-secs");
        for (const s of secs.slice(0, SHOW)) {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.setAttribute("href", `${nextHref}#${s.id}`);
          a.textContent = s.title;
          li.appendChild(a);
          ul.appendChild(li);
        }
        if (secs.length > SHOW) {
          const li = document.createElement("li");
          li.setAttribute("class", "un-more");
          li.textContent = `+${secs.length - SHOW} more`;
          ul.appendChild(li);
        }
        box.appendChild(ul);
      } else if (ledeBySlug[nextCh.slug]) {
        const p = document.createElement("p");
        p.setAttribute("class", "un-lede");
        p.textContent = ledeBySlug[nextCh.slug];
        box.appendChild(p);
      }

      const nav = main.querySelector("nav.prev-next");
      if (nav) main.insertBefore(box, nav);
      else main.appendChild(box);
    }
  }
});

// Run the build inline when this file is the entry point. Keeps us off the
// Lume CLI's deno.json discovery path, which doesn't see ours when the CLI
// is fetched from deno.land.
if (import.meta.main) {
  await site.build();
  // The xref hover-card index is derived from the fully rendered HTML (clause
  // ids + headings + dfns), so it runs after the build writes _site/. The
  // dist assembler copies _site/ verbatim, so dist/<edition>/xref-index.json
  // rides along with no extra step.
  const n = writeXrefIndex(site.dest());
  console.log(`✓ xref-index: ${n} entries`);
  // Glossary page, derived from the same rendered HTML. Only the ecmarkup-
  // sourced editions (ES2016+ / draft) carry the <dfn> markup it needs.
  if (hasGlossary) {
    const basePath = Deno.env.get("BASE_PATH") ?? "";
    const g = writeGlossary(site.dest(), basePath, titleMain);
    console.log(`✓ glossary (${currentEditionId}): ${g} terms`);
  }
}

export default site;
