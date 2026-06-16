// Generate the per-edition glossary page (_site/glossary/index.html) after the
// build, from the rendered HTML's <dfn> elements. Reuses the edition's own
// page shell (header / sidebar / theme) by cloning the intro page and swapping
// the <main> body, so the glossary gets the version switcher, search and dark
// mode for free and stays visually identical to the spec pages.
//
// Run after site.build() (see _config.ts), like the xref index. Only the
// ecmarkup-sourced editions (ES2016+ / draft) call this — see editions.ts
// `hasGlossary`. The page rides into dist/<edition>/glossary/ via the same
// _site copy and is picked up by the later pagefind pass.
import fs from "node:fs";
import path from "node:path";

const strip = (h) =>
  h.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#x?\w+;/g, " ")
    .replace(/\s+/g, " ").trim();
const clip = (s, n = 240) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const dfnRe = /<dfn\b([^>]*)>([\s\S]*?)<\/dfn>/g;
// Tolerates the optional Normative Optional / Legacy / Deprecated badge between
// the clause opener and its <h1> (mirrors xref-index.mjs).
const clauseRe =
  /<emu-(?:clause|annex|intro)\b[^>]*\bid="([^"]+)"[^>]*>\s*(?:<div class="attributes-tag">[\s\S]*?<\/div>\s*)?<h1>([\s\S]*?)<\/h1>/g;
const attrOf = (t, n) => {
  const m = t.match(new RegExp(`\\b${n}="([^"]*)"`));
  return m ? m[1] : "";
};

// Alphabetical key that ignores symbols: "%Array%" sorts and groups as
// "Array", "[[HTMLDDA]] internal slot" as "HTMLDDA …". Terms with no
// letters/digits fall back to the "#" group.
const sortKey = (term) => term.toLowerCase().replace(/[^a-z0-9]+/g, "");
const groupLetter = (term) => {
  const k = sortKey(term);
  return k && /[a-z]/.test(k[0]) ? k[0].toUpperCase() : "#";
};

