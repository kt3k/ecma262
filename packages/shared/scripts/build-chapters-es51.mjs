// ES5.1 re-skin ingester — PROTOTYPE (Approach A, phase P0).
//
// ES5.1 predates ecmarkup, so unlike build-chapters.mjs (which *resolves*
// ecmarkup source) this script *consumes* the official, already-rendered HTML
// from 262.ecma-international.org/5.1/ and re-skins it. Everything is
// pre-resolved (section numbers, xref text, tokenised grammar, numbered
// algorithm steps), so the job is purely: split the recursive <section> tree
// into chapters/headings and emit the same scratch contract build-pages.ts
// already consumes (lib/<slug>.jsx + content/<slug>.mdx + content/_meta.js).
//
// See docs/es5.1-plan.md. This prototype converts ONE chapter (default sec-9);
// run it through `EDITION=es5.1 deno task pages && deno task build` to render.
//
// Usage:
//   node build-chapters-es51.mjs --input ecma262/es5.1/spec.html \
//     --lib-dir <dir> --content-dir <dir> --public-img-dir <dir> \
//     --base-path "" [--only sec-9]

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
    only: { type: "string", default: "sec-9" }, // prototype: one chapter
  },
});

const INPUT = values.input;
const LIB_DIR = values["lib-dir"];
const CONTENT_DIR = values["content-dir"];
const PUBLIC_IMG_DIR = values["public-img-dir"];
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

// --- convert one chapter ------------------------------------------------------
const root = parseSections(src);
// Top-level chapters are <section id="sec-…"> directly under <body> (root here).
const chapter = root.children.find((c) => c.id === ONLY);
if (!chapter) {
  throw new Error(`chapter ${ONLY} not found in ${INPUT}`);
}

const head = splitHeading(chapter.inner);
const slug = slugify(head.title);
const sections = {}; // id -> own body HTML
const headings = []; // { id, num, title, level }

// Walk the section subtree, recording each node's heading + own body.
(function walk(node, level) {
  const h = splitHeading(node.inner);
  const id = node.id ?? `sec-${slug}-${headings.length}`;
  sections[id] = ownBody(node);
  headings.push({ id, num: h.num, title: h.title, level });
  for (const child of node.children) walk(child, level + 1);
})(chapter, 1);

// --- emit the scratch contract ------------------------------------------------
const secnumSpan = (n) => (n ? `<span className="secnum">${n}</span> ` : "");

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

// content/<slug>.mdx — each section becomes a nested <emu-clause id="…"> with
// its heading + <Sec> body, mirroring the modern build's renderMdxTree. The
// emu-clause carries the id so ES5.1's baked-in cross-references (#sec-9.x)
// resolve and depth-based heading CSS / the on-this-page TOC work.
const mdxLines = [
  `import { Sec } from '../lib/spec/${slug}'`,
  "",
  `<div id="spec-container" className="ecma-spec">`,
  "",
];
(function emitClause(node, level) {
  const h = splitHeading(node.inner);
  const id = node.id;
  const hashes = "#".repeat(Math.min(level, 6));
  mdxLines.push(`<emu-clause id="${id}">`, "");
  mdxLines.push(`${hashes} ${secnumSpan(h.num)}${h.title}`, "");
  mdxLines.push(`<Sec id="${id}" />`, "");
  for (const child of node.children) emitClause(child, level + 1);
  mdxLines.push(`</emu-clause>`, "");
})(chapter, 1);
mdxLines.push(`</div>`);
const mdx = mdxLines.join("\n").replace(/\n{3,}/g, "\n\n").replace(
  /\n*$/,
  "\n",
);
fs.writeFileSync(path.join(CONTENT_DIR, `${slug}.mdx`), mdx);

// content/_meta.js — slug -> display title.
const meta = { [slug]: `${head.num} ${plain(head.title)}` };
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
  `[es5.1] chapter ${ONLY} → slug "${slug}", ${headings.length} sections, ` +
    `${componentSrc.length + mdx.length} bytes`,
);
