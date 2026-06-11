import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import hljs from "highlight.js";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    "content-dir": { type: "string", default: "content" },
    "lib-dir": { type: "string", default: "lib/spec" },
    "public-img-dir": { type: "string", default: "public/img" },
    "base-path": { type: "string", default: "" },
  },
});
if (!values.input) {
  console.error("build-chapters: --input <spec.html> is required");
  process.exit(1);
}
const SPEC_FILE = path.resolve(values.input);
const SPEC_IMG_DIR = path.join(path.dirname(SPEC_FILE), "img");
const CONTENT_DIR = path.resolve(values["content-dir"]);
const LIB_DIR = path.resolve(values["lib-dir"]);
const PUBLIC_IMG_DIR = path.resolve(values["public-img-dir"]);
// Baked into xref hrefs at build time. Empty for local dev (URLs are root-
// relative), '/ecma262/draft' / '/ecma262/es2025' / … in CI per site.
const BASE_PATH = values["base-path"];

let src = fs.readFileSync(SPEC_FILE, "utf8");

// <emu-import> pulls in an external fragment (the large Unicode property
// tables live in table-*.html next to spec.html); ecmarkup inlines them at
// build time. Without this the imported emu-tables never render AND the
// global Table-N counter runs behind ecmarkup's, shifting every later
// "Table N" xref. The fragments are vendored alongside each edition's
// spec.html.
src = src.replace(
  /<emu-import\b[^>]*href="([^"]+)"[^>]*>\s*<\/emu-import>/g,
  (full, href) => {
    const p = path.join(path.dirname(SPEC_FILE), href);
    if (!fs.existsSync(p)) {
      console.warn(`[build-chapters] emu-import not vendored: ${href}`);
      return full;
    }
    return fs.readFileSync(p, "utf8");
  },
);

// Table captions arrive three ways; normalise the first two onto the caption
// attribute the float-numbering + caption CSS already consume:
//   • <emu-caption> child element (the imported Unicode tables, Table 91)
//   • type="abstract methods" of="X" → ecmarkup synthesises "Abstract
//     Methods of X" (Table 14, 39, …)
//   • the informative attribute renders as "Table N (Informative): …"
//     (handled in numberFloats via the data-num attribute).
const stripTags = (s) =>
  s.replace(/<[^>]+>/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
src = src.replace(
  /<emu-table\b([^>]*)>(\s*)<emu-caption>([\s\S]*?)<\/emu-caption>/g,
  (_m, attrs, ws, cap) =>
    `<emu-table${attrs} caption="${
      stripTags(cap).replace(/"/g, "&quot;")
    }">${ws}`,
);
src = src.replace(/<emu-table\b[^>]*>/g, (tag) => {
  if (/\bcaption="/.test(tag)) return tag;
  const type = tag.match(/\btype="([^"]+)"/)?.[1];
  const of = tag.match(/\bof="([^"]+)"/)?.[1];
  if (!type || !of) return tag;
  const title = type.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return tag.replace(/>$/, ` caption="${title} of ${of}">`);
});

// Spec images (`<img src="img/…">`, `<object data="img/…">`) use root-relative
// paths in the source. Chapter pages render one level below the edition root
// (/<base>/<slug>/), so a bare "img/…" would resolve to /<slug>/img/… and 404.
// Bake the deploy basePath in, the same way xref hrefs do (see pathFor).
// ES2015 references its figures by bare filename (src="figure-1.png", no
// img/ prefix) — point those at the img/ dir too.
src = src.replace(/\b(src|data)="img\//g, `$1="${BASE_PATH}/img/`);
src = src.replace(
  /\b(src|data)="([^"/:]+\.(?:svg|png|jpe?g|gif))"/gi,
  (_m, attr, file) => `${attr}="${BASE_PATH}/img/${file}"`,
);

// The early ecmarkup editions (ES2015/ES2016) carry hand-authored inline table
// styling — per-cell black borders and grey header backgrounds (#A6A6A6 /
// #BFBFBF) — that breaks in dark mode and looks unlike every later edition's
// emu-table grid. Scoped to table cells: drop the inline borders (so emu-table
// CSS draws a consistent grid) and make the grey shades theme-aware. A no-op
// for ES2017+ and the draft, whose tables carry no inline styles.
src = src.replace(
  /<(th|td|tr|table|col|thead|tbody)\b([^>]*?)\sstyle="([^"]*)"([^>]*)>/gi,
  (_full, tag, pre, css, post) => {
    const fixed = css
      .replace(/border[a-z-]*\s*:\s*[^;"]*;?/gi, "")
      .replace(/#a6a6a6\b/gi, "rgba(128, 128, 128, 0.28)")
      .replace(/#bfbfbf\b/gi, "rgba(128, 128, 128, 0.16)")
      .replace(/\b(?:black|#000000)\b/gi, "currentColor")
      .replace(/\s*;\s*/g, "; ").replace(/^[;\s]+|[;\s]+$/g, "").trim();
    return fixed
      ? `<${tag}${pre} style="${fixed}"${post}>`
      : `<${tag}${pre}${post}>`;
  },
);

// Find top-level chapters: <emu-intro>, <emu-clause>, <emu-annex> opening on
// their own line. Modern (es2016+) specs put these at column 0; the ES2015
// ecmarkup import indents the whole spec under <html><body>, so its top-level
// clauses sit at 4 spaces while nested ones go deeper. Capture the leading
// indent and keep only the shallowest-indented openings as the chapter
// boundaries — that unifies both layouts (min indent = 0 for es2016+, 4 for
// es2015) without special-casing either. `offset` points past the indent at
// the `<` so the block slices/close-tag checks below stay indent-agnostic.
const startRe = /^([ \t]*)<(emu-(?:intro|clause|annex))\b([^>]*)>[ \t]*$/gm;
const allStarts = [];
let m;
while ((m = startRe.exec(src)) !== null) {
  allStarts.push({
    indent: m[1].length,
    tag: m[2],
    attrs: m[3],
    offset: m.index + m[1].length,
  });
}
if (allStarts.length === 0) throw new Error("No top-level chapters found");
const minIndent = Math.min(...allStarts.map((s) => s.indent));
const starts = allStarts.filter((s) => s.indent === minIndent);

const bodyClose = src.lastIndexOf("</body>");
const tailEnd = bodyClose >= 0 ? bodyClose : src.length;

const chapters = [];
for (let i = 0; i < starts.length; i++) {
  const s = starts[i];
  const e = i + 1 < starts.length ? starts[i + 1].offset : tailEnd;
  // Strip trailing non-chapter siblings that sit between this chapter's close
  // tag and the next chapter's start, so the close-tag check below sees the
  // block ending at its own close tag:
  //   - ES2016/2017 prefix each top-level clause with a legacy
  //     `<!-- es6num="N" -->` comment (lands at the previous block's tail).
  //   - ES2015 interleaves `<emu-placeholder for="…">` nodes (e.g. inner-title
  //     between the intro and the first clause).
  // The comment body uses `(?!-->)` so a single comment can't backtrack across
  // `-->` and swallow the nested clauses that sit between two such comments.
  const block = src.slice(s.offset, e).trimEnd()
    .replace(
      /(?:\s*(?:<!--(?:(?!-->)[\s\S])*-->|<emu-placeholder\b[^>]*>(?:<\/emu-placeholder>)?)\s*)+$/,
      "",
    );
  const open = block.match(/^<emu-(?:intro|clause|annex)\b[^>]*>/);
  const close = block.match(/<\/emu-(?:intro|clause|annex)>\s*$/);
  if (!open || !close) {
    throw new Error(
      `Chapter ${i} (${s.tag}) missing open/close at offset ${s.offset}`,
    );
  }
  let inner = block.slice(open[0].length, block.length - close[0].length)
    .trim();
  const idMatch = s.attrs.match(/\bid="([^"]+)"/);
  const id = idMatch ? idMatch[1] : `chapter-${i}`;
  const titleMatch = inner.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const titleHtml = titleMatch ? titleMatch[1] : id;
  const title = titleHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() ||
    id;
  // Strip the leading h1 since we render the title separately as a markdown heading.
  if (titleMatch) {
    inner = inner.slice(0, titleMatch.index) +
      inner.slice(titleMatch.index + titleMatch[0].length);
    inner = inner.replace(/^\s+/, "");
  }
  // `back-matter` annexes (Bibliography, Colophon) are unlettered in ecmarkup.
  // Annexes are informative by default; a `normative` attribute marks the
  // exceptions (e.g. Annex B, web-compat features).
  const backMatter = /\bback-matter\b/.test(s.attrs);
  const normative = /\bnormative\b/.test(s.attrs);
  // offset/endOffset are kept so post-processing can resolve which chapter a
  // given src position (e.g. a grammar production definition) falls in.
  chapters.push({
    id,
    title,
    inner,
    kind: s.tag,
    backMatter,
    normative,
    offset: s.offset,
    endOffset: e,
  });
}

// Locate the first nested section opener (<emu-clause or <emu-annex) at or
// after `from`. Returns { idx, tag } or null. Skips matches that are inside
// attribute values by requiring the next char to terminate the tag name.
// Clause/step annotations that render as an uppercase tag + tinted region
// (ecmarkup's SPECIAL_KINDS): carried as attributes on <emu-clause>, on
// algorithm steps (leading [normative-optional] annotations), and on inline
// <span>/<ul> elements (which pass through the pipeline verbatim).
const SPECIAL_KINDS = [
  ["normative-optional", "Normative Optional"],
  ["legacy", "Legacy"],
  ["deprecated", "Deprecated"],
];
// Match a kind as a standalone token (id="sec-conformance-legacy" must not
// count); strip quoted values first so ids/oldids can't false-positive.
const kindsIn = (attrText) => {
  const bare = attrText.replace(/"[^"]*"/g, '""');
  return SPECIAL_KINDS.filter(([a]) =>
    new RegExp(`(?:^|[\\s[,])${a}(?=[\\s\\],=]|$)`).test(bare)
  );
};
const attributesTag = (kinds) =>
  `<div class="attributes-tag">${kinds.map(([, l]) => l).join(", ")}</div>`;

function findNextSection(html, from) {
  let i = from;
  while (i < html.length) {
    const a = html.indexOf("<emu-clause", i);
    const b = html.indexOf("<emu-annex", i);
    const idx = a === -1 ? b : b === -1 ? a : Math.min(a, b);
    if (idx === -1) return null;
    const tag = (a !== -1 && idx === a) ? "emu-clause" : "emu-annex";
    const next = html.charCodeAt(idx + 1 + tag.length);
    // Valid tag boundary: whitespace or '>'
    if (
      next === 0x20 || next === 0x09 || next === 0x0A || next === 0x0D ||
      next === 0x3E
    ) {
      return { idx, tag };
    }
    i = idx + 1;
  }
  return null;
}

// ── ecmarkup "structured header" transform ──────────────────────────────────
// Clauses whose <h1> holds a typed signature (e.g. "Foo ( _x_: a Number ): a
// Boolean") immediately followed by <dl class="header"> are processed by
// ecmarkup at build time: the return type is stripped from the heading and a
// descriptive preamble paragraph ("The abstract operation Foo takes argument
// _x_ (a Number) and returns a Boolean. It performs the following steps when
// called:") is synthesised from the signature plus the dl entries (for /
// description). Upstream we inject the raw ecmarkup *source*, which skips this
// pass, so we replicate it here. Port of ecmarkup src/header-parser.ts
// (parseHeader / formatHeader / formatPreamble) and src/Clause.ts.

function formatEnglishList(list, conjunction = "and") {
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} ${conjunction} ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, ${conjunction} ${
    list[list.length - 1]
  }`;
}