// Walk every page's <dfn>s into glossary entries: term, inflected variants,
// the defining sentence, and a link to where the term is defined (its own
// dfn id, else the enclosing clause).
export function buildGlossary(siteDir, basePath) {
  const pages = fs.readdirSync(siteDir, { withFileTypes: true })
    .filter((e) =>
      e.isDirectory() && !["img", "pagefind", "fonts", "glossary"].includes(
        e.name,
      ) && fs.existsSync(path.join(siteDir, e.name, "index.html"))
    ).map((e) => e.name);

  const entries = [];
  for (const slug of pages) {
    const html = fs.readFileSync(
      path.join(siteDir, slug, "index.html"),
      "utf8",
    );
    // Clause openers with their byte offset, for nearest-ancestor lookup.
    const clauses = [];
    let c;
    while ((c = clauseRe.exec(html)) !== null) {
      const h1 = c[2];
      const num =
        (h1.match(/<span class="secnum">([^<]*)<\/span>/) || [, ""])[1];
      const title = strip(
        h1.replace(/<span class="secnum">[\s\S]*?<\/span>/, ""),
      );
      clauses.push({ idx: c.index, id: c[1], num: strip(num), title });
    }
    const nearest = (i) => {
      let best = null;
      for (const cl of clauses) {
        if (cl.idx <= i) best = cl;
        else break;
      }
      return best;
    };

    let d;
    while ((d = dfnRe.exec(html)) !== null) {
      const term = strip(d[2]);
      if (!term) continue;
      const id = attrOf(d[1], "id");
      const variants = (attrOf(d[1], "variants") || "").split(",").map((s) =>
        s.trim()
      ).filter(Boolean).filter((v) => v.toLowerCase() !== term.toLowerCase());
      const cl = nearest(d.index);
      // Summary: the sentence containing the term, taken from the enclosing
      // block (<p>/<li>/<dd>) so a multi-term paragraph opens on the right one.
      const before = html.slice(0, d.index);
      const cands = [["p", before.lastIndexOf("<p")], [
        "li",
        before.lastIndexOf("<li"),
      ], ["dd", before.lastIndexOf("<dd")]].sort((a, b) => b[1] - a[1]);
      const [tag, open] = cands[0];
      let summary = "";
      if (open >= 0) {
        const cs = html.indexOf(">", open) + 1;
        const ce = html.indexOf(`</${tag}`, d.index);
        const text = strip(html.slice(cs, ce >= 0 ? ce : d.index));
        const at = text.toLowerCase().indexOf(term.toLowerCase());
        const dot = at > 0 ? text.lastIndexOf(". ", at) : -1;
        summary = (dot >= 0 ? text.slice(dot + 2) : text).trim();
      }
      const frag = id || (cl ? cl.id : "");
      const href = `${basePath}/${slug}/${frag ? "#" + frag : ""}`;
      entries.push({
        term,
        variants,
        num: cl ? cl.num : "",
        sectitle: cl ? cl.title : "",
        href,
        summary: clip(summary),
      });
    }
  }

  // Dedupe by lowercased term (first wins), then sort case-insensitively.
  const seen = new Set();
  const uniq = entries.filter((e) => {
    const k = e.term.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  uniq.sort((a, b) =>
    sortKey(a.term).localeCompare(sortKey(b.term)) ||
    a.term.toLowerCase().localeCompare(b.term.toLowerCase())
  );
  return uniq;
}

// The <main> inner HTML: a sticky A–Z jump bar, then one <dl> per letter.
function renderMain(entries) {
  const groups = new Map();
  for (const e of entries) {
    const L = groupLetter(e.term);
    if (!groups.has(L)) groups.set(L, []);
    groups.get(L).push(e);
  }
  const letters = [...groups.keys()].sort();
  // "#" groups the non-alphabetic entries (intrinsics like %Array%); use a
  // literal-safe slug for its id/href fragment.
  const slug = (L) => (L === "#" ? "sym" : L);
  const az = letters.map((L) => `<a href="#gl-${slug(L)}">${L}</a>`).join("");

  let body = "";
  for (const L of letters) {
    body += `<h2 id="gl-${slug(L)}" class="gl-letter">${L}</h2>` +
      `<dl class="gl-list">`;
    for (const e of groups.get(L)) {
      const vs = e.variants.length
        ? `<span class="gl-var">${
          esc(e.variants.slice(0, 4).join(", "))
        }</span>`
        : "";
      const loc = e.num
        ? `<a class="gl-loc" href="${esc(e.href)}">§${esc(e.num)} ${
          esc(e.sectitle)
        }</a>`
        : "";
      const sum = e.summary ? `${esc(e.summary)} ` : "";
      body += `<dt><a class="gl-term" href="${esc(e.href)}">${esc(e.term)}</a>${
        vs ? " " + vs : ""
      }</dt><dd>${sum}${loc}</dd>`;
    }
    body += `</dl>`;
  }

  return `<h1 class="gl-h1">Glossary</h1>` +
    `<p class="gl-lede">${entries.length} terms defined in this edition. ` +
    `Jump by initial; each entry links to where it is defined.</p>` +
    `<nav class="gl-az" aria-label="Jump to letter">${az}</nav>${body}`;
}

// Clone the intro page's shell and swap in the glossary body. Returns the
// number of terms (0 if no template page was found).
export function writeGlossary(siteDir, basePath, editionLabel = "ECMA-262") {
  const entries = buildGlossary(siteDir, basePath);
  const tpl = path.join(siteDir, "index.html");
  if (!fs.existsSync(tpl)) return 0;
  let html = fs.readFileSync(tpl, "utf8");
  const main = renderMain(entries);

  // Swap the <main> body and tag it .glossary for scoped styling.
  html = html.replace(/<main\b([^>]*)>[\s\S]*<\/main>/, (_m, attrs) => {
    const a = /\bclass="/.test(attrs)
      ? attrs.replace(/class="([^"]*)"/, 'class="$1 glossary"')
      : attrs + ' class="glossary"';
    return `<main${a}>${main}</main>`;
  });

  // Empty the right-rail TOC (it described the intro's sections) and flag it
  // so the existing toc-empty CSS drops the orphaned top rule.
  html = html.replace(
    /(<aside\b[^>]*\bclass=")([^"]*\btoc\b[^"]*)("[^>]*>)[\s\S]*?<\/aside>/,
    (_m, pre, cls, post) =>
      `${pre}${cls.includes("toc-empty") ? cls : cls + " toc-empty"}${post}` +
      `</aside>`,
  );

  // Move the sidebar "current" highlight off the intro chapter and onto the
  // Glossary entry (added by sidebar.tsx for these editions).
  html = html.replace(
    /<li class="current( group-start)?"/g,
    (_m, g) => (g ? '<li class="group-start"' : "<li"),
  );
  html = html.replace(
    /<li(?:\s+class="([^"]*)")?>(\s*<a\b[^>]*href="[^"]*\/glossary\/")/,
    (_m, cls, a) => `<li class="${cls ? cls + " " : ""}current">${a}`,
  );
  // Drop the intro's injected inline TOC, if any.
  html = html.replace(/<ol class="sidebar-toc">[\s\S]*?<\/ol>/, "");

  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>Glossary — ${esc(editionLabel)}</title>`,
  );

  // Glossary-only client: flattens the A–Z bar's top when it sticks (see
  // glossary.js + the .gl-az.stuck CSS). Injected here so it loads only on
  // this page rather than across the whole site.
  html = html.replace(
    "</body>",
    `<script defer src="${basePath}/glossary.js"></script></body>`,
  );

  const dir = path.join(siteDir, "glossary");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return entries.length;
}

// CLI: node glossary.mjs <siteDir> [basePath] [label]
if (process.argv[1]?.endsWith("glossary.mjs")) {
  const n = writeGlossary(
    process.argv[2] ?? "_site",
    process.argv[3] ?? "",
    process.argv[4] ?? "ECMA-262",
  );
  console.error(`glossary: ${n} terms`);
}
