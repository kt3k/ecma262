// ES2 grammar-swap PROTOTYPE (Step 2 / P0 — chapter 12 Statements).
//
// Validates the hybrid strategy from docs/es2-plan.md Step 4: Marker's ES2 HTML
// flattens multi-alternative grammar productions, so we DON'T trust its grammar
// layout — we only trust *which* nonterminals it declares. The clean production
// layout is borrowed from the es3 Annex A grammar summary (../../ecma262/es3/
// spec.html), then transformed down to ES2 with three mechanical rules:
//
//   1. strip `NoIn`     — ES3 added a parallel *NoIn nonterminal set for the
//                         `in`-operator / for-statement ambiguity; ES2 has none.
//                         `ExpressionNoInopt` -> `Expressionopt`, etc. The *NoIn
//                         <dl> definitions then collapse onto their base names.
//   2. drop do-while    — the `do Statement while (...)` IterationStatement
//                         alternative is ES3-only.
//   3. drop ES3-only     — RegularExpressionLiteral, FunctionExpression,
//      productions /      Switch/Case*, ThrowStatement, Try/Catch/Finally,
//      alternatives       LabelledStatement (+ their sub-nonterminals).
//
// This is a SCRATCH validator: it reconstructs ch.12's grammar and writes an
// HTML preview to eyeball + a console report. It does not yet emit the scratch
// contract (that's the real build-chapters-es2.mjs at P1). Run:
//   node tools/es2-marker/proto-grammar.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ES3 = path.join(here, "../../ecma262/es3/spec.html");
const ES2 = path.join(here, "out/ECMA-262-2nd/ECMA-262-2nd.html");

const es3src = fs.readFileSync(ES3, "utf8");
const es2src = fs.readFileSync(ES2, "utf8");

const plain = (h) =>
  h.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();

// ES3-only nonterminals to drop wholesale (definition + any whole-alternative
// reference). do-while is an alternative, not a nonterminal — handled below.
const ES3_ONLY = new Set([
  "RegularExpressionLiteral",
  "RegularExpressionBody",
  "RegularExpressionChars",
  "RegularExpressionChar",
  "RegularExpressionFirstChar",
  "RegularExpressionFlags",
  "BackslashSequence",
  "NonTerminator",
  "FunctionExpression",
  "SwitchStatement",
  "CaseBlock",
  "CaseClauses",
  "CaseClause",
  "DefaultClause",
  "ThrowStatement",
  "TryStatement",
  "Catch",
  "Finally",
  "LabelledStatement",
]);

// ES2 spelling (American) vs es3/bclary (British): normalise on the way out so
// borrowed productions and their references read as ES2. Marker ES2 is the
// authority for the target spelling.
const SPELL = [[/Initialiser/g, "Initializer"]];
const normSpell = (html) =>
  SPELL.reduce((s, [re, to]) => s.replace(re, to), html);
// es3 lookup may need the British spelling.
const es3Name = (es2Name) => es2Name.replace(/Initializer/g, "Initialiser");

// --- build es3 nonterminal -> production map ----------------------------------
// Annex A (grammar summary) is the cleanest source — one consolidated <dl> per
// nonterminal. Fall back to the body for any the Annex A extraction misses.
const annex = es3src.slice(es3src.search(/name="annex-a"/));
const es3body = es3src.slice(0, es3src.search(/name="annex-a"/));
const dlRe = /<dl class="grammar">\s*<dt>([\s\S]*?)<\/dt>([\s\S]*?)<\/dl>/g;

const nameOf = (dtHtml) => plain(dtHtml).replace(/\s*:.*$/s, "").trim(); // "Foo :See 12.6" -> "Foo"
const kindOf = (dtHtml) => {
  const t = plain(dtHtml);
  if (/:::/.test(t)) return ":::";
  if (/::/.test(t)) return "::";
  return ":";
};

const grammar = new Map(); // name -> { kind, alts: [htmlFragment, ...] }
const indexInto = (src) => {
  const re = new RegExp(dlRe.source, "g");
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = nameOf(m[1]);
    if (!name || ES3_ONLY.has(name)) continue;
    // Alternatives are <br/>-separated inside <dd>. Keep inner markup.
    const alts = m[2].split(/<br\s*\/?>/i)
      .map((s) => s.trim())
      .filter((s) => plain(s).length > 0);
    if (!grammar.has(name)) grammar.set(name, { kind: kindOf(m[1]), alts });
  }
};
indexInto(annex); // prefer Annex A's consolidated productions…
indexInto(es3body); // …then backfill anything only the body defines cleanly.