// Parse the raw <h1> inner source into { prefix, name, params, optionalParams,
// returnType }, or null if it doesn't look like a signature. Faithful subset of
// ecmarkup's parseHeader (no ins/del/mark diff wrappers — absent in releases).
function parseStructuredH1(source) {
  let text = source.replace(/^\s*/, "");
  let prefix = null;
  let m;
  if ((m = text.match(/^(Static|Runtime) Semantics:\s*/i))) {
    prefix = m[0].trimEnd();
    text = text.slice(m[0].length);
  }
  if (!(m = text.match(/^[^(\s]+\s*/))) return null;
  const name = m[0].trimEnd();
  text = text.slice(m[0].length);
  const params = [];
  const optionalParams = [];
  if (text === "") {
    return { prefix, name, params, optionalParams, returnType: null };
  }
  // ecmarkup eats `( ` with literal spaces only, so a newline after `(` flags
  // the multi-line (typed) parameter form.
  if (!(m = text.match(/^\([ \t]*/))) return null;
  text = text.slice(m[0].length);
  if (text[0] === "\n") {
    text = text.replace(/^\s*/, "");
    while (true) {
      if ((m = text.match(/^\)\s*/))) {
        text = text.slice(m[0].length);
        break;
      }
      let optional = false;
      if ((m = text.match(/^optional\s*/i))) {
        optional = true;
        text = text.slice(m[0].length);
      }
      if (!(m = text.match(/^[A-Za-z0-9_]+[ \t]*/))) return null;
      const pname = m[0].trimEnd();
      text = text.slice(m[0].length);
      if (!(m = text.match(/^:+[ \t]*/))) return null;
      text = text.slice(m[0].length);
      if (!(m = text.match(/^[^\n]+\n\s*/))) return null;
      let ptype = m[0].trimEnd();
      text = text.slice(m[0].length);
      if (ptype.endsWith(",")) ptype = ptype.slice(0, -1);
      (optional ? optionalParams : params).push({
        name: pname,
        type: ptype === "unknown" ? null : ptype,
      });
    }
  } else {
    let optional = false;
    while (true) {
      if ((m = text.match(/^\)\s*/))) {
        text = text.slice(m[0].length);
        break;
      }
      if ((m = text.match(/^\[(\s*,)?\s*/))) {
        optional = true;
        text = text.slice(m[0].length);
      }
      if (!(m = text.match(/^[A-Za-z0-9_]+\s*/))) return null;
      const pname = m[0].trimEnd();
      text = text.slice(m[0].length);
      (optional ? optionalParams : params).push({ name: pname, type: null });
      if ((m = text.match(/^((\s*\])+|,)\s*/))) text = text.slice(m[0].length);
    }
  }
  let returnType = null;
  if ((m = text.match(/^:[ \t]*/))) {
    text = text.slice(m[0].length);
    const r = text.match(/^.*/);
    if (r) {
      returnType = r[0].trim() || null;
      if (returnType === "unknown") returnType = null;
    }
  }
  return { prefix, name, params, optionalParams, returnType };
}

// "( a, b [ , c ] )" — param names verbatim (still carry ecmarkup shorthand
// like _x_, expanded to <var> downstream). Mirrors printSimpleParamList.
function formatSimpleParamList(params, optionalParams) {
  let result = "(" + params.map((p) => " " + p.name).join(",");
  if (optionalParams.length > 0) {
    result += optionalParams
      .map((p, i) => " [ " + (i > 0 || params.length > 0 ? ", " : "") + p.name)
      .join("");
    result += optionalParams.map(() => " ]").join("");
  }
  result += " )";
  return result;
}

// "no arguments" | "argument x (a Number)" | "arguments a (T) and b (U)" | …
function formatParamsClause(params, optionalParams) {
  const withType = (p) => (p.type != null ? `${p.name} (${p.type})` : p.name);
  if (params.length === 0 && optionalParams.length === 0) return "no arguments";
  let s = "";
  if (params.length > 0) {
    s += (params.length === 1 ? "argument" : "arguments") + " " +
      formatEnglishList(params.map(withType));
    if (optionalParams.length > 0) s += " and ";
  }
  if (optionalParams.length > 0) {
    s += "optional " +
      (optionalParams.length === 1 ? "argument" : "arguments") + " " +
      formatEnglishList(optionalParams.map(withType));
  }
  return s;
}

// The cleaned heading text: prefix + name + param list, with the return type
// dropped. `type="sdo"` headings drop the parameter list entirely.
function formatHeaderTitle(parsed, type) {
  let h = (parsed.prefix ? parsed.prefix + " " : "") + parsed.name + " " +
    formatSimpleParamList(parsed.params, parsed.optionalParams);
  if (type === "sdo" && h.includes("(")) {
    h = (h.substring(0, h.indexOf("(")) + h.substring(h.lastIndexOf(")") + 1))
      .trim();
  }
  return h;
}

// Pull <dt>/<dd> pairs out of the structured header <dl>. Only `for` and
// `description` feed the preamble; effects / skip-checks are dropped.
function parseHeaderDl(dlInner) {
  const out = { for: null, description: null };
  const re = /<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi;
  let m;
  while ((m = re.exec(dlInner)) !== null) {
    const label = m[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
    const value = m[2].trim();
    if (label === "for" && out.for === null) out.for = value;
    else if (label === "description" && out.description === null) {
      out.description = value;
    }
  }
  return out;
}

// Build the section body that replaces the structured header: the synthesised
// preamble paragraph(s) followed by `rest` (the original content after the dl).
// Mirrors formatPreamble, including where the trailing "It performs the
// following steps…" sentence lands (inline vs its own <p> before the algorithm).
function buildStructuredBody(clauseType, parsed, dlEntries, rest) {
  const type = (clauseType || "").toLowerCase();
  const name = parsed.name;
  const formattedParams = formatParamsClause(
    parsed.params,
    parsed.optionalParams,
  );
  let main;
  switch (type) {
    case "numeric method":
    case "abstract operation":
      main = `The abstract operation ${name}`;
      break;
    case "host-defined abstract operation":
      main = `The host-defined abstract operation ${name}`;
      break;
    case "implementation-defined abstract operation":
      main = `The implementation-defined abstract operation ${name}`;
      break;
    case "sdo":
    case "syntax-directed operation":
      main = `The syntax-directed operation ${name}`;
      break;
    case "internal method":
    case "concrete method":
      main = `The ${name} ${type} of ${dlEntries.for ?? ""}`;
      break;
    default:
      main = name;
  }
  main += ` takes ${formattedParams}`;
  if (parsed.returnType != null) main += ` and returns ${parsed.returnType}`;
  main += ".";

  const blockParas = [];
  if (dlEntries.description != null) {
    if (
      /^<(p|ul|ol|emu-alg|emu-note|figure|emu-table|dl|div)[\s>]/i.test(
        dlEntries.description,
      )
    ) {
      blockParas.push(dlEntries.description);
    } else {
      main += " " + dlEntries.description;
    }
  }

  const isSdo = type === "sdo" || type === "syntax-directed operation";
  const lastSentence = isSdo
    ? "It is defined piecewise over the following productions:"
    : "It performs the following steps when called:";
  const targetTag = isSdo ? "<emu-grammar" : "<emu-alg";
  // ecmarkup's adjacency rule (header-parser.ts): the sentence is emitted
  // only when the element DIRECTLY following the header dl — skipping
  // <emu-note>s — is the operation's <emu-alg> (without replaces-step) /
  // the SDO's <emu-grammar>. When prose intervenes, the source carries any
  // connective itself (FunctionDeclarationInstantiation hand-writes it; the
  // host hooks have none), so anything else here would double or invent it.
  let pos = 0;
  let skippedNotes = false;
  for (;;) {
    pos += rest.slice(pos).match(/^\s*/)[0].length;
    if (rest.startsWith("<emu-note", pos)) {
      const end = rest.indexOf("</emu-note>", pos);
      if (end === -1) break;
      pos = end + "</emu-note>".length;
      skippedNotes = true;
      continue;
    }
    break;
  }
  const openTag = rest.startsWith(targetTag, pos)
    ? rest.slice(pos, rest.indexOf(">", pos) + 1)
    : null;
  if (openTag && !(!isSdo && /\breplaces-step\b/.test(openTag))) {
    // Standalone paragraph when the intro isn't the immediately preceding
    // block (block description or skipped notes); else append to the intro.
    if (blockParas.length > 0 || skippedNotes) {
      const newRest = rest.slice(0, pos) + `<p>${lastSentence}</p>\n` +
        rest.slice(pos);
      return `<p>${main}</p>` + blockParas.join("") + newRest;
    }
    main += " " + lastSentence;
    return `<p>${main}</p>` + rest;
  }
  return `<p>${main}</p>` + blockParas.join("") + rest;
}

// Recursively split inner HTML into a tree of nested <emu-clause>/<emu-annex>
// subsections. Returns { pre, children: [{ id, title, tree }] } where `pre`
// is the HTML before the first nested section.
function parseTree(html) {
  const children = [];
  // Parent prose can continue between/after nested clauses (sec-conformance's
  // "A conforming implementation…" follows the example subclauses); gaps[k]
  // holds the parent-owned content after child k so it renders in the parent
  // at its true position instead of being glued into the child.
  const gaps = {};
  let pre = "";
  let i = 0;
  while (i < html.length) {
    const found = findNextSection(html, i);
    if (!found) {
      const rest = html.slice(i);
      if (children.length === 0) pre += rest;
      else if (rest.trim() !== "") {
        gaps[children.length - 1] = (gaps[children.length - 1] ?? "") + rest;
      }
      break;
    }
    const { idx: openIdx, tag } = found;
    const openClose = `</${tag}>`;
    const openEnd = html.indexOf(">", openIdx);
    if (openEnd === -1) throw new Error(`Malformed <${tag}>`);
    const openTag = html.slice(openIdx, openEnd + 1);
    let depth = 1;
    let j = openEnd + 1;
    let innerEnd = -1;
    while (depth > 0) {
      const nextOpenInfo = findNextSection(html, j);
      const nextClose = html.indexOf(openClose, j);
      if (nextClose === -1) throw new Error(`Unclosed <${tag}>`);
      const sameTagOpen = nextOpenInfo && nextOpenInfo.tag === tag
        ? nextOpenInfo.idx
        : -1;
      if (sameTagOpen !== -1 && sameTagOpen < nextClose) {
        depth++;
        j = sameTagOpen + tag.length + 1;
      } else {
        depth--;
        if (depth === 0) {
          innerEnd = nextClose;
          j = nextClose + openClose.length;
          break;
        }
        j = nextClose + openClose.length;
      }
    }
    const innerStart = openEnd + 1;
    const innerHtml = html.slice(innerStart, innerEnd);
    const attrs = openTag.slice(tag.length + 1, -1);
    const idMatch = attrs.match(/\bid="([^"]+)"/);
    const id = idMatch ? idMatch[1] : "";
    const typeMatch = attrs.match(/\btype="([^"]+)"/);
    const clauseType = typeMatch ? typeMatch[1] : null;
    const titleMatch = innerHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const titleHtml = titleMatch ? titleMatch[1] : id;
    let title;
    let innerStripped;
    // Structured header: <h1> signature immediately followed by <dl class="header">.
    const afterH1 = titleMatch
      ? innerHtml.slice(titleMatch.index + titleMatch[0].length)
      : "";
    const dlMatch = titleMatch &&
      afterH1.match(/^\s*<dl class="header">([\s\S]*?)<\/dl>/);
    const parsedHeader = dlMatch ? parseStructuredH1(titleHtml) : null;
    if (dlMatch && parsedHeader && parsedHeader.name) {
      title = formatHeaderTitle(parsedHeader, clauseType);
      const rest = afterH1.slice(dlMatch[0].length);
      innerStripped = buildStructuredBody(
        clauseType,
        parsedHeader,
        parseHeaderDl(dlMatch[1]),
        rest,
      )
        .replace(/^\s+/, "");
    } else {
      title = titleHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      innerStripped = titleMatch
        ? (innerHtml.slice(0, titleMatch.index) + afterH1).replace(/^\s+/, "")
        : innerHtml;
    }
    const preText = html.slice(i, openIdx);
    if (children.length === 0) pre += preText;
    else if (preText.trim() !== "") {
      gaps[children.length - 1] = (gaps[children.length - 1] ?? "") + preText;
    }
    children.push({
      id,
      title,
      kinds: kindsIn(attrs),
      tree: parseTree(innerStripped),
    });
    i = j;
  }
  return { pre, children, gaps };
}

