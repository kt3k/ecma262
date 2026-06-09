// ES3 re-skin ingester (re-skin the bclary HTML). See docs/es3-plan.md.
//
// ECMA-262 3rd Edition predates ecmarkup AND ECMA's clean HTML re-publication,
// so the source is Bob Clary's community rendering
// (bclary.com/2004/11/07/ecma-262.html, vendored as ecma262/es3/spec.html).
// Its markup is one big <dl>: each section is a <dt><a name="a-X.Y.Z">number
// title</a></dt> followed by a <dd> body, with hierarchy carried by the dotted
// number (sections are flat DOM siblings — a <dd> holds only its own body).
//
// This emits the same scratch contract build-pages.ts consumes (lib/<slug>.jsx
// + content/<slug>.mdx + content/_meta.js), reusing the ES5.1 re-skin pipeline
// (xref → basePath URLs, dark-mode colour neutralisation, image paths).
//
// Usage:
//   node build-chapters-es3.mjs --input ecma262/es3/spec.html \
//     --lib-dir <dir> --content-dir <dir> --public-img-dir <dir> \
//     --base-path "" [--only a-9]   # --only restricts to one chapter (debug)

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
    only: { type: "string" },
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

const plain = (html) =>
  html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const slugify = (title) =>
  plain(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
    /^-+|-+$/g,
    "",
  );

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- parse the flat <dt>/<dd> section list -----------------------------------
// Each section: <dt><a name="a-X.Y.Z" id=…>NUM [title]</a>[title]</dt><dd>…</dd>.
// Grammar <dt>s have no a- anchor, so this only matches real sections.
const dtRe =
  /<dt>\s*<a\s+name="(a-[0-9A-Za-z.]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/dt>/g;
const raw = [];
let m;
while ((m = dtRe.exec(src)) !== null) {
  raw.push({
    id: m[1],
    anchor: m[2],
    rest: m[3],
    start: m.index,
    dtEnd: dtRe.lastIndex,
  });
}
if (raw.length === 0) throw new Error("no <dt> sections found");

const sections = raw.map((s, i) => {
  const num = s.id.slice(2); // "a-9.3" -> "9.3"
  // Body = slice from this </dt> to the START of the next *section* <dt> (not
  // any <dt> — the body's own <dl class="grammar"> contains grammar <dt>s, so
  // stopping at the first <dt> would truncate the Syntax block). Strip the
  // wrapping <dd>…</dd>; inner grammar <dl>s are carried through.
  const end = i + 1 < raw.length ? raw[i + 1].start : src.length;
  const body = src.slice(s.dtEnd, end)
    .replace(/^\s*<dd>/i, "").replace(/<\/dd>\s*$/i, "").trim();
  const title = `${s.anchor}${s.rest}`
    .replace(new RegExp(`^\\s*${reEsc(num)}\\.?\\s*`), "")
    .replace(/\s+/g, " ").trim();
  return { id: s.id, num, title, body, depth: num.split(".").length };
});

// --- group into top-level chapters + rebuild each chapter's tree -------------
const want = (s) => !ONLY || s.id === ONLY || s.id.startsWith(`${ONLY}.`);
const chosen = sections.filter(want);
if (chosen.length === 0) throw new Error(`no sections matched (only=${ONLY})`);

// Build the nesting tree from the flat, document-ordered list by dot-depth.
const roots = [];
const stack = [];
for (const s of chosen) {
  const node = { ...s, children: [] };
  while (stack.length && stack[stack.length - 1].depth >= s.depth) stack.pop();
  (stack.length ? stack[stack.length - 1].children : roots).push(node);
  stack.push(node);
}

// Front matter → the edition root (index) page, and the two informative
// annexes (Grammar Summary / Compatibility). These live outside the numbered
// <dt> list: the intro is an <h2>-bounded block, and each annex is its own
// <dl> whose subsections carry no anchors, so each becomes a single page.
// Skipped in --only debug mode.
const leaf = (id, slug, title, body) => ({
  id,
  slug,
  num: "",
  title,
  body: body.trim(),
  children: [],
});
const frontMatter = () => {
  const bh = src.indexOf("Brief History");
  if (bh < 0) return null;
  const start = src.indexOf("</h2>", bh) + 5;
  const next = src.indexOf("<h2", start);
  const note = '<p class="es3-source-note">This is the ' +
    '<a href="https://bclary.com/2004/11/07/ecma-262.html">bclary.com</a> ' +
    "community HTML rendering of the 3rd Edition — not the official ECMA text " +
    "(which exists only as a PDF). It is not normative.</p>";
  return leaf(
    "index",
    "index",
    "Introduction",
    note + src.slice(start, next < 0 ? src.length : next),
  );
};
const annex = (letter, id, endPos) => {
  const open = new RegExp(
    `<dt>\\s*<a\\s+name="${id}"[\\s\\S]*?</dt>\\s*<dd>\\(informative\\)</dd>`,
    "i",
  );
  const mm = open.exec(src);
  if (!mm) return null;
  const region = src.slice(mm.index + mm[0].length, endPos);
  const tm = region.match(/^\s*(?:<\/dl>\s*<dl>\s*)?<dt>([\s\S]*?)<\/dt>/i);
  const titleText = tm ? plain(tm[1]) : "";
  const body = tm ? region.slice(tm[0].length) : region;
  return leaf(
    id,
    slugify(titleText) || `annex-${letter.toLowerCase()}`,
    `Annex ${letter} (informative): ${titleText}`,
    body,
  );
};

