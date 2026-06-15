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
// up to the next clause opener (the clause's own intro, not a child's). The
// optional <div class="attributes-tag"> sits between the opener and the <h1>
// on Normative Optional / Legacy / Deprecated clauses (e.g. sec-with-statement)
// — without allowing for it those clauses fall out of the index entirely.
const clauseRe =
  /<emu-(?:clause|annex|intro)\b[^>]*\bid="([^"]+)"[^>]*>\s*(?:<div class="attributes-tag">[\s\S]*?<\/div>\s*)?<h1>([\s\S]*?)<\/h1>([\s\S]*?)(?=<emu-(?:clause|annex|intro)\b|$)/g;
const dfnRe = /<dfn\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/dfn>/g;
// Grammar productions, equations and tables carry ids that are linked just as
// often as clauses (productions alone are ~89% of otherwise-unresolved xref
// targets). Capture each opener's attributes + inner so we can pull name/aoid/
// caption and a short text rendering for the hover card.
const prodRe = /<emu-production\b([^>]*)>([\s\S]*?)<\/emu-production>/g;
const eqnRe = /<emu-eqn\b([^>]*)>([\s\S]*?)<\/emu-eqn>/g;
const tableRe = /<emu-table\b([^>]*)>/g;
// Labelled algorithm steps (id="step-…"): summary = the step's own text, up to
// its first nested <ol> of substeps.
const stepRe = /<li\b[^>]*\bid="(step-[^"]+)"[^>]*>([\s\S]*?)(?:<ol|<\/li>)/g;
const attrOf = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : "";
};

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

    // Grammar productions: title = the nonterminal name, summary = the
    // production rendered as text ("StrWhiteSpace ::: StrWhiteSpaceChar
    // StrWhiteSpace opt"). First occurrence wins (a production is shown on
    // several pages; the rendering is identical).
    let pr;
    while ((pr = prodRe.exec(html)) !== null) {
      const id = attrOf(pr[1], "id");
      if (!id || id in index) continue;
      const name = attrOf(pr[1], "name") || id.replace(/^prod-/, "");
      // Space out the <emu-mods> "opt" marker so it doesn't fuse onto the
      // preceding nonterminal ("StrWhiteSpaceopt" -> "StrWhiteSpace opt").
      index[id] = {
        num: "",
        title: name,
        summary: clip(strip(pr[2].replace(/<emu-mods>/g, " <emu-mods>"))),
        kind: "grammar",
      };
    }

    // Equations / notation (𝔽, ℝ, truncate(x), …): title = the abstract-op id
    // when present, summary = the equation text.
    let eq;
    while ((eq = eqnRe.exec(html)) !== null) {
      const id = attrOf(eq[1], "id");
      if (!id || id in index) continue;
      const aoid = attrOf(eq[1], "aoid");
      index[id] = {
        num: "",
        title: aoid || id,
        summary: clip(strip(eq[2])),
        kind: "equation",
      };
    }

    // Tables: num = "Table N" (data-num), title = the caption.
    let tb;
    while ((tb = tableRe.exec(html)) !== null) {
      const id = attrOf(tb[1], "id");
      if (!id || id in index) continue;
      const caption = strip(attrOf(tb[1], "caption"));
      const dataNum = attrOf(tb[1], "data-num");
      index[id] = {
        num: dataNum ? `Table ${dataNum}` : "",
        title: caption || id,
        summary: "",
        kind: "table",
      };
    }

    // Algorithm steps: the card shows the step's text so a "… as defined in
    // step N" reference is readable without scrolling to it.
    let st;
    while ((st = stepRe.exec(html)) !== null) {
      const id = st[1];
      if (id in index) continue;
      const text = clip(strip(st[2]));
      if (!text) continue;
      index[id] = { num: "", title: "Step", summary: text, kind: "step" };
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
