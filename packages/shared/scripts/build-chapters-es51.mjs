// ES5.1 re-skin ingester (Approach A, phase P1).
//
// ES5.1 predates ecmarkup, so unlike build-chapters.mjs (which *resolves*
// ecmarkup source) this script *consumes* the official, already-rendered HTML
// from 262.ecma-international.org/5.1/ and re-skins it. Everything is
// pre-resolved (section numbers, xref text, tokenised grammar, numbered
// algorithm steps), so the job is purely: split the recursive <section> tree
// into chapters/headings and emit the same scratch contract build-pages.ts
// already consumes (lib/<slug>.jsx + content/<slug>.mdx + content/_meta.js).
//
// See docs/es5.1-plan.md. Converts every top-level chapter (sec-1…sec-16),
// annex (sec-A…sec-F), and the Introduction / Bibliography front/back matter.
// Run via `EDITION=es5.1 deno task pages && deno task build`.
//
// Usage:
//   node build-chapters-es51.mjs --input ecma262/es5.1/spec.html \
//     --lib-dir <dir> --content-dir <dir> --public-img-dir <dir> \
//     --base-path "" [--only sec-9]   # --only restricts to one chapter (debug)

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    "lib-dir": { type: "string" },
    "content-dir": { type: "string" },
    "public-img-dir": { type: "string" },
    "base-path": { type: "string", default: "" },
    only: { type: "string" }, // optional: restrict to one chapter id (debug)
  },
});

const INPUT = values.input;
const LIB_DIR = values["lib-dir"];
const CONTENT_DIR = values["content-dir"];
const PUBLIC_IMG_DIR = values["public-img-dir"];
const BASE_PATH = values["base-path"] ?? "";
const ONLY = values.only;

for (const [k, v] of Object.entries({ INPUT, LIB_DIR, CONTENT_DIR })) {
  if (!v) throw new Error(`missing required --${k.toLowerCase()}`);
}
fs.mkdirSync(LIB_DIR, { recursive: true });
fs.mkdirSync(CONTENT_DIR, { recursive: true });

const src = fs.readFileSync(INPUT, "utf8");

// --- recursive <section> tree -------------------------------------------------
// The official HTML is well-formed: every <section ...> has a matching
// </section>. Scan the open/close tokens with a stack to recover the tree.
// Each node carries its raw inner HTML (between its open and close tag).
function parseSections(html) {
  const tokenRe = /<section\b([^>]*)>|<\/section>/gi;
  const root = { children: [], inner: html };
  const stack = [root];
  let lastIndex = 0;
  let m;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[0].startsWith("</")) {
      const node = stack.pop();
      node.inner = html.slice(node.innerStart, m.index);
      node.end = tokenRe.lastIndex;
    } else {
      const attrs = m[1] ?? "";
      const idMatch = attrs.match(/\bid="([^"]*)"/);
      const node = {
        id: idMatch ? idMatch[1] : null,
        attrs,
        children: [],
        start: m.index,
        innerStart: tokenRe.lastIndex,
      };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    lastIndex = tokenRe.lastIndex;
  }
  void lastIndex;
  return root;
}

// Pull the leading <h1>…</h1> out of a section's inner HTML, returning the
// section number, the rich title HTML, and the body with the heading removed.
function splitHeading(inner) {
  const h1Re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i;
  const m = inner.match(h1Re);
  if (!m) return { num: "", title: "", rest: inner };
  const h1 = m[1];
  // <span class="secnum"><a ...>NUM</a></span> TITLE
  const secnum = h1.match(
    /<span class="secnum">(?:<a\b[^>]*>)?([\s\S]*?)(?:<\/a>)?<\/span>/i,
  );
  const num = secnum ? secnum[1].replace(/<[^>]+>/g, "").trim() : "";
  let title = h1.replace(
    /<span class="secnum">[\s\S]*?<\/span>/i,
    "",
  ).trim();
  // Collapse the source's wrapped-line whitespace so titles read as one line.
  title = title.replace(/\s+/g, " ").trim();
  const rest = inner.slice(m.index + m[0].length);
  return { num, title, rest };
}

// A section's *own* body = its inner HTML with the leading <h1> and every direct
// child <section> removed (children are emitted as their own headings + <Sec>).
function ownBody(node) {
  const { rest } = splitHeading(node.inner);
  // Remove child sections from `rest` by blanking their full [start,end) spans
  // (offsets are relative to the whole document, so re-locate within `rest`).
  let body = rest;
  for (const child of node.children) {
    const childHtml = src.slice(child.start, child.end);
    body = body.replace(childHtml, "");
  }
  return body.trim();
}

const plain = (html) =>
  html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const slugify = (title) =>
  plain(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
    /^-+|-+$/g,
    "",
  );

// --- classify the top-level sections -----------------------------------------
const root = parseSections(src);
const secnumSpan = (n) => (n ? `<span className="secnum">${n}</span> ` : "");
// Strip a leading "(informative)"/"(normative)" status word so annex slugs read
// from the real title ("Grammar Summary"), not the status.
const titleForSlug = (titlePlain) =>
  titlePlain.replace(/^\(\w+\)\s*/, "").trim();

// Front-matter sections that are page furniture, not content.
const SKIP = new Set(["Copyright notice", "Contents"]);