// Walk the tree and collect [secPath, html, clauseId] entries. clauseId is the
// id of the clause that DIRECTLY contains this section's prose (its own
// immediate clause, not its ancestors) — used by applyDfnLinkSubst to suppress
// auto-linking a defined term within the exact clause that defines it. tc39
// only suppresses the term in that one clause's own body; sub-clauses still
// link it, so we track the immediate clause rather than the ancestor chain.
function flattenTree(tree, prefix = "", clauseId = "") {
  const sections = [[prefix, tree.pre, clauseId]];
  tree.children.forEach((child, idx) => {
    const newPrefix = prefix === "" ? String(idx + 1) : `${prefix}.${idx + 1}`;
    sections.push(...flattenTree(child.tree, newPrefix, child.id));
    // Parent prose after this child (tree.gaps) — its immediate clause is the
    // PARENT's, both for rendering position and dfn-link suppression.
    if (tree.gaps?.[idx]) {
      sections.push([`${newPrefix}~`, tree.gaps[idx], clauseId]);
    }
  });
  return sections;
}

// A=0, B=1, ..., Z=25, AA=26, AB=27, ...
function annexLabel(n) {
  let s = "";
  let x = n;
  while (true) {
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26) - 1;
    if (x < 0) break;
  }
  return s;
}

// Decode the named HTML entities that ecmarkup actually uses in headings —
// enough for the spec's "&lt;&lt;", "&infin;", "&ldquo;" etc. without pulling
// in a full HTML entity table. Numeric refs (&#123; / &#xAB;) covered too.
function decodeEntities(s) {
  return s
    .replace(
      /&#x([0-9a-fA-F]+);/g,
      (_, n) => String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&infin;/g, "∞")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&amp;/g, "&"); // must be last so we don't double-decode
}

// Emit MDX lines: <Sec id=... /> for any prelude text, then for each child
// open an <emu-clause id="sec-…">, emit the heading (with the section number
// wrapped in <span class="secnum">), recurse, and close. The wrapping
// matches tc39.es/ecma262's serialisation so CSS rules like
// `emu-clause > h1`, `emu-clause emu-clause`, and `:target` work the same.
function renderMdxTree(tree, chapterPrefix, secPath, depth) {
  const lines = [];
  if (tree.pre.trim() !== "") {
    lines.push(`<Sec id=${JSON.stringify(secPath)} />`);
    lines.push("");
  }
  tree.children.forEach((child, idx) => {
    const childSecPath = secPath === ""
      ? String(idx + 1)
      : `${secPath}.${idx + 1}`;
    const childNum = chapterPrefix === ""
      ? childSecPath
      : `${chapterPrefix}.${childSecPath}`;
    const hashes = "#".repeat(Math.min(depth, 6));
    const idAttr = child.id ? ` id="${child.id}"` : "";
    // Run inline ecmarkup markup on the heading text (it still contains
    // `_x_`, `*foo*`, ~enum~, etc.), and let MDX parse the resulting
    // <var>/<b>/<emu-…> tags inline.
    // The markdown level (#, ##, …) is depth-based so Nextra's compile-time
    // TOC plugin (which scans h2/h3) can build the right-hand outline. At
    // render time mdx-components.jsx aliases h2-h6 to <h1>, so the rendered
    // DOM has only <h1>s (matching tc39.es/ecma262); depth-based sizing then
    // comes from the emu-clause-nesting CSS rules.
    const kindAttrs = (child.kinds ?? []).map(([a]) => ` ${a}=""`).join("");
    lines.push(`<emu-clause${idAttr}${kindAttrs}>`);
    lines.push("");
    if (child.kinds?.length) {
      // ecmarkup prepends the tag inside the clause, above the heading.
      lines.push(attributesTag(child.kinds).replace("class=", "className="));
      lines.push("");
    }
    // After the inline transforms, any remaining underscore is literal title
    // text (__proto__, __defineGetter__, SQRT1_2) — escape it or the MDX
    // heading line reads __proto__ as markdown strong emphasis and renders
    // "Object.prototype.<strong>proto</strong>". Entity-escaping is safe
    // inside emitted hrefs too (it decodes back to the same character).
    lines.push(
      `${hashes} <span className="secnum">${childNum}</span> ${
        transformInlineText(child.title).replace(/_/g, "&#95;")
      }`,
    );
    lines.push("");
    lines.push(
      ...renderMdxTree(child.tree, chapterPrefix, childSecPath, depth + 1),
    );
    lines.push("");
    lines.push("</emu-clause>");
    lines.push("");
    // Parent prose that follows this child renders here, outside the child's
    // clause (and outside any badge box it may carry).
    if (tree.gaps?.[idx]) {
      lines.push(`<Sec id=${JSON.stringify(`${childSecPath}~`)} />`);
      lines.push("");
    }
  });
  return lines;
}

// Walk a tree and register every nested clause id → {number, slug} so we can
// resolve <emu-xref href="#id"> back to its rendered section number ("14.7.2").
function registerSectionIds(tree, chapPrefix, chapSlug, into) {
  tree.children.forEach((child, idx) => {
    const childPrefix = chapPrefix === ""
      ? String(idx + 1)
      : `${chapPrefix}.${idx + 1}`;
    if (child.id) {
      into.set(child.id, {
        number: childPrefix,
        slug: chapSlug,
        title: child.title,
      });
    }
    registerSectionIds(child.tree, childPrefix, chapSlug, into);
  });
}

// Pass 1: build chapter trees and a global id → section map, so cross-chapter
// xrefs can be resolved before any file is written.
let clauseIdx = 0;
let annexIdx = 0;
const idToSection = new Map();
const built = chapters.map((c) => {
  const slug = c.id.replace(/^sec-/, "");
  const pageSlug = c.kind === "emu-intro" ? "index" : slug;
  let chapterNum = "";
  if (c.kind === "emu-clause") {
    clauseIdx++;
    chapterNum = String(clauseIdx);
  } else if (c.kind === "emu-annex") {
    // back-matter annexes stay unnumbered (and don't consume a letter).
    chapterNum = c.backMatter ? "" : annexLabel(annexIdx++);
  }
  const tree = parseTree(c.inner);
  idToSection.set(c.id, { number: chapterNum, slug: pageSlug, title: c.title });
  registerSectionIds(tree, chapterNum, pageSlug, idToSection);
  return { ...c, slug, pageSlug, chapterNum, tree };
});

// Number every <emu-table>/<emu-figure> in document order (global counters,
// like ecmarkup) so empty <emu-xref> to them resolve to "Table N"/"Figure N"
// links and their captions can show the number. `idToLabel` is the non-clause
// xref resolver (id → { text, slug }); tableNum/figureNum drive the caption
// CSS via a data-num attribute. oldids are registered too so legacy anchors
// still resolve to text.
const idToLabel = new Map();
const tableNum = new Map();
const figureNum = new Map();
{
  let tN = 0;
  let fN = 0;
  const re = /<emu-(table|figure)\b([^>]*)>/g;
  for (const c of built) {
    let mm;
    while ((mm = re.exec(c.inner)) !== null) {
      // Count every float (even id-less ones) so numbers stay in document order
      // and later tables don't shift relative to ecmarkup.
      const isTable = mm[1] === "table";
      const n = isTable ? ++tN : ++fN;
      const idm = mm[2].match(/\bid="([^"]+)"/);
      if (!idm) continue;
      const id = idm[1];
      (isTable ? tableNum : figureNum).set(id, String(n));
      const entry = {
        text: `${isTable ? "Table" : "Figure"} ${n}`,
        slug: c.pageSlug,
      };
      idToLabel.set(id, entry);
      const oldids = mm[2].match(/\boldids="([^"]+)"/);
      if (oldids) {
        for (
          const o of oldids[1].split(",").map((s) => s.trim()).filter(Boolean)
        ) {
          idToLabel.set(o, entry);
        }
      }
    }
    re.lastIndex = 0;
  }
}