let pages = roots;
if (!ONLY) {
  const annexBPos = src.search(/<dt>\s*<a\s+name="annex-b"/);
  const metabottom = src.indexOf('class="metabottom"');
  const end = (n) => (n >= 0 ? n : src.length);
  pages = [
    frontMatter(),
    ...roots,
    annex("A", "annex-a", end(annexBPos >= 0 ? annexBPos : metabottom)),
    annex("B", "annex-b", end(metabottom)),
  ].filter(Boolean);
}

// --- re-skin pipeline (shared shape with build-chapters-es51.mjs) ------------
const pathFor = (slug) => `${BASE_PATH}${slug === "index" ? "" : `/${slug}`}`;
const idToSlug = {}; // filled once chapter slugs are known
const rewriteXrefs = (html) =>
  html.replace(/href="#(a-[0-9A-Za-z.]+)"/g, (full, id) => {
    const slug = idToSlug[id];
    return slug ? `href="${pathFor(slug)}#${id}"` : full;
  });
// Hardcoded inline colours → theme-aware (dark mode); see ES5.1 ingester.
const themeColors = (html) =>
  html.replace(
    /style="([^"]*)"/g,
    (_m, css) =>
      `style="${
        css.replace(/#000000\b/gi, "currentColor").replace(
          /\bblack\b/gi,
          "currentColor",
        )
          .replace(/#c0c0c0\b/gi, "rgba(128, 128, 128, 0.25)")
      }"`,
  );
const imgPaths = (html) =>
  html.replace(
    /\b(src|data)="([^"/]+\.(?:svg|png|jpe?g|gif))"/gi,
    (_m, attr, file) => `${attr}="${BASE_PATH}/img/${file}"`,
  );
const reskin = (html) => imgPaths(themeColors(rewriteXrefs(html)));

const secnumSpan = (n) => (n ? `<span className="secnum">${n}</span> ` : "");

// --- assign chapter slugs + global id→slug map -------------------------------
for (const c of pages) {
  c.slug = c.slug || slugify(c.title) || `section-${c.num}`;
  (function map(n) {
    idToSlug[n.id] = c.slug;
    n.children.forEach(map);
  })(c);
}

// --- emit each chapter to the scratch contract -------------------------------
const meta = {};
for (const chapter of pages) {
  const slug = chapter.slug;
  const secMap = {};
  (function collect(n) {
    secMap[n.id] = reskin(n.body);
    n.children.forEach(collect);
  })(chapter);

  const componentSrc = [
    "// Generated from ecma262/es3/spec.html (re-skin) — do not edit by hand.",
    `const sections = ${JSON.stringify(secMap)};`,
    "export function Sec({ id }) {",
    "  const html = sections[id] ?? '';",
    "  return <div dangerouslySetInnerHTML={{ __html: html }} />;",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(LIB_DIR, `${slug}.jsx`), componentSrc);

  const mdxLines = [
    `import { Sec } from '../lib/spec/${slug}'`,
    "",
    `<div id="spec-container" className="ecma-spec ecma-es3">`,
    "",
  ];
  (function emit(n, level) {
    const hashes = "#".repeat(Math.min(level, 6));
    mdxLines.push(`<emu-clause id="${n.id}">`, "");
    // Titles can contain xref links (e.g. method headings like "[[Put]]"), so
    // run the full re-skin (xref rewrite included), not just colour fixup.
    mdxLines.push(`${hashes} ${secnumSpan(n.num)}${reskin(n.title)}`, "");
    mdxLines.push(`<Sec id="${n.id}" />`, "");
    n.children.forEach((child) => emit(child, level + 1));
    mdxLines.push(`</emu-clause>`, "");
  })(chapter, 1);
  mdxLines.push(`</div>`);
  const mdx = mdxLines.join("\n").replace(/\n{3,}/g, "\n\n").replace(
    /\n*$/,
    "\n",
  );
  fs.writeFileSync(path.join(CONTENT_DIR, `${slug}.mdx`), mdx);

  meta[slug] = chapter.num
    ? `${chapter.num} ${plain(chapter.title)}`
    : plain(chapter.title);
}

fs.writeFileSync(
  path.join(CONTENT_DIR, "_meta.js"),
  `export default ${JSON.stringify(meta, null, 2)}\n`,
);

// img/ — mirror any vendored ES3 figures.
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
  `[es3] converted ${Object.keys(meta).length} chapter(s): ${
    Object.keys(meta).join(", ")
  }`,
);