// Pick the top-level content sections in document order: the numbered chapters
// (sec-1…sec-16), the lettered annexes (sec-A…sec-F), and the unnumbered
// Introduction / Bibliography front/back matter.
const chapters = [];
for (const node of root.children) {
  const h = splitHeading(node.inner);
  const titlePlain = plain(h.title);
  if (node.id === "contents" || SKIP.has(titlePlain)) continue;
  if (!titlePlain && !node.id) continue;
  chapters.push({ node, head: h, titlePlain });
}
// Assign a unique slug + synthetic chapter id to every content chapter up front
// (document order), so the global id→slug map is complete before we rewrite any
// cross-chapter link.
const usedSlugs = new Set();
for (const c of chapters) {
  let slug = slugify(titleForSlug(c.titlePlain)) || "section";
  while (usedSlugs.has(slug)) slug += "-x";
  usedSlugs.add(slug);
  c.slug = slug;
  c.chapterId = c.node.id ?? `sec-${slug}`;
}

// Global map: every section id (at any depth) → the slug of the page it lives
// on. ES5.1's baked-in cross-references are bare same-page #sec-X.Y anchors;
// once the single document is split into per-chapter pages they must point at
// the right page. Mirrors how build-chapters.mjs bakes basePath into xrefs.
const idToSlug = {};
for (const c of chapters) {
  (function collect(n, fb, i) {
    const id = n.id ?? `${fb}-${i}`;
    idToSlug[id] = c.slug;
    n.children.forEach((child, ci) => collect(child, id, ci));
  })(c.node, c.chapterId, 0);
}
const rewriteXrefs = (html) =>
  html.replace(/href="#(sec-[^"]+)"/g, (m, id) => {
    const slug = idToSlug[id];
    return slug ? `href="${BASE_PATH}/${slug}#${id}"` : m;
  });

const wanted = ONLY ? chapters.filter((c) => c.node.id === ONLY) : chapters;
if (wanted.length === 0) throw new Error(`no chapters matched (only=${ONLY})`);

// --- convert each chapter to the scratch contract ----------------------------
const meta = {}; // slug -> display title, in document order

for (const { node, head, titlePlain, slug, chapterId } of wanted) {
  // Walk the subtree → { id: own body HTML }, rewriting cross-page links.
  const sections = {};
  (function walk(n, fallbackBase, i) {
    const id = n.id ?? `${fallbackBase}-${i}`;
    sections[id] = rewriteXrefs(ownBody(n));
    n.children.forEach((child, ci) => walk(child, id, ci));
  })(node, chapterId, 0);

  // lib/<slug>.jsx — the Sec component holding every section's body HTML.
  const componentSrc = [
    "// Generated from ecma262/es5.1/spec.html (re-skin) — do not edit by hand.",
    `const sections = ${JSON.stringify(sections)};`,
    "export function Sec({ id }) {",
    "  const html = sections[id] ?? '';",
    "  return <div dangerouslySetInnerHTML={{ __html: html }} />;",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(LIB_DIR, `${slug}.jsx`), componentSrc);

  // content/<slug>.mdx — each section is a nested <emu-clause id="…"> with its
  // heading + <Sec> body, mirroring the modern build's renderMdxTree. All wraps
  // are emu-clause so _config.ts's depth-by-emu-clause TOC works for chapters
  // and annexes alike; the emu-clause id makes ES5.1's baked-in #sec-X.Y links
  // resolve. Unnumbered intro/biblio simply have an empty secnum (no number).
  const mdxLines = [
    `import { Sec } from '../lib/spec/${slug}'`,
    "",
    `<div id="spec-container" className="ecma-spec">`,
    "",
  ];
  (function emitClause(n, level, fallbackBase, i) {
    const h = splitHeading(n.inner);
    const id = n.id ?? `${fallbackBase}-${i}`;
    const hashes = "#".repeat(Math.min(level, 6));
    mdxLines.push(`<emu-clause id="${id}">`, "");
    mdxLines.push(`${hashes} ${secnumSpan(h.num)}${h.title}`, "");
    mdxLines.push(`<Sec id="${id}" />`, "");
    n.children.forEach((child, ci) => emitClause(child, level + 1, id, ci));
    mdxLines.push(`</emu-clause>`, "");
  })(node, 1, chapterId, 0);
  mdxLines.push(`</div>`);
  const mdx = mdxLines.join("\n").replace(/\n{3,}/g, "\n\n").replace(
    /\n*$/,
    "\n",
  );
  fs.writeFileSync(path.join(CONTENT_DIR, `${slug}.mdx`), mdx);

  // Sidebar/page label: "9 Type Conversion…", "Annex A (informative) …", or the
  // bare title for unnumbered front matter.
  meta[slug] = head.num ? `${head.num} ${titlePlain}` : titlePlain;
}

// content/_meta.js — slug -> display title, in document order.
fs.writeFileSync(
  path.join(CONTENT_DIR, "_meta.js"),
  `export default ${JSON.stringify(meta, null, 2)}\n`,
);

// img/ — mirror the two ES5.1 figures if present.
if (PUBLIC_IMG_DIR) {
  fs.mkdirSync(PUBLIC_IMG_DIR, { recursive: true });
  const imgSrc = path.join(path.dirname(INPUT), "img");
  if (fs.existsSync(imgSrc)) {
    for (const name of fs.readdirSync(imgSrc)) {
      fs.copyFileSync(path.join(imgSrc, name), path.join(PUBLIC_IMG_DIR, name));
    }
  }
}

console.log(
  `[es5.1] converted ${Object.keys(meta).length} chapters: ${
    Object.keys(meta).join(", ")
  }`,
);