// Defined terms (<dfn>) → autolink target. Mirrors tc39.es/ecma262's
// auto-linking: every prose occurrence of a defined term (or one of its
// `variants`) becomes an <emu-xref><a>…</a></emu-xref> pointing at the term's
// anchor. A <dfn id="x"> links to #x (the dfn keeps that id, so the element is
// the target); an id-less <dfn> links to its nearest enclosing clause — which
// is exactly what ecmarkup does, since it mints no per-term anchor there.
// Built by scanning the source while tracking the clause-nesting stack, so a
// dfn's offset resolves both its enclosing clause id and (via the chapter
// range) its page slug. Keys are lowercased surface forms; matching is
// case-insensitive (see applyDfnLinkSubst).
// True when a surface form starts with a lowercase letter (so dfnAlt will make
// its first character case-lenient, matching both the lowercase form and a
// sentence-start capital).
const lowerFirst = (s) => {
  const c = s[0];
  return c.toLowerCase() === c && c.toUpperCase() !== c;
};
const dfnTargets = new Map();
{
  const re =
    /<(emu-clause|emu-intro|emu-annex)\b([^>]*)>|<\/(?:emu-clause|emu-intro|emu-annex)>|<dfn\b([^>]*)>([\s\S]*?)<\/dfn>/gi;
  const stack = []; // enclosing clause ids (null when a clause carries none)
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) {
      const idm = m[2].match(/\bid="([^"]+)"/);
      stack.push(idm ? idm[1] : null);
      continue;
    }
    if (m[0].startsWith("</")) {
      stack.pop();
      continue;
    }
    // <dfn …>…</dfn>
    const attrs = m[3];
    const term = decodeEntities(m[4].replace(/<[^>]+>/g, ""))
      .replace(/\s+/g, " ").trim();
    if (!term) continue;
    // Nearest enclosing clause with an id — the link target for an id-LESS dfn
    // (ecmarkup mints no per-term anchor there, so the reference points at the
    // clause). An id-bearing <dfn id="x"> instead targets #x. Either way the
    // resolved target id (`id` below) doubles as the self-reference guard: tc39
    // leaves a term plain only within the exact clause its link points at — for
    // an id-less dfn that's its enclosing clause; for an id-bearing dfn the
    // target is the dfn's own id, which never equals a clause id, so such terms
    // link even inside their defining clause (e.g. "integers" → #integer).
    let clauseId = null;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]) {
        clauseId = stack[i];
        break;
      }
    }
    const idm = attrs.match(/\bid="([^"]+)"/);
    const id = idm ? idm[1] : clauseId;
    if (!id) continue;
    const chap = chapters.find(
      (c) => c.offset <= m.index && m.index < c.endOffset,
    );
    if (!chap) continue;
    const b = built.find((x) => x.id === chap.id);
    if (!b) continue;
    const variants = (attrs.match(/\bvariants="([^"]*)"/)?.[1] ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    for (const surf of [term, ...variants]) {
      if (surf.length < 2) continue;
      const key = surf.toLowerCase();
      // First definition wins when two dfns share a surface form. `surface`
      // keeps the dfn's original casing so matching can stay case-sensitive
      // (see dfnAlt below); the key is lowercased only for lookup.
      const existing = dfnTargets.get(key);
      if (!existing) {
        dfnTargets.set(key, { slug: b.pageSlug, id, surface: surf });
      } else if (
        existing.id === id && lowerFirst(surf) && !lowerFirst(existing.surface)
      ) {
        // Same dfn offers both "Mathematical values" (term) and a lowercase
        // variant "mathematical values": prefer the lowercase surface, whose
        // first-char leniency (dfnAlt) matches BOTH cases. Keeping the uppercase
        // term would match only the capitalised form and drop the lowercase
        // occurrences (which tc39 links).
        existing.surface = surf;
      }
    }
  }
}

// Abstract-operation autolink targets — ecmarkup's `aoid` mechanism, separate
// from <dfn> terms. ecmarkup gives an aoid (and links every textual occurrence
// of it to the definition) to:
//   • any element with an explicit aoid="X" attribute — that element's own id is
//     the link target (e.g. <emu-eqn id="eqn-abs" aoid="abs">abs(_x_)</emu-eqn>);
//   • <emu-clause type="<t>"> for t in AOID_TYPES, whose aoid is the operation
//     name parsed from its own <h1> (text before the first "(", after dropping a
//     "Xxx Semantics:" SDO prefix), e.g. ThrowCompletion, Evaluation.
// Keys are the EXACT (case-sensitive) names. Mirrors tc39's aoidTypes list.
const AOID_TYPES = new Set([
  "abstract operation",
  "sdo",
  "syntax-directed operation",
  "host-defined abstract operation",
  "implementation-defined abstract operation",
  "numeric method",
]);
// ecmarkup only links these very common words when they're a call (`(` next).
const COMMON_AOS = new Set(["Call", "Set", "Type", "UTC", "remainder"]);
const aoTargets = new Map(); // exact aoid name → { slug, id }
{
  const slugAt = (index) => {
    const chap = chapters.find((c) => c.offset <= index && index < c.endOffset);
    return chap ? built.find((x) => x.id === chap.id)?.pageSlug ?? null : null;
  };
  // (A) explicit aoid="X" on any id-bearing element (the id is the link target).
  const aoidRe = /<([a-zA-Z][\w-]*)\b([^>]*\baoid="([^"]+)"[^>]*)>/g;
  let m;
  while ((m = aoidRe.exec(src)) !== null) {
    const aoid = m[3];
    const idm = m[2].match(/\bid="([^"]+)"/);
    if (!idm) continue; // no local anchor to point at → skip
    const slug = slugAt(m.index);
    if (slug && !aoTargets.has(aoid)) aoTargets.set(aoid, { slug, id: idm[1] });
  }
  // (B) emu-clause[type in AOID_TYPES] → aoid = the name from its own <h1>.
  const clauseRe = /<emu-clause\b([^>]*)>/g;
  while ((m = clauseRe.exec(src)) !== null) {
    const typeM = m[1].match(/\btype="([^"]+)"/);
    const idM = m[1].match(/\bid="([^"]+)"/);
    if (!typeM || !AOID_TYPES.has(typeM[1]) || !idM) continue;
    const after = src.slice(clauseRe.lastIndex);
    const h1M = after.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
    if (!h1M) continue;
    // The clause's own <h1> must precede any nested clause's.
    const nestPos = after.indexOf("<emu-clause");
    if (nestPos !== -1 && nestPos < h1M.index) continue;
    let name = decodeEntities(h1M[1].replace(/<[^>]+>/g, ""))
      .replace(/\s+/g, " ").trim()
      .replace(/^(?:[A-Za-z][\w-]*\s+)*Semantics:\s*/, "");
    const paren = name.indexOf("(");
    if (paren !== -1) name = name.slice(0, paren).trim();
    if (!/^[\p{L}\p{N}][\p{L}\p{N}_:.]*$/u.test(name)) continue; // single token
    const slug = slugAt(m.index);
    if (slug && !aoTargets.has(name)) aoTargets.set(name, { slug, id: idM[1] });
  }
}

// Add data-num="N" to <emu-table>/<emu-figure> so the caption CSS can render
// "Table N: <caption>" / "Figure N: <caption>". An informative float renders
// as "Table N (Informative): …" (ecmarkup's wording), carried through the
// same attribute.
function applyFloatNum(html) {
  return html.replace(/<emu-(table|figure)\b([^>]*)>/g, (full, kind, attrs) => {
    const idm = attrs.match(/\bid="([^"]+)"/);
    if (!idm) return full;
    let num = (kind === "table" ? tableNum : figureNum).get(idm[1]);
    if (!num) return full;
    if (/\binformative\b/.test(attrs)) num += " (Informative)";
    return `<emu-${kind}${attrs} data-num="${num}">`;
  });
}

// Notes are labelled "Note" when a clause has one, "Note 1"/"Note 2"/… when it
// has several (ecmarkup numbers them per clause). Each <Sec> chunk is one
// clause body, so we number per chunk: expose the index via data-num for the
// label CSS, and collect note ids for xref resolution.
function numberNotes(html) {
  const found = [];
  const tags = html.match(/<emu-note\b[^>]*>/g) ?? [];
  const multi = tags.length >= 2;
  if (!multi) {
    for (const tag of tags) {
      const idm = tag.match(/\bid="([^"]+)"/);
      if (idm) found.push({ id: idm[1], label: "Note" });
    }
  }
  // tc39.es/ecma262 wraps every emu-note body in
  // <span class="note">Note[ N]</span> + <div class="note-contents">…</div>
  // so the label is real DOM, not a ::before pseudo. Restructure each note
  // accordingly (and add data-num=N when there are several in this clause).
  let i = 0;
  const noteRe = /<emu-note\b([^>]*)>([\s\S]*?)<\/emu-note>/g;
  const out = html.replace(noteRe, (_full, attrs, inner) => {
    i++;
    const idm = attrs.match(/\bid="([^"]+)"/);
    if (multi && idm) found.push({ id: idm[1], label: `Note ${i}` });
    const label = multi ? `Note ${i}` : "Note";
    const numAttr = multi ? ` data-num="${i}"` : "";
    return `<emu-note${attrs}${numAttr}><span class="note">${label}</span><div class="note-contents">${inner}</div></emu-note>`;
  });
  return { html: out, found };
}
const applyNoteNum = (html) => numberNotes(html).html;

// Pre-pass: register note ids → label/slug so cross-references resolve (must
// run before any applyXrefSubst).
for (const c of built) {
  for (const [, html] of flattenTree(c.tree)) {
    for (const { id, label } of numberNotes(html).found) {
      idToLabel.set(id, { text: label, slug: c.pageSlug });
    }
  }
}

// Pre-pass: register step ids → dotted ordinal label ("1.d") / slug so
// <emu-xref> to algorithm steps resolve to the step number.
for (const c of built) {
  const algRe = /<emu-alg([^>]*?)>([\s\S]*?)<\/emu-alg>/g;
  let am;
  while ((am = algRe.exec(c.inner)) !== null) {
    const root = buildAlgTree(am[2]);
    if (root) collectAlgSteps(root.children, 0, "", c.pageSlug, idToLabel);
  }
}

// emu-intro lives at <basePath>/, all other chapters at <basePath>/<slug>.
// Helper used by xref substitution so links survive routing under any
// basePath (empty for local dev, '/ecma262/draft' / '/ecma262/es2025' / … in
// production).
function pathFor(slug) {
  const local = slug === "index" ? "" : `/${slug}`;
  return `${BASE_PATH}${local}`;
}

// <emu-xref href="#id"> is ecmarkup's cross-reference tag. Source forms:
//   <emu-xref href="#id"></emu-xref>       — empty, ecmarkup injects "14.7.2"
//   <emu-xref href="#id" title></emu-xref> — empty + `title`: ecmarkup injects
//       the target clause's TITLE ("White Space") instead of its number
//   <emu-xref href="#id">link text</emu-xref> — author-supplied text
// We keep the <emu-xref> wrapper (matching tc39.es/ecma262's serialisation)
// and inject an <a href="/<slug>#<id>">…</a> inside. Anchors `id="<id>"` are
// emitted on chapter/section headings via the surrounding <emu-clause id=…>
// (see renderMdxTree below) so the targets exist.
// Run highlight.js over <pre><code class="LANG">…</code></pre> blocks so
// keywords/strings/built-ins pick up the same .hljs-* spans tc39.es uses.
// The decoder undoes the basic entity escapes that the spec source uses
// inside code blocks; hljs.highlight then re-emits properly escaped HTML.
const codeEntityRe = /&(amp|lt|gt|quot|#x27|apos);/g;
const codeEntityMap = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#x27": "'",
  apos: "'",
};
function applyHljsSubst(html) {
  return html.replace(
    /<pre><code class="([A-Za-z0-9_-]+)">([\s\S]*?)<\/code><\/pre>/g,
    (full, lang, code) => {
      if (!hljs.getLanguage(lang)) return full;
      const raw = code.replace(codeEntityRe, (_, e) => codeEntityMap[e] ?? _);
      const { value } = hljs.highlight(raw, { language: lang });
      return `<pre><code class="hljs ${lang}">${value}</code></pre>`;
    },
  );
}