// --- transform es3 -> es2 -----------------------------------------------------
const stripNoIn = (html) => html.replace(/NoIn/g, "");

const isDoWhile = (altHtml) => /^\s*do\b/.test(plain(altHtml));
// A whole alternative that IS just an ES3-only nonterminal (e.g. Statement's
// "LabelledStatement" line) — drop it.
const isES3OnlyAlt = (altHtml) => {
  const t = plain(altHtml).replace(/opt\b/g, "").trim();
  return ES3_ONLY.has(t);
};

const transform = (entry) => {
  const alts = entry.alts
    .filter((a) => !isDoWhile(a))
    .filter((a) => !isES3OnlyAlt(a))
    .map((a) => normSpell(stripNoIn(a)));
  return { kind: entry.kind, alts };
};

// Render an ES2 production as es3-style <dl class="grammar">.
const renderDl = (name, entry) => {
  const dt = `<dt><i>${name}</i> <b>${entry.kind}</b></dt>`;
  const dd = `<dd>${entry.alts.join("\n        <br />\n        ")}</dd>`;
  return `<dl class="grammar">\n        ${dt}\n        ${dd}\n      </dl>`;
};

// --- collect the nonterminals ch.12 declares (from Marker ES2) ----------------
// Body region: 2nd occurrence of "12 Statements" (1st is the ToC) up to body
// "13 Function Definition".
const bodyStart = es2src.indexOf(
  "12 Statements",
  es2src.indexOf("12 Statements") + 10,
);
const bodyEnd = es2src.indexOf("13 Function Definition", bodyStart);
const ch12 = es2src.slice(bodyStart, bodyEnd);

const declared = []; // in document order, de-duped
const seen = new Set();
const add = (n) => {
  if (n && !seen.has(n)) {
    seen.add(n);
    declared.push(n);
  }
};
// <pre>Name :</pre> / <pre>Name :: one of</pre>
for (const mm of ch12.matchAll(/<pre>([A-Z][A-Za-z]+)\s*:+[^<]*<\/pre>/g)) {
  add(mm[1]);
}
// <h*|p ...><i>Name</i> <b>:+</b>
for (
  const mm of ch12.matchAll(/<i>\s*([A-Z][A-Za-z]+)\s*<\/i>\s*<b>\s*:+/g)
) add(mm[1]);

// --- report + preview ---------------------------------------------------------
const report = [];
const previews = [];
let ok = 0, miss = 0;
for (const name of declared) {
  const key = grammar.has(name) ? name : es3Name(name);
  if (!grammar.has(key)) {
    report.push(`  ✗ MISSING in es3   ${name}  (ES2-only lexical production)`);
    miss++;
    continue;
  }
  const before = grammar.get(key);
  const after = transform(before);
  const changed = before.alts.length !== after.alts.length ||
    before.alts.some((a, i) => a !== after.alts[i]);
  report.push(
    `  ✓ ${changed ? "transformed" : "verbatim   "} ${name}` +
      (changed ? `  (${before.alts.length}→${after.alts.length} alts)` : ""),
  );
  ok++;
  previews.push(renderDl(name, after));
}

console.log("=== ES2 ch.12 grammar swap — validation ===");
console.log(
  `es3 Annex A nonterminals: ${grammar.size} | ch.12 declares: ${declared.length}`,
);
console.log(report.join("\n"));
console.log(`\nmatched ${ok}, missing ${miss}`);

const outHtml = `<!doctype html><meta charset="utf-8">
<title>ES2 ch.12 grammar — reconstructed from es3 Annex A</title>
<style>
  body{font:15px/1.5 Georgia,serif;max-width:60ch;margin:2rem auto}
  dl.grammar{margin:1rem 0}
  dl.grammar dt{font-style:italic}
  dl.grammar dd{margin-left:2em}
  i{font-style:italic} b{font-weight:bold} tt{font-family:monospace}
</style>
<h1>ES2 chapter 12 — grammar reconstruction (prototype)</h1>
<p>Productions borrowed from es3 Annex A, transformed to ES2
(strip <code>NoIn</code>, drop do-while + ES3-only). Declared-by order from the
Marker ES2 output.</p>
${previews.join("\n")}
`;
const outPath = path.join(here, "out", "ch12-grammar-preview.html");
fs.writeFileSync(outPath, outHtml);
console.log(`\npreview → ${path.relative(process.cwd(), outPath)}`);
