// Build the xref hover-card index for an edition: fragment id -> {num, title,
// summary, kind}. Scans the rendered HTML in a built site directory (so it sees
// the final clause ids / headings / dfns, post-TOC-processing). Written to
// <siteDir>/xref-index.json; the page shell lazy-fetches it on first hover.
//
// Keyed by bare fragment id and built over every page of the edition, so a
// cross-page xref (href ".../other-page#frag") resolves the same as a
// same-page one — the client only looks at the "#frag" part.
import fs from "node:fs";
import path from "node:path";

const strip = (html) =>
  html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#x?\w+;/g, " ")
    .replace(/\s+/g, " ").trim();

const clip = (s, n = 240) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// Match each clause/annex opener, its <h1>…</h1>, then the run of body markup
// up to the next clause opener (the clause's own intro, not a child's).
const clauseRe =
  /<emu-(?:clause|annex|intro)\b[^>]*\bid="([^"]+)"[^>]*>\s*<h1>([\s\S]*?)<\/h1>([\s\S]*?)(?=<emu-(?:clause|annex|intro)\b|$)/g;
const dfnRe = /<dfn\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/dfn>/g;

export function buildXrefIndex(siteDir) {
  // Null-prototype map: spec ids include Object.prototype property names
  // ("constructor", "toString", "__proto__", …). On a plain {} the
  // `if (index[id])` guards would see the inherited member (truthy) and skip
  // storing the real entry — "constructor" is a dfn referenced 600+ times —
  // and `index["__proto__"] = …` would hit the prototype setter instead of
  // adding a key. A null-proto object has none of those.
  const index = Object.create(null);
  const pages = fs.readdirSync(siteDir, { withFileTypes: true })
    .filter((e) =>
      e.isDirectory() && !["img", "pagefind", "fonts"].includes(e.name) &&
      fs.existsSync(path.join(siteDir, e.name, "index.html"))
    )
    .map((e) => e.name);

  for (const slug of pages) {
    const html = fs.readFileSync(
      path.join(siteDir, slug, "index.html"),
      "utf8",
    );

    // dfn terms first: title = the defined term, summary = the sentence that
    // defines it. A clause with the same id (rare) overrides below.
    let d;
    while ((d = dfnRe.exec(html)) !== null) {
      const id = d[1];
      if (id in index) continue;
      const term = strip(d[2]);
      // Enclosing block (<p>/<li>/<dd>): take its full text, not just up to
      // the first child close tag, so multi-clause paragraphs aren't cut off.
      const before = html.slice(0, d.index);
      const cands = [["p", before.lastIndexOf("<p")], [
        "li",
        before.lastIndexOf("<li"),
      ], ["dd", before.lastIndexOf("<dd")]].sort((a, b) => b[1] - a[1]);
      const [tag, open] = cands[0];
      let summary = term;
      if (open >= 0) {
        const contentStart = html.indexOf(">", open) + 1;
        const blockClose = html.indexOf(`</${tag}`, d.index);
        const text = strip(
          html.slice(contentStart, blockClose >= 0 ? blockClose : d.index),
        );
        // Start at the sentence containing the term (a paragraph can define
        // several terms — "constructor" sits after the "function object"
        // sentence), so the card opens on "A constructor is …", not the
        // paragraph's first, unrelated sentence.
        const at = text.toLowerCase().indexOf(term.toLowerCase());
        const dot = at > 0 ? text.lastIndexOf(". ", at) : -1;
        summary = (dot >= 0 ? text.slice(dot + 2) : text).trim() || term;
      }
      index[id] = {
        num: "",
        title: term,
        summary: clip(summary),
        kind: "term",
      };
    }

    let m;
    while ((m = clauseRe.exec(html)) !== null) {
      const id = m[1];
      if (index[id] && index[id].kind !== "term") continue;
      const h1 = m[2];
      const numMatch = h1.match(/<span class="secnum">([^<]*)<\/span>/);
      const num = numMatch ? strip(numMatch[1]) : "";
      const title = strip(
        h1.replace(/<span class="secnum">[\s\S]*?<\/span>/, ""),
      );
      const pMatch = m[3].match(/<p\b[^>]*>([\s\S]*?)<\/p>/);
      const summary = pMatch ? clip(strip(pMatch[1])) : "";
      index[id] = { num, title, summary };
    }
  }
  return index;
}

export function writeXrefIndex(siteDir) {
  const index = buildXrefIndex(siteDir);
  fs.writeFileSync(
    path.join(siteDir, "xref-index.json"),
    JSON.stringify(index),
  );
  return Object.keys(index).length;
}

// CLI: node xref-index.mjs <siteDir>
if (import.meta.main || process.argv[1]?.endsWith("xref-index.mjs")) {
  const dir = process.argv[2] ?? "_site";
  const n = writeXrefIndex(dir);
  console.error(`xref-index: ${n} entries -> ${dir}/xref-index.json`);
}