function applyXrefSubst(html) {
  // Single pass — empty inner (`<emu-xref></emu-xref>`) gets the resolved
  // number/label injected as the <a> text; non-empty inner is used verbatim.
  // (Two passes would re-match step 1's own output and double-wrap the <a>.)
  return html.replace(
    /<emu-xref([^>]*?)>([\s\S]*?)<\/emu-xref>/g,
    (full, attrs, inner) => {
      const m = attrs.match(/\bhref="#([^"]+)"/);
      if (!m) return full;
      const id = m[1];
      const s = idToSection.get(id);
      const l = idToLabel.get(id);
      const target = s ?? l;
      if (!target) return inner || id;
      // `title` attribute: inject the clause title instead of the number
      // (run it through the inline-markup pass, same as the heading does).
      const wantTitle = /(?:^|\s)title(?:\s|=|$)/.test(attrs);
      const text = inner.trim() !== ""
        ? inner
        : (wantTitle && s)
        ? transformInlineText(s.title)
        : (s ? s.number : l.text);
      return `<emu-xref${attrs}><a href="${
        pathFor(target.slug)
      }#${id}">${text}</a></emu-xref>`;
    },
  );
}

// Build a map of nonterminal LHS → rendered production HTML by scanning every
// canonical <emu-grammar type="definition"> block (excluding `example` ones,
// which are illustrative snippets in the notational-conventions chapter, not
// the real grammar). Each block may pack multiple productions separated by
// blank lines; split them so a prodref resolves to just its own production.
const grammarDefs = new Map();
// LHS name → src offset of the canonical (longest) definition. Used after
// chapter slugs are resolved to build the NT → {slug, prodId} link map for
// hyperlinking <emu-nt>Foo</emu-nt> tags in prose and grammar RHSes.
const grammarDefSrcOffset = new Map();
{
  const grammarRe = /<emu-grammar([^>]*?)>([\s\S]*?)<\/emu-grammar>/g;
  let gm;
  while ((gm = grammarRe.exec(src)) !== null) {
    const attrs = gm[1];
    if (!/\btype="definition"/.test(attrs)) continue;
    if (/\bexample\b/.test(attrs)) continue;
    const inner = gm[2];
    // Split into productions on blank lines; trim each chunk of surrounding
    // blank lines while preserving the indentation of content lines.
    const chunks = inner.split(/\n[ \t]*\n/);
    for (const raw of chunks) {
      // Drop leading comment lines (ecmarkup-format pragmas like
      // "// emu-format ignore") that sit between blank-line separators and
      // the actual LHS, so we don't misread them as the production head.
      const chunk = raw
        .replace(/^(?:[ \t]*\n|[ \t]*\/\/[^\n]*\n)+/, "")
        .replace(/\n+[ \t]*$/, "");
      if (!chunk.trim()) continue;
      const firstLine = chunk.split("\n")[0];
      const lhsMatch = firstLine.match(
        /^\s*([A-Za-z][A-Za-z0-9_]*)(?:\s*\[[^\]]*\])?\s*::*/,
      );
      if (!lhsMatch) continue;
      const lhs = lhsMatch[1];
      const lines = chunk.split("\n");
      const indents = lines.filter((l) => l.trim() !== "").map((l) =>
        l.match(/^[ \t]*/)[0].length
      );
      const minIndent = indents.length ? Math.min(...indents) : 0;
      const dedented = lines.map((l) => l.slice(minIndent)).join("\n");
      // Longest production wins when multiple definitions exist (the canonical
      // one tends to list more alternatives).
      const existing = grammarDefs.get(lhs);
      if (!existing || dedented.length > existing.length) {
        grammarDefs.set(lhs, dedented);
        grammarDefSrcOffset.set(lhs, gm.index);
      }
    }
  }
}

// Nonterminal name → { slug, prodId } for hyperlinking <emu-nt>Foo</emu-nt>
// to its production definition (anchor `prod-Foo` on the <emu-production>).
// Mirrors tc39.es/ecma262's behaviour where every NT reference in prose or
// in a grammar RHS clicks through to where it's defined. We pick the chapter
// from the src offset of the canonical (longest) definition recorded above
// (so this has to sit after grammarDefSrcOffset is populated AND after the
// `built` map gives us pageSlug for each chapter id).
const ntToProd = new Map();
for (const [lhs, srcOffset] of grammarDefSrcOffset) {
  const chap = chapters.find((c) =>
    c.offset <= srcOffset && srcOffset < c.endOffset
  );
  if (!chap) continue;
  const b = built.find((x) => x.id === chap.id);
  if (b) ntToProd.set(lhs, { slug: b.pageSlug, prodId: `prod-${lhs}` });
}

// Replace empty <emu-prodref name="X"></emu-prodref> with its production text
// wrapped in <pre> so line breaks and indentation survive raw-HTML embedding.
function applyProdrefSubst(html) {
  return html.replace(
    /<emu-prodref([^>]*?)>\s*<\/emu-prodref>/g,
    (full, attrs) => {
      const m = attrs.match(/\bname="([^"]+)"/);
      if (!m) return full;
      const def = grammarDefs.get(m[1]);
      if (def === undefined) return full;
      return `<emu-grammar type="definition">${
        tokenizeGrammarBlock(def)
      }</emu-grammar>`;
    },
  );
}

// Strip a common leading indent from every non-blank line in `text`.
function dedent(text) {
  const lines = text.split("\n");
  const indents = lines.filter((l) => l.trim() !== "").map((l) =>
    l.match(/^[ \t]*/)[0].length
  );
  const minIndent = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(minIndent)).join("\n");
}

// Parse <emu-alg> body (Markdown-style "1." numbered + "*" bulleted lists
// with 2-space indent per nesting level) into real nested <ol>/<ul> HTML, so
// the browser renders proper hierarchical step numbering.
// Parse the <emu-alg> body into a tree of { type:'ol'|'ul', text, id, children }
// items. `id` captures a leading [id="step-…"] annotation (used for the <li>
// anchor and step numbering); all leading [..] annotations are stripped from
// the displayed text.
function buildAlgTree(inner) {
  const lines = inner.split("\n");
  // The first bullet line establishes baseline indent (level 0).
  let baseIndent = -1;
  for (const l of lines) {
    const t = l.trimStart();
    if (/^1\.\s/.test(t) || /^\*\s/.test(t)) {
      baseIndent = l.length - t.length;
      break;
    }
  }
  if (baseIndent === -1) return null;

  const items = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    const t = l.trimStart();
    const olM = /^1\.\s+(.*)$/.exec(t);
    const ulM = /^\*\s+(.*)$/.exec(t);
    if (!olM && !ulM) {
      i++;
      continue;
    }
    const indent = l.length - t.length;
    const depth = Math.max(0, Math.floor((indent - baseIndent) / 2));
    const type = olM ? "ol" : "ul";
    const raw = olM ? olM[1] : ulM[1];
    const ann = raw.match(/^(?:\[[^\]]+\]\s*)+/);
    const idm = ann && ann[0].match(/\bid="(step-[^"]+)"/);
    const id = idm ? idm[1] : null;
    const kinds = ann ? kindsIn(ann[0]) : [];
    let text = raw.replace(/^(?:\[[^\]]+\]\s*)+/, "");
    // Continuation lines: any non-bullet line at deeper indent belongs to this
    // item (commonly embedded <figure>/<table> blocks).
    let j = i + 1;
    while (j < lines.length) {
      const nt = lines[j].trimStart();
      if (nt === "") {
        text += "\n";
        j++;
        continue;
      }
      const nIndent = lines[j].length - nt.length;
      if (nIndent <= indent) break;
      if (/^1\.\s/.test(nt) || /^\*\s/.test(nt)) break;
      text += "\n" + lines[j];
      j++;
    }
    items.push({ depth, type, id, kinds, text: text.replace(/\s+$/, "") });
    i = j;
  }
  if (!items.length) return null;

  // Build a tree: stack[d] is the parent node at depth d.
  const root = { children: [] };
  const stack = [root];
  for (const it of items) {
    while (stack.length > it.depth + 1) stack.pop();
    while (stack.length < it.depth + 1) {
      const parent = stack[stack.length - 1];
      if (!parent.children.length) {
        parent.children.push({
          type: it.type,
          text: "",
          id: null,
          kinds: [],
          children: [],
        });
      }
      stack.push(parent.children[parent.children.length - 1]);
    }
    stack[stack.length - 1].children.push({
      type: it.type,
      text: it.text,
      id: it.id,
      kinds: it.kinds,
      children: [],
    });
  }
  return root;
}

function parseAlg(inner) {
  const root = buildAlgTree(inner);
  if (!root) return null;
  // Serialize: group consecutive same-type siblings into a single <ol>/<ul>.
  // A step's [id] becomes the <li> anchor so #step-… links resolve. Steps
  // that exit the algorithm — either starting with Return/Throw or wrapping
  // a conditional return/throw ("If …, return X.") — are tagged class="exit"
  // (matching tc39.es/ecma262). The \b word boundary keeps Returns/Throws
  // from matching; the lookahead `[A-Za-z<*_!?]` after the verb ensures
  // we don't false-match phrases like ", return type" inside a different
  // sentence (real return steps name a value or completion right after).
  function attrsFor(n) {
    const isExit = /^(Return|Throw)\b/.test(n.text) ||
      /,\s+(return|throw)\s+[A-Za-z<*_!?]/i.test(n.text);
    return (n.id ? ` id="${n.id}"` : "") + (isExit ? ' class="exit"' : "") +
      (n.kinds ?? []).map(([a]) => ` ${a}=""`).join("");
  }
  function serialize(nodes) {
    let html = "";
    let k = 0;
    while (k < nodes.length) {
      const t = nodes[k].type;
      const group = [];
      while (k < nodes.length && nodes[k].type === t) {
        group.push(nodes[k]);
        k++;
      }
      html += `<${t}>` + group.map((n) =>
        `<li${attrsFor(n)}>${
          n.kinds?.length ? attributesTag(n.kinds) : ""
        }${n.text}${serialize(n.children)}</li>`
      ).join("") + `</${t}>`;
    }
    return html;
  }
  return serialize(root.children);
}

// Step ordinals match the CSS list-style cycle: <ol> levels go decimal,
// lower-alpha, lower-roman, repeating.
function alphaLabel(n) {
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
function romanLabel(n) {
  const map = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [
      90,
      "xc",
    ],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let s = "";
  for (const [v, sym] of map) {
    while (n >= v) {
      s += sym;
      n -= v;
    }
  }
  return s;
}
function stepOrdinal(n, olLevel) {
  const k = (olLevel - 1) % 3;
  return k === 0 ? String(n) : k === 1 ? alphaLabel(n) : romanLabel(n);
}

// Walk an alg tree, registering step id → dotted ordinal label ("1.d") for
// xref resolution. `olAncestors` is the number of <ol> levels above `nodes`.
function collectAlgSteps(nodes, olAncestors, prefix, slug, out) {
  let olIdx = 0;
  for (const n of nodes) {
    let childPrefix = prefix;
    let childOl = olAncestors;
    if (n.type === "ol") {
      olIdx++;
      const label = stepOrdinal(olIdx, olAncestors + 1);
      childPrefix = prefix ? `${prefix}.${label}` : label;
      childOl = olAncestors + 1;
      if (n.id) out.set(n.id, { text: childPrefix, slug });
    } else if (n.id) {
      out.set(n.id, { text: prefix, slug });
    }
    collectAlgSteps(n.children, childOl, childPrefix, slug, out);
  }
}

function applyAlgSubst(html) {
  return html.replace(
    /<emu-alg([^>]*?)>([\s\S]*?)<\/emu-alg>/g,
    (full, attrs, inner) => {
      const list = parseAlg(inner);
      if (list === null) return full;
      return `<emu-alg${attrs}>${list}</emu-alg>`;
    },
  );
}

// Tokenize one grammar source line into wrapped HTML elements. (The LHS
// nonterminal needs no special marking: it's distinguished positionally as the
// <emu-nt> that's a direct child of <emu-production>, matching tc39.es.)
//   • // ...           → <span class="cm">…</span>           (ecmarkup pragma)
//   • &gt; rest of line → <emu-gprose>…</emu-gprose>          (prose description)
//   • `foo`            → <emu-t>foo</emu-t>                  (terminal)
//   • [+Foo] [lookahead …] (free-standing) → <emu-constraints>[…]</emu-constraints>
//   • Foo[Yield, ?Await] (flush against NT) → <emu-nt>…<emu-mods><emu-params>[…]</emu-params></emu-mods></emu-nt>
//   • :, ::, :::, :::: → <emu-geq>…</emu-geq>                (production arrow)
//   • [A-Z]\w*         → <emu-nt>…</emu-nt>                  (nonterminal)
//   • ? * +            → <emu-mods><emu-opt>…</emu-opt></emu-mods>
//                        (the optional `?` renders as the subscript "opt",
//                         matching tc39.es/ecma262's grammar notation)
//   • "one of"         → <emu-oneof>one of</emu-oneof>
// Trailing modifiers ([params] and ?/*/+) that sit flush against an <emu-nt>
// (no intervening whitespace) get nested inside it as <emu-mods> children,
// matching tc39.es/ecma262's serialization.
function tokenizeGrammarLine(line) {
  if (!line.trim()) return line;
  if (/^\s*\/\//.test(line)) return `<span class="cm">${line}</span>`;
  // The "&gt; " is grammarkdown's prose-RHS marker, not content — ecmarkup
  // drops it from the rendered output.
  const descM = line.match(/^([ \t]*)&gt;\s+(.*)$/);
  if (descM) return `${descM[1]}<emu-gprose>${descM[2]}</emu-gprose>`;
  // Production annotations (#parencover, #callcover) are grammarkdown
  // bookkeeping for cover-grammar refinement, not grammar — ecmarkup hides
  // them. A bare " #word" can only appear at the end of an alternative (the
  // `#` terminal of PrivateIdentifier is backtick-quoted).
  line = line.replace(/\s+#[a-zA-Z]+\s*$/, "");

  let out = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === " " || ch === "\t") {
      out += ch;
      i++;
      continue;
    }
    if (ch === "`") {
      // grammarkdown writes a terminal consisting of one backtick as ```
      // (the template-literal productions); a backslash inside a terminal is
      // escaped as \\ .
      if (line[i + 1] === "`" && line[i + 2] === "`") {
        out += "<emu-t>`</emu-t>";
        i += 3;
        continue;
      }
      const end = line.indexOf("`", i + 1);
      if (end === -1) {
        out += ch;
        i++;
        continue;
      }
      out += `<emu-t>${line.slice(i + 1, end).replace(/\\\\/g, "\\")}</emu-t>`;
      i = end + 1;
      continue;
    }
    if (ch === "[") {
      const end = line.indexOf("]", i + 1);
      if (end === -1) {
        out += ch;
        i++;
        continue;
      }
      // Free-standing `[…]` (no preceding NT) — tc39 splits these three ways:
      //   `[lookahead …]`           → <emu-gann> (grammar annotation)
      //   `[no LineTerminator here]` → <emu-gmod> (grammar modification)
      //   `[+Foo]` / `[~Foo]` / etc. → <emu-constraints> (alternative guards)
      // Annotations and modifications carry inner NTs/terminals so the
      // contents get a recursive tokenize pass; constraints stay raw.
      let content = line.slice(i + 1, end);
      const tag = /^\s*lookahead\b/.test(content)
        ? "emu-gann"
        : /^\s*no\s+/.test(content)
        ? "emu-gmod"
        : "emu-constraints";
      // grammarkdown lookahead operators render as their mathematical glyphs
      // (ecmarkup: == → =, != → ≠, <- → ∈, <! → ∉).
      if (tag === "emu-gann") {
        content = content
          .replace(/(lookahead\s*)==/, "$1=")
          .replace(/(lookahead\s*)!=/, "$1≠")
          .replace(/(lookahead\s*)&lt;-/, "$1∈")
          .replace(/(lookahead\s*)&lt;!/, "$1∉");
      }
      const inner = tag === "emu-constraints"
        ? content
        : tokenizeGrammarLine(content);
      out += `<${tag}>[${inner}]</${tag}>`;
      i = end + 1;
      continue;
    }
    if (ch === ":") {
      let j = i;
      while (j < line.length && line[j] === ":") j++;
      out += `<emu-geq>${line.slice(i, j)}</emu-geq>`;
      i = j;
      continue;
    }
    if (/[A-Z]/.test(ch)) {
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
      const ntName = line.slice(i, j);
      // Look ahead for modifiers flush against the NT (no whitespace gap):
      // [params] and/or ? * +. Multiple may chain (e.g. `Foo[+In]?`).
      let mods = "";
      while (j < line.length) {
        const c2 = line[j];
        if (c2 === "?" || c2 === "*" || c2 === "+") {
          mods += `<emu-opt>${c2 === "?" ? "opt" : c2}</emu-opt>`;
          j++;
        } else if (c2 === "[") {
          const end = line.indexOf("]", j + 1);
          if (end === -1) break;
          mods += `<emu-params>[${line.slice(j + 1, end)}]</emu-params>`;
          j = end + 1;
        } else {
          break;
        }
      }
      // Hyperlink the NT name to its production definition when known
      // (`prod-Foo` anchor on the <emu-production>), matching tc39.es.
      const link = ntToProd.get(ntName);
      const name = link
        ? `<a href="${pathFor(link.slug)}#${link.prodId}">${ntName}</a>`
        : ntName;
      const inner = mods ? `${name}<emu-mods>${mods}</emu-mods>` : name;
      // LHS distinction is implicit: it's the <emu-nt> that's a direct child
      // of <emu-production> (the RHS's NTs sit inside <emu-rhs>). tc39 picks
      // it out via the positional selector `emu-production > emu-nt` rather
      // than a class — we follow suit and drop the .lhs class.
      out += `<emu-nt>${inner}</emu-nt>`;
      i = j;
      continue;
    }
    if (ch === "?" || ch === "*" || ch === "+") {
      out += `<emu-mods><emu-opt>${
        ch === "?" ? "opt" : ch
      }</emu-opt></emu-mods>`;
      i++;
      continue;
    }
    if (
      line.slice(i, i + 6) === "one of" &&
      (i + 6 === line.length || !/[A-Za-z0-9_]/.test(line[i + 6]))
    ) {
      out += "<emu-oneof>one of</emu-oneof>";
      i += 6;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// Wrap one production chunk (a blank-line-delimited slice of the grammar
// body) in <emu-production>: the first line carries LHS + geq + an optional
// inline first RHS or trailing "one of"; each subsequent non-comment line is
// its own <emu-rhs>. Indentation/newlines are preserved as raw whitespace
// so the block keeps its visual shape when display-rendered with line breaks.
function tokenizeGrammarProduction(chunk) {
  // Grammarkdown comment lines (in practice only the `// emu-format ignore`
  // formatter pragma) are tooling directives, not grammar; tc39.es strips
  // them from the rendered output. Drop them before picking the LHS line —
  // a leading pragma would otherwise become the "first line", costing the
  // production its id="prod-…" anchor and demoting the real LHS to an
  // <emu-rhs>.
  const lines = chunk.split("\n").filter((l) => !/^\s*\/\//.test(l));
  // Pull the LHS name off the first non-blank line so the production gets
  // id="prod-Foo" name="Foo", matching tc39's hyperlink target shape.
  const firstNonEmpty = lines.find((l) => l.trim() !== "") || "";
  const lhsMatch = firstNonEmpty.match(/^\s*([A-Za-z][A-Za-z0-9_]*)/);
  const lhs = lhsMatch ? lhsMatch[1] : null;
  // A production written on a single source line (LHS, `::`, and its one RHS
  // all together) is rendered "collapsed" — the RHS stays inline right after
  // the geq instead of dropping to its own indented line. ecmarkup marks these
  // with the `collapsed` attribute; the CSS keys off it (see ecma-spec.css).
  const collapsed = lines.filter((l) => l.trim() !== "").length === 1;
  let body = "";
  let isFirst = true;
  for (const line of lines) {
    if (!line.trim()) {
      body += "\n";
      continue;
    }
    if (isFirst) {
      const tokenized = tokenizeGrammarLine(line);
      // Split the tokenized first line at the </emu-geq> closing tag so
      // anything after it can be wrapped in <emu-rhs> (or stand alone if it's
      // an <emu-oneof>).
      const geqClose = "</emu-geq>";
      const cut = tokenized.indexOf(geqClose);
      if (cut === -1) {
        body += tokenized;
      } else {
        const head = tokenized.slice(0, cut + geqClose.length);
        let tail = tokenized.slice(cut + geqClose.length);
        const tailWs = tail.match(/^\s*/)[0];
        tail = tail.slice(tailWs.length);
        body += head + tailWs;
        if (tail.startsWith("<emu-oneof>")) {
          const oneofClose = "</emu-oneof>";
          const oc = tail.indexOf(oneofClose);
          if (oc !== -1) {
            const oneofChunk = tail.slice(0, oc + oneofClose.length);
            let rest = tail.slice(oc + oneofClose.length);
            const restWs = rest.match(/^\s*/)[0];
            rest = rest.slice(restWs.length);
            body += oneofChunk + restWs;
            if (rest) body += `<emu-rhs>${rest}</emu-rhs>`;
          } else {
            body += tail;
          }
        } else if (tail) {
          body += `<emu-rhs>${tail}</emu-rhs>`;
        }
      }
      isFirst = false;
    } else {
      const leadingWs = line.match(/^\s*/)[0];
      const rest = line.slice(leadingWs.length);
      body += leadingWs +
        `<emu-rhs>${tokenizeGrammarLine(rest)}</emu-rhs>`;
    }
  }
  const prodAttrs = (lhs ? ` id="prod-${lhs}" name="${lhs}"` : "") +
    (collapsed ? ` collapsed=""` : "");
  return `<emu-production${prodAttrs}>${body}</emu-production>`;
}

// Tokenize a grammar block (one or more productions, blank-line separated).
// Each non-empty chunk is wrapped in <emu-production>; blank-line separators
// between chunks are preserved as raw whitespace.
function tokenizeGrammarBlock(text) {
  const parts = text.split(/(\n[ \t]*\n)/);
  let out = "";
  for (const part of parts) {
    if (/^\n[ \t]*\n$/.test(part)) {
      out += part;
    } else if (part.trim()) {
      out += tokenizeGrammarProduction(part);
    } else {
      out += part;
    }
  }
  return out;
}

// Tokenize a one-line inline grammar snippet (the form that appears
// mid-paragraph, e.g. "MV of <emu-grammar>DecimalDigit :: `0`</emu-grammar>").
// No <emu-production>/<emu-rhs> wrapping — tc39's inline form is flat.
function tokenizeGrammarInline(text) {
  return tokenizeGrammarLine(text);
}

// Render <emu-grammar> blocks with token-aware tokenization so non-terminals,
// terminals, parameters, geqs, modifiers, and descriptions are individually
// styleable via CSS (see app/ecma-spec.css). The same tag is used both inline
// (mid-paragraph "MV of <emu-grammar>DecimalDigit :: `0`</emu-grammar>") and
// as a block-level definition; tell them apart by looking at what precedes
// the opening tag — only-whitespace → block, otherwise inline. Block-form
// gets type="definition" to match tc39's serialization.
function applyGrammarSubst(html) {
  return html.replace(
    /<emu-grammar([^>]*?)>([\s\S]*?)<\/emu-grammar>/g,
    (_full, attrs, inner, offset, source) => {
      const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
      const isBlock = source.slice(lineStart, offset).trim() === "";
      const trimmed = inner.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
      if (isBlock) {
        // Mirror the source's grammar kind in the emitted attributes (tc39's
        // serialisation): a real definition stays `type="definition"`, but an
        // illustrative `<emu-grammar example>` (a use-grammar referencing an
        // existing production, e.g. 5.2.3's Block example) stays `example=""`
        // WITHOUT type — so it doesn't pick up the `emu-grammar[type=definition]
        // emu-production` 5ex indent the way a definition does. Bare block
        // grammars keep the default `type="definition"` (unchanged).
        const hasDef = /\btype="definition"/.test(attrs);
        const hasEx = /(?:^|\s)example(?:\s|=|$)/.test(attrs);
        const gattrs = hasEx
          ? (hasDef ? ` example="" type="definition"` : ` example=""`)
          : ` type="definition"`;
        return `<emu-grammar${gattrs}>${
          tokenizeGrammarBlock(dedent(trimmed))
        }</emu-grammar>`;
      }
      return `<emu-grammar>${
        tokenizeGrammarInline(trimmed.trim())
      }</emu-grammar>`;
    },
  );
}

// Tag inline-position <emu-eqn> with class="inline" so it stays in the text
// flow (display:inline + margin:0). The detection mirrors applyGrammarSubst:
// only-whitespace before the opening tag on its line → block; anything else
// on the line (so the eqn sits mid-paragraph) → inline. Preserves any
// existing attributes (id, aoid) — only the class is added.
function applyEqnInlineSubst(html) {
  return html.replace(
    /<emu-eqn(\b[^>]*)>/g,
    (full, attrs, offset) => {
      const lineStart = html.lastIndexOf("\n", offset - 1) + 1;
      const isInline = html.slice(lineStart, offset).trim() !== "";
      if (!isInline) return full;
      if (/\bclass=/.test(attrs)) {
        return `<emu-eqn${
          attrs.replace(/\bclass="([^"]*)"/, 'class="$1 inline"')
        }>`;
      }
      return `<emu-eqn class="inline"${attrs}>`;
    },
  );
}

// Inline ecmarkup markup: a Markdown-like shorthand authors use in regular
// prose, emu-alg step text, emu-eqn equations, table cells, etc. ecmarkup
// expands these to typed inline elements at build time; we do the same so
// readers see italic variables, bold spec values, monospace terminals, etc.
//
//   `foo`     → <code>foo</code>
//   |Foo|     → <emu-nt>Foo</emu-nt>          (nonterminal, italic via CSS)
//   ~enum~    → <emu-const>enum</emu-const>   (small-caps via CSS)
//   %Foo.Bar% → <code class="emu-intrinsic">%Foo.Bar%</code>
//   *foo*     → <emu-val>foo</emu-val>     (spec value: `*true*`, `*null*`, …)
//   _x_       → <var>x</var>
//
// We tokenize the HTML and skip text inside <pre>/<code>/<emu-grammar>/<emu-not-ref>
// so literal content (grammar bodies, code samples) isn't accidentally rewritten.
const inlineSkipTags = new Set([
  "pre",
  "code",
  "emu-grammar",
  "emu-not-ref",
  "script",
  "style",
]);

function transformInlineText(text) {
  // Pull backtick-wrapped runs out first and replace them with a NUL-marker
  // placeholder so the later `*` / `_` regexes can't reach across the
  // generated <code>…</code> boundaries (e.g. `*` adjacent to `**` is the
  // case in ApplyStringOrNumericBinaryOperator's heading). An escaped
  // backslash inside code (`\\`) is one literal backslash.
  const code = [];
  let out = text.replace(/`([^`\n]+)`/g, (_, c) => {
    code.push(c.replace(/\\\\/g, "\\"));
    return `\x00${code.length - 1}\x00`;
  });
  // Backslash-escaped formatting characters ("\*default\*", "[\~parameter]")
  // suppress the markup transforms below and render as the bare character —
  // protect them now, restore (sans backslash) at the end.
  const lit = [];
  out = out.replace(/\\([*_~|\\])/g, (_, c) => {
    lit.push(c);
    return `\x01${lit.length - 1}\x01`;
  });
  // |Foo|, |Foo[X]|, |Foo?|, |Foo[X]?| → <emu-nt>…</emu-nt>; the bare NT name
  // (Foo) is the link target, so split it from any [params] / ? suffix and
  // wrap just that part in <a href="…#prod-Foo"> when we know where Foo is
  // defined (mirrors tc39.es). Suffix becomes the inline emu-mods structure.
  out = out.replace(
    /\|([A-Za-z][A-Za-z0-9_]*)(\[[^\]]*\])?(\?)?\|/g,
    (_, name, params, opt) => {
      const link = ntToProd.get(name);
      const head = link
        ? `<a href="${pathFor(link.slug)}#${link.prodId}">${name}</a>`
        : name;
      let mods = "";
      if (params) mods += `<emu-params>${params}</emu-params>`;
      if (opt) mods += `<emu-opt>opt</emu-opt>`;
      return `<emu-nt>${head}${
        mods ? `<emu-mods>${mods}</emu-mods>` : ""
      }</emu-nt>`;
    },
  );
  out = out.replace(/~([^\s~][^~]*?)~/g, "<emu-const>$1</emu-const>");
  out = out.replace(
    /%([A-Za-z][A-Za-z0-9.@]*)%/g,
    "<emu-intrinsic>%$1%</emu-intrinsic>",
  );
  out = out.replace(
    /\*([^*\s][^*]*?[^*\s]|[^*\s])\*/g,
    "<emu-val>$1</emu-val>",
  );
  out = out.replace(
    /(?<![A-Za-z0-9_])_([A-Za-z][A-Za-z0-9_]*)_(?![A-Za-z0-9_])/g,
    "<var>$1</var>",
  );
  // Record internal-slot / field names: `[[Foo]]` → <var class="field">[[Foo]]</var>.
  // tc39 styles these in italic monospace so they read as identifier-ish.
  // Pattern is unambiguous outside grammar (which is in the skip set).
  out = out.replace(
    /\[\[([A-Z][A-Za-z0-9_]*)\]\]/g,
    '<var class="field">[[$1]]</var>',
  );
  // The \x01 sentinel marks protected escapes — restore the bare character.
  out = out.replace(
    // deno-lint-ignore no-control-regex
    /\x01(\d+)\x01/g,
    (_, i) => lit[Number(i)],
  );
  // The \x00 placeholder sentinel (set above) marks pulled-out backtick runs;
  // it never occurs in real spec text, so matching it directly is safe.
  return out.replace(
    // deno-lint-ignore no-control-regex
    /\x00(\d+)\x00/g,
    (_, i) => `<code>${code[Number(i)]}</code>`,
  );
}

function applyInlineMarkup(html) {
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|<!--[\s\S]*?-->/g;
  let out = "";
  let last = 0;
  let skipDepth = 0;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const text = html.slice(last, m.index);
    out += skipDepth === 0 ? transformInlineText(text) : text;
    out += m[0];
    if (m[1]) {
      const tag = m[1].toLowerCase();
      if (inlineSkipTags.has(tag)) {
        if (m[0].startsWith("</")) skipDepth = Math.max(0, skipDepth - 1);
        else if (!m[0].endsWith("/>")) skipDepth++;
      }
    }
    last = tagRe.lastIndex;
  }
  const tail = html.slice(last);
  out += skipDepth === 0 ? transformInlineText(tail) : tail;
  return out;
}

// Auto-link defined terms (see dfnTargets above). Runs LAST in the per-section
// pipeline — after applyInlineMarkup, so existing links/markup are present and
// can be skipped — and never inside these tags: existing anchors/xrefs, the
// defining <dfn>, headings, code/grammar, and the inline-markup elements where
// the text is already a styled token rather than plain prose.
const dfnLinkSkipTags = new Set([
  "a",
  "dfn",
  "emu-xref",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "code",
  "pre",
  "emu-grammar",
  "emu-prodref",
  "emu-nt",
  "emu-t",
  "emu-const",
  "emu-val",
  "emu-intrinsic",
  "emu-eqn",
  "var",
  "emu-not-ref",
  "script",
  "style",
]);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Build one surface-form alternative. Matching is case-SENSITIVE except that a
// LOWERCASE-defined term may also match with its first character capitalised —
// exactly ecmarkup's rule, which is one-directional: it links a sentence-start
// capitalisation of a lowercase term ("early error" → "Early error"), but an
// UPPERCASE-defined term is matched strictly and does NOT match a lowercased
// occurrence (the term "List" links "List" but not the common word "list" in
// "comma separated list"; likewise "Record"/"Assert" etc.). A differently-cased
// interior never matches, so "Early Error" (both words capitalised) stays plain
// and a lowercase "early error rule" matches the term "early error" + plain
// "rule" rather than the capitalised term "Early Error Rule".
function dfnAlt(surface) {
  const first = surface[0];
  const lo = first.toLowerCase();
  const up = first.toUpperCase();
  if (lo === up) return escapeRe(surface); // non-letter first char
  // Lowercase-defined: allow a sentence-start capital. Uppercase-defined:
  // strict case-sensitive match (no lowercased-word false positives).
  return first === lo
    ? `[${lo}${up}]${escapeRe(surface.slice(1))}`
    : escapeRe(surface);
}
// One alternation of every surface form, longest first so multi-word terms win
// over any shorter term nested inside them. \b keeps matches to whole words.
// Built once (null when there are no defined terms).
const dfnLinkRe = dfnTargets.size
  ? new RegExp(
    `\\b(?:${
      [...dfnTargets.values()].map((t) => t.surface)
        .sort((a, b) => b.length - a.length).map(dfnAlt).join("|")
    })\\b`,
    "g",
  )
  : null;
// `ownClause` is the id of the clause directly containing the current section.
// ecmarkup's self-reference guard is `entryId === currentId`: a term is left
// plain only within the clause its LINK TARGET points at. For an id-less dfn the
// target is its enclosing clause, so it stays plain there (a sub-clause still
// links it); for an id-bearing <dfn id="x"> the target is #x — never a clause
// id — so it links even inside its defining clause. Hence compare t.id, not the
// enclosing clause.
function linkDefinedTerms(text, ownClause) {
  if (!dfnLinkRe) return text;
  return text.replace(dfnLinkRe, (match) => {
    const t = dfnTargets.get(match.toLowerCase());
    if (!t) return match;
    if (t.id === ownClause) return match;
    const href = `${pathFor(t.slug)}#${t.id}`;
    return `<emu-xref href="${href}"><a href="${href}">${match}</a></emu-xref>`;
  });
}
function applyDfnLinkSubst(html, ownClause = "") {
  if (!dfnLinkRe) return html;
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|<!--[\s\S]*?-->/g;
  let out = "";
  let last = 0;
  let skipDepth = 0;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const text = html.slice(last, m.index);
    out += skipDepth === 0 ? linkDefinedTerms(text, ownClause) : text;
    out += m[0];
    if (m[1]) {
      const tag = m[1].toLowerCase();
      if (dfnLinkSkipTags.has(tag)) {
        if (m[0].startsWith("</")) skipDepth = Math.max(0, skipDepth - 1);
        else if (!m[0].endsWith("/>")) skipDepth++;
      }
    }
    last = tagRe.lastIndex;
  }
  const tail = html.slice(last);
  out += skipDepth === 0 ? linkDefinedTerms(tail, ownClause) : tail;
  return out;
}

// Auto-link abstract-operation references (see aoTargets above) — ecmarkup's
// aoid autolinker. Runs as its own pass AFTER applyDfnLinkSubst so any region a
// <dfn> term already wrapped (e.g. "Completion Record") is skipped, leaving its
// bare-"Completion" interior untouched — the practical stand-in for ecmarkup's
// single longest-first pass over terms+ops.
const aoLinkRe = aoTargets.size
  ? new RegExp(
    [...aoTargets.keys()]
      .sort((a, b) => b.length - a.length) // longest first
      .map((name) => {
        const lead = /^\w/.test(name) ? "\\b" : "";
        // common words: link only as a call; otherwise reject a trailing
        // letter / `.word` / `%%` / `]]` exactly like ecmarkup's lookAheadBeyond.
        const look = COMMON_AOS.has(name)
          ? "(?=\\()"
          : "(?!\\w|\\.\\w|%%|\\]\\])";
        return lead + escapeRe(name) + look;
      })
      .join("|"),
    "g",
  )
  : null;
// ecmarkup's NO_CLAUSE_AUTOLINK set (lower-cased). Note emu-eqn is intentionally
// NOT here — ecmarkup links ops inside equations (e.g. floor(_x_) in an eqn).
const aoLinkSkipTags = new Set([
  "pre",
  "code",
  "script",
  "style",
  "emu-const",
  "emu-production",
  "emu-grammar",
  "emu-xref",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "emu-var",
  "emu-val",
  "var",
  "a",
  "dfn",
  "sub",
  "emu-not-ref",
]);
// HTML void elements never carry content, so they don't push onto the open-tag
// stack the walker uses to balance skip regions.
const aoVoidTags = new Set([
  "img",
  "br",
  "hr",
  "col",
  "wbr",
  "source",
  "input",
  "meta",
  "link",
  "area",
  "base",
  "embed",
]);
function linkAbstractOps(text, ownClause) {
  return text.replace(aoLinkRe, (match) => {
    const t = aoTargets.get(match);
    if (!t || t.id === ownClause) return match; // not within its own definition
    const href = `${pathFor(t.slug)}#${t.id}`;
    return `<emu-xref aoid="${match}"><a href="${href}">${match}</a></emu-xref>`;
  });
}
function applyAoLinkSubst(html, ownClause = "") {
  if (!aoLinkRe) return html;
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|<!--[\s\S]*?-->/g;
  let out = "";
  let last = 0;
  let skipDepth = 0;
  const openSkips = []; // skip flag per open element, for balanced pop on close
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    out += skipDepth === 0
      ? linkAbstractOps(html.slice(last, m.index), ownClause)
      : html.slice(last, m.index);
    out += m[0];
    if (m[1]) {
      const tag = m[1].toLowerCase();
      if (m[0].startsWith("</")) {
        if (openSkips.pop()) skipDepth--;
      } else if (!m[0].endsWith("/>") && !aoVoidTags.has(tag)) {
        // Skip ecmarkup's no-autolink elements AND any aoid-bearing definition
        // element (so it doesn't link its own name to itself).
        const skip = aoLinkSkipTags.has(tag) || /\baoid=/.test(m[0]);
        openSkips.push(skip);
        if (skip) skipDepth++;
      }
    }
    last = tagRe.lastIndex;
  }
  out += skipDepth === 0
    ? linkAbstractOps(html.slice(last), ownClause)
    : html.slice(last);
  return out;
}

fs.rmSync(CONTENT_DIR, { recursive: true, force: true });
fs.rmSync(LIB_DIR, { recursive: true, force: true });
fs.mkdirSync(CONTENT_DIR, { recursive: true });
fs.mkdirSync(LIB_DIR, { recursive: true });

const meta = {};
let totalBytes = 0;
built.forEach((c) => {
  const { slug, pageSlug, chapterNum, tree } = c;
  // Seed with the chapter's own id so the chapter-prelude section reports the
  // chapter clause as its immediate clause; nested sections report their own.
  const sections = flattenTree(tree, "", c.id).map(([k, v, clauseId]) => [
    k,
    applyAoLinkSubst(
      applyDfnLinkSubst(
        applyInlineMarkup(
          applyXrefSubst(
            applyProdrefSubst(
              applyEqnInlineSubst(
                applyGrammarSubst(
                  applyAlgSubst(
                    applyHljsSubst(applyFloatNum(applyNoteNum(v))),
                  ),
                ),
              ),
            ),
          ),
        ),
        clauseId,
      ),
      clauseId,
    ),
  ]);
  const sectionsObj = Object.fromEntries(sections);

  // basePath is already baked into href values in this map (see pathFor in
  // build-chapters.mjs), so the runtime is just lookup + dangerouslySetInnerHTML.
  // The wrapper <div> is a regular block (one grid item of the enclosing
  // <emu-clause>); inside it the paragraphs/lists flow as a normal block
  // tree. The .ecma-spec name-spacing class lives on the outer
  // <div id="spec-container"> in the MDX wrapper.
  const componentSrc = [
    "// Generated from ecma262/spec.html — do not edit by hand.",
    `const sections = ${JSON.stringify(sectionsObj)};`,
    "export function Sec({ id }) {",
    "  const html = sections[id] ?? '';",
    "  return <div dangerouslySetInnerHTML={{ __html: html }} />;",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(LIB_DIR, `${slug}.jsx`), componentSrc);
  totalBytes += componentSrc.length;

  const chapterTitleRich = transformInlineText(c.title);
  const secnum = (text) => `<span className="secnum">${text}</span> `;
  let chapterHeading;
  if (c.kind === "emu-intro") {
    chapterHeading = `# ${chapterTitleRich}`;
  } else if (c.kind === "emu-annex") {
    chapterHeading = c.backMatter
      ? `# ${chapterTitleRich}`
      : `# ${secnum(`Annex ${chapterNum}`)}(${
        c.normative ? "normative" : "informative"
      }) ${chapterTitleRich}`;
  } else {
    chapterHeading = `# ${secnum(chapterNum)}${chapterTitleRich}`;
  }

  // Wrap the entire chapter body in <div id="spec-container"> so the same CSS
  // hooks that tc39.es/ecma262 exposes (e.g. `#spec-container > emu-clause`,
  // `#spec-container :target`) work here too. The chapter itself is wrapped
  // in <emu-intro|emu-clause|emu-annex> matching its kind, so the
  // nested-clause structure mirrors tc39's. MDX parses markdown inside raw
  // HTML wrappers as long as their open/close tags sit on blank-padded lines.
  const wrapTag = c.kind === "emu-intro"
    ? "emu-intro"
    : c.kind === "emu-annex"
    ? "emu-annex"
    : "emu-clause";
  const mdxLines = [
    `import { Sec } from '../lib/spec/${slug}'`,
    "",
    `<div id="spec-container" className="ecma-spec">`,
    "",
    `<${wrapTag} id="${c.id}">`,
    "",
    chapterHeading,
    "",
    ...renderMdxTree(tree, chapterNum, "", 2),
    "",
    `</${wrapTag}>`,
    "",
    `</div>`,
  ];
  const mdx = mdxLines.join("\n").replace(/\n{3,}/g, "\n\n").replace(
    /\n*$/,
    "\n",
  );
  fs.writeFileSync(path.join(CONTENT_DIR, `${pageSlug}.mdx`), mdx);

  // Sidebar label is plain text rendered by Nextra, so decode entities
  // (e.g. "&lt;&lt;" → "<<") and leave ecmarkup shorthand alone — markup
  // tags would show up as literal text in the sidebar.
  const titlePlain = decodeEntities(c.title);
  const display = c.kind === "emu-intro"
    ? titlePlain
    : c.kind === "emu-annex"
    ? (c.backMatter
      ? titlePlain
      : `Annex ${chapterNum} (${
        c.normative ? "normative" : "informative"
      }) ${titlePlain}`)
    : `${chapterNum} ${titlePlain}`;
  meta[pageSlug] = display;
});

fs.writeFileSync(
  path.join(CONTENT_DIR, "_meta.js"),
  `export default ${JSON.stringify(meta, null, 2)}\n`,
);

// Mirror spec images to public/ so the spec HTML's <img src="img/..."> resolves.
fs.rmSync(PUBLIC_IMG_DIR, { recursive: true, force: true });
fs.mkdirSync(PUBLIC_IMG_DIR, { recursive: true });
let imgCount = 0;
for (const name of fs.readdirSync(SPEC_IMG_DIR)) {
  if (/\.(svg|png|jpe?g|gif|webp|ico)$/i.test(name)) {
    fs.copyFileSync(
      path.join(SPEC_IMG_DIR, name),
      path.join(PUBLIC_IMG_DIR, name),
    );
    imgCount++;
  }
}

console.log(
  `Generated ${chapters.length} chapters (${
    (totalBytes / 1024 / 1024).toFixed(2)
  } MB of JSX), ${imgCount} images`,
);
