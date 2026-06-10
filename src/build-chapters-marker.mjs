// Marker ingester — re-skin a Marker-converted pre-ecmarkup PDF (ES1 or ES2),
// with a hybrid grammar swap. See docs/es2-plan.md. The edition is inferred from
// the --input path (ecma262/<edition>/spec.html); edition-specific data (section
// overrides, the provenance note) is keyed by it, everything else is shared — ES1
// and ES2 have identical grammar/structure (ES2 is ES1's editorial reissue).
//
// ECMA-262 1st/2nd Editions have NO HTML source — only a PDF — so the source is
// manufactured with Marker (ML PDF→HTML), vendored as ecma262/<edition>/spec.html.
// Marker reconstructs prose / algorithms / section structure well, but FLATTENS
// multi-alternative grammar productions (the line breaks separating alternatives
// are lost) and drops some math symbols. So this ingester:
//
//   • splits sections by dotted heading number (Marker heading *levels* are
//     unreliable, the numbers are not), rebuilds the tree by dot-depth;
//   • replaces each "Syntax" block's STRUCTURAL productions with the clean es3
//     production (ecma262/es3/spec.html), transformed down to ES2 — see
//     swapGrammar() / the rules in proto-grammar.mjs;
//   • KEEPS Marker's "one of" terminal-list productions (Keyword, Punctuator, …):
//     es3's lists carry ES3-only terminals (switch/try/===/…) ES2 lacks;
//   • converts algorithm <ul> (block-type ListItem, "1." "2." prefixes) → <ol>;
//   • synthesises sec-<num> anchors + reconstructs "see N.N" cross-references.
//
// Emits the same scratch contract build-pages.ts consumes (lib/<slug>.jsx +
// content/<slug>.mdx + content/_meta.js), reusing the ES3/ES5.1 re-skin shape.
//
// Usage:
//   node build-chapters-marker.mjs --input ecma262/es2/spec.html \
//     --lib-dir <dir> --content-dir <dir> --public-img-dir <dir> \
//     --base-path "" [--only 12]   # --only restricts to one chapter (debug)

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

// Edition id from the input path: ecma262/es1/spec.html -> "es1".
const EDITION = /ecma262\/(es[0-9.]+)\b/.exec(INPUT)?.[1] ?? "es2";

const src = fs.readFileSync(INPUT, "utf8");
// es3 grammar source sits alongside the input (ecma262/es3/spec.html); ES1 and
// ES2 share es3's grammar (no feature changes between the editions).
const ES3_PATH = path.join(path.dirname(INPUT), "../es3/spec.html");
const es3src = fs.readFileSync(ES3_PATH, "utf8");

// Offline math-symbol restoration for the dense Math/Date sections (§15.8/15.9):
// Marker dropped the PDF's symbol glyphs (− × ∞ π …); tools/es2-marker/
// restore-symbols.py re-inserts them by aligning the Marker and PDF text streams
// and vendors the patched section bodies here, keyed by section number. Applied
// before the normal pipeline so grammar/algorithm/re-skin still run.
const SYMBOL_FIXES_PATH = path.join(path.dirname(INPUT), "symbol-fixes.json");
const SYMBOL_FIXES = fs.existsSync(SYMBOL_FIXES_PATH)
  ? JSON.parse(fs.readFileSync(SYMBOL_FIXES_PATH, "utf8"))
  : {};

const plain = (html) =>
  html.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const slugify = (title) =>
  plain(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
    /^-+|-+$/g,
    "",
  );

// ===========================================================================
// es3 grammar map  (clean production layout, transformed to ES2)
// ===========================================================================

// ES3-only nonterminals to drop wholesale (definition + whole-alternative use).
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
  "FunctionBody", // ES2 function bodies are a Block, not { FunctionBody }
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
  // Array / object literals (initialisers) were added in ES3.
  "ArrayLiteral",
  "ElementList",
  "Elision",
  "ObjectLiteral",
  "PropertyNameAndValueList",
  "PropertyName",
  // §9.3.1: ES3 factored out an unsigned production; ES2 keeps the sign in
  // StrNumericLiteral (see the StrNumericLiteral/StrDecimalLiteral overrides).
  "StrUnsignedDecimalLiteral",
]);

// Productions ES3 *changed* from ES2 (not merely added) — borrowing es3's would
// be wrong, so hand-author the ES2 form. Keyed by nonterminal; checked before
// both the es3 swap and Marker's (often mangled) version. Markup matches es3's
// convention: <i> nonterminals, <b><tt> terminals, <sub>opt</sub> subscripts.
const ES2_GRAMMAR_OVERRIDE = {
  // §7 — Marker drops the alternatives into prose; es3 has no InputElement
  // (it split into InputElementDiv/RegExp for the regexp/division ambiguity).
  InputElement:
    `<dl class="grammar"><dt><i>InputElement</i> <b>::</b></dt>\n      <dd><i>WhiteSpace</i>\n      <br /><i>LineTerminator</i>\n      <br /><i>Comment</i>\n      <br /><i>Token</i></dd>\n    </dl>`,
  // §7.5 — ES3 rebuilt identifiers on Unicode (IdentifierStart/Part); ES2 uses
  // the simpler IdentifierLetter form.
  IdentifierName:
    `<dl class="grammar"><dt><i>IdentifierName</i> <b>::</b></dt>\n      <dd><i>IdentifierLetter</i>\n      <br /><i>IdentifierName IdentifierLetter</i>\n      <br /><i>IdentifierName DecimalDigit</i></dd>\n    </dl>`,
  IdentifierLetter:
    `<dl class="grammar"><dt><i>IdentifierLetter</i> <b>:: one of</b></dt>\n      <dd><b><tt>a b c d e f g h i j k l m n o p q r s t u v w x y z</tt></b>\n      <br /><b><tt>A B C D E F G H I J K L M N O P Q R S T U V W X Y Z _ $</tt></b></dd>\n    </dl>`,
  // §13 — ES2 function bodies are a Block; ES3 introduced { FunctionBody }.
  FunctionDeclaration:
    `<dl class="grammar"><dt><i>FunctionDeclaration</i> <b>:</b></dt>\n      <dd><b><tt>function</tt></b> <i>Identifier</i> <b><tt>(</tt></b> <i>FormalParameterList<sub>opt</sub></i> <b><tt>)</tt></b> <i>Block</i></dd>\n    </dl>`,
  // §9.3.1 — ES2 puts the sign here (ES3 moved it to StrDecimalLiteral, over an
  // unsigned production ES2 lacks). The "−" alternative is also one Marker drops.
  StrNumericLiteral:
    `<dl class="grammar"><dt><i>StrNumericLiteral</i> <b>:::</b></dt>\n      <dd><i>StrDecimalLiteral</i>\n      <br /><b><tt>+</tt></b> <i>StrDecimalLiteral</i>\n      <br /><b><tt>-</tt></b> <i>StrDecimalLiteral</i>\n      <br /><i>HexIntegerLiteral</i></dd>\n    </dl>`,
  // §9.3.1 — the unsigned decimal forms (ES3's StrUnsignedDecimalLiteral).
  StrDecimalLiteral:
    `<dl class="grammar"><dt><i>StrDecimalLiteral</i> <b>:::</b></dt>\n      <dd><b><tt>Infinity</tt></b>\n      <br /><i>DecimalDigits</i> <b><tt>.</tt></b> <i>DecimalDigits<sub>opt</sub> ExponentPart<sub>opt</sub></i>\n      <br /><b><tt>.</tt></b> <i>DecimalDigits ExponentPart<sub>opt</sub></i>\n      <br /><i>DecimalDigits ExponentPart<sub>opt</sub></i></dd>\n    </dl>`,
};

// Whole-section overrides for prose Marker mangled beyond mechanical repair.
// Marker drops the PDF's symbol-font glyphs entirely — minus (−), times (×),
// infinity (∞), π, ≥, ≠ — AND the superscripts around them, so e.g. §8.5's
// "2^64 − 2^53 + 3" arrived as "2^64 253+3". The densest such sections — §8.5
// (the Number type) and §9.5–9.7 (the integer-conversion operators) — are
// hand-authored here from the vendored PDF's text layer (the symbol-font glyph
// codes are per-font, so they were read by meaning, not a fixed map). The
// remaining math-heavy sections (§9.3.1, §11.5/6, §15.8 Math, §15.9 Date) still
// show Marker's symbol-dropped text — a known residue.
const sup = (n) => `2<sup>${n}</sup>`;
const ES2_SECTION_OVERRIDE = {
  "sec-8.5": [
    `<p>The Number type has exactly 18437736874454810627 (that is, ${
      sup(64)
    } − ${
      sup(53)
    } + 3) values, representing the double-precision 64-bit format IEEE 754 values as specified in the IEEE Standard for Binary Floating-Point Arithmetic, except that the 9007199254740990 (that is, ${
      sup(53)
    } − 2) distinct "Not-a-Number" values of the IEEE Standard are represented in ECMAScript as a single special <b>NaN</b> value. (Note that the <b>NaN</b> value is produced by the program expression <b>NaN</b>, assuming that the globally defined variable <b>NaN</b> has not been altered by program execution.) In some implementations, external code might be able to detect a difference between various Not-a-Number values, but such behaviour is implementation-dependent; to ECMAScript code, all <b>NaN</b> values are indistinguishable from each other.</p>`,
    `<p>There are two other special values, called <b>positive Infinity</b> and <b>negative Infinity</b>. For brevity, these values are also referred to for expository purposes by the symbols +∞ and −∞, respectively. (Note that these two infinite number values are produced by the program expressions <b>+Infinity</b> (or simply <b>Infinity</b>) and <b>-Infinity</b>, assuming that the globally defined variable <b>Infinity</b> has not been altered by program execution.)</p>`,
    `<p>The other 18437736874454810624 (that is, ${sup(64)} − ${
      sup(53)
    }) values are called the finite numbers. Half of these are positive numbers and half are negative numbers; for every finite positive number there is a corresponding negative number having the same magnitude.</p>`,
    `<p>Note that there is both a positive zero and a negative zero. For brevity, these values are also referred to for expository purposes by the symbols +0 and −0, respectively. (Note that these two zero number values are produced by the program expressions <b>+0</b> (or simply <b>0</b>) and <b>-0</b>.)</p>`,
    `<p>The 18437736874454810622 (that is, ${sup(64)} − ${
      sup(53)
    } − 2) finite nonzero values are of two kinds:</p>`,
    `<p>18428729675200069632 (that is, ${sup(64)} − ${
      sup(54)
    }) of them are <i>normalised</i>, having the form</p>`,
    `<p style="text-align:center"><i>s</i> × <i>m</i> × 2<sup><i>e</i></sup></p>`,
    `<p>where <i>s</i> is +1 or −1, <i>m</i> is a positive integer less than ${
      sup(53)
    } but not less than ${
      sup(52)
    }, and <i>e</i> is an integer ranging from −1074 to 971, inclusive.</p>`,
    `<p>The remaining 9007199254740990 (that is, ${
      sup(53)
    } − 2) values are <i>denormalised</i>, having the form</p>`,
    `<p style="text-align:center"><i>s</i> × <i>m</i> × 2<sup><i>e</i></sup></p>`,
    `<p>where <i>s</i> is +1 or −1, <i>m</i> is a positive integer less than ${
      sup(52)
    }, and <i>e</i> is −1074.</p>`,
    `<p>Note that all the positive and negative integers whose magnitude is no greater than ${
      sup(53)
    } are representable in the Number type (indeed, the integer 0 has two representations, <b>+0</b> and <b>-0</b>).</p>`,
    `<p>A finite number has an <i>odd significand</i> if it is nonzero and the integer <i>m</i> used to express it (in one of the two forms shown above) is odd. Otherwise, it has an <i>even significand</i>.</p>`,
    `<p>In this specification, the phrase "the number value for <i>x</i>" where <i>x</i> represents an exact nonzero real mathematical quantity (which might even be an irrational number such as π) means a number value chosen in the following manner. Consider the set of all finite values of the Number type, with −0 removed and with two additional values added to it that are not representable in the Number type, namely ${
      sup(1024)
    } (which is +1 × ${sup(53)} × ${sup(971)}) and −${
      sup(1024)
    } (which is −1 × ${sup(53)} × ${
      sup(971)
    }). Choose the member of this set that is closest in value to <i>x</i>. If two values of the set are equally close, then the one with an even significand is chosen; for this purpose, the two extra values ${
      sup(1024)
    } and −${sup(1024)} are considered to have even significands. Finally, if ${
      sup(1024)
    } was chosen, replace it with +∞; if −${
      sup(1024)
    } was chosen, replace it with −∞; if +0 was chosen, replace it with −0 if and only if <i>x</i> is less than zero; any other chosen value is used unchanged. The result is the number value for <i>x</i>. (This procedure corresponds exactly to the behaviour of the IEEE 754 "round to nearest" mode.)</p>`,
    `<p>Some ECMAScript operators deal only with integers in the range −${
      sup(31)
    } through ${sup(31)} − 1, inclusive, or in the range 0 through ${
      sup(32)
    } − 1, inclusive. These operators accept any value of the Number type but first convert each such value to one of ${
      sup(32)
    } integer values. See the descriptions of the ToInt32 and ToUint32 operators in sections 9.5 and 9.6, respectively.</p>`,
  ].join("\n"),
  // §9.5–9.7 — the integer-conversion operators: superscript- and symbol-dense
  // algorithm sections (2^32 / 2^31 / 2^16, −, +∞/−∞, −0). Marker dropped all of
  // them. Restored from the PDF text layer (note: the symbol-font glyph codes
  // differ between the body and the NOTE font, so these were read by meaning).
  "sec-9.5": [
    `<p>The operator ToInt32 converts its argument to one of ${
      sup(32)
    } integer values in the range −${sup(31)} through ${
      sup(31)
    } − 1, inclusive. This operator functions as follows:</p>`,
    `<ol class="ecma-alg"><li>Call ToNumber on the input argument.</li>`,
    `<li>If Result(1) is <b>NaN</b>, +0, −0, +∞, or −∞, return +0.</li>`,
    `<li>Compute sign(Result(1)) × floor(abs(Result(1))).</li>`,
    `<li>Compute Result(3) modulo ${
      sup(32)
    }; that is, a finite integer value <i>k</i> of Number type with positive sign and less than ${
      sup(32)
    } in magnitude such that the mathematical difference of Result(3) and <i>k</i> is mathematically an integer multiple of ${
      sup(32)
    }.</li>`,
    `<li>If Result(4) is greater than or equal to ${
      sup(31)
    }, return Result(4) − ${sup(32)}, otherwise return Result(4).</li></ol>`,
    `<p class="es2-note"><b>NOTE</b> Given the above definition of ToInt32: the ToInt32 operation is idempotent: if applied to a result that it produced, the second application leaves that value unchanged. ToInt32(ToUint32(<i>x</i>)) is equal to ToInt32(<i>x</i>) for all values of <i>x</i>. (It is to preserve this latter property that +∞ and −∞ are mapped to +0.) ToInt32 maps −0 to +0.</p>`,
  ].join("\n"),
  "sec-9.6": [
    `<p>The operator ToUint32 converts its argument to one of ${
      sup(32)
    } integer values in the range 0 through ${
      sup(32)
    } − 1, inclusive. This operator functions as follows:</p>`,
    `<ol class="ecma-alg"><li>Call ToNumber on the input argument.</li>`,
    `<li>If Result(1) is <b>NaN</b>, +0, −0, +∞, or −∞, return +0.</li>`,
    `<li>Compute sign(Result(1)) × floor(abs(Result(1))).</li>`,
    `<li>Compute Result(3) modulo ${
      sup(32)
    }; that is, a finite integer value <i>k</i> of Number type with positive sign and less than ${
      sup(32)
    } in magnitude such that the mathematical difference of Result(3) and <i>k</i> is mathematically an integer multiple of ${
      sup(32)
    }.</li>`,
    `<li>Return Result(4).</li></ol>`,
    `<p class="es2-note"><b>NOTE</b> Given the above definition of ToUint32: step 5 is the only difference between ToUint32 and ToInt32. The ToUint32 operation is idempotent: if applied to a result that it produced, the second application leaves that value unchanged. ToUint32(ToInt32(<i>x</i>)) is equal to ToUint32(<i>x</i>) for all values of <i>x</i>. (It is to preserve this latter property that +∞ and −∞ are mapped to +0.) ToUint32 maps −0 to +0.</p>`,
  ].join("\n"),
  "sec-9.7": [
    `<p>The operator ToUint16 converts its argument to one of ${
      sup(16)
    } integer values in the range 0 through ${
      sup(16)
    } − 1, inclusive. This operator functions as follows:</p>`,
    `<ol class="ecma-alg"><li>Call ToNumber on the input argument.</li>`,
    `<li>If Result(1) is <b>NaN</b>, +0, −0, +∞, or −∞, return +0.</li>`,
    `<li>Compute sign(Result(1)) × floor(abs(Result(1))).</li>`,
    `<li>Compute Result(3) modulo ${
      sup(16)
    }; that is, a finite integer value <i>k</i> of Number type with positive sign and less than ${
      sup(16)
    } in magnitude such that the mathematical difference of Result(3) and <i>k</i> is mathematically an integer multiple of ${
      sup(16)
    }.</li>`,
    `<li>Return Result(4).</li></ol>`,
    `<p class="es2-note"><b>NOTE</b> Given the above definition of ToUint16: the substitution of ${
      sup(16)
    } for ${
      sup(32)
    } in step 4 is the only difference between ToUint32 and ToUint16. ToUint16 maps −0 to +0.</p>`,
  ].join("\n"),
};

// ES1 differs from ES2 in these same sections (editorial): multiplication is "⋅"
// (not "×"), American "behavior", "We say that …", §9.5–9.7 use a "Discussion:"
// heading and Result(5)/Result(4) wording. Hand-authored from the ES1 PDF.
const ES1_SECTION_OVERRIDE = {
  "sec-8.5": [
    `<p>The Number type has exactly 18437736874454810627 (that is, ${
      sup(64)
    } − ${
      sup(53)
    } + 3) values, representing the double-precision 64-bit format IEEE 754 values as specified in the IEEE Standard for Binary Floating-Point Arithmetic, except that the 9007199254740990 (that is, ${
      sup(53)
    } − 2) distinct "Not-a-Number" values of the IEEE Standard are represented in ECMAScript as a single special <b>NaN</b> value. (Note that the <b>NaN</b> value is produced by the program expression <b>NaN</b>, assuming that the globally defined variable <b>NaN</b> has not been altered by program execution.) In some implementations, external code might be able to detect a difference between various Not-a-Number values, but such behavior is implementation-dependent; to ECMAScript code, all <b>NaN</b> values are the same.</p>`,
    `<p>There are two other special values, called <b>positive Infinity</b> and <b>negative Infinity</b>. For brevity, these values are also referred to for expository purposes by the symbols +∞ and −∞, respectively. (Note that these two infinite number values are produced by the program expressions <b>+Infinity</b> (or simply <b>Infinity</b>) and <b>-Infinity</b>, assuming that the globally defined variable <b>Infinity</b> has not been altered by program execution.)</p>`,
    `<p>The other 18437736874454810624 (that is, ${sup(64)} − ${
      sup(53)
    }) values are called the finite numbers. Half of these are positive numbers and half are negative numbers; for every finite positive number there is a corresponding negative number having the same magnitude.</p>`,
    `<p>Note that there is both a positive zero and a negative zero. For brevity, these values are also referred to for expository purposes by the symbols +0 and −0, respectively. (Note that these two zero number values are produced by the program expressions <b>+0</b> (or simply <b>0</b>) and <b>-0</b>.)</p>`,
    `<p>The 18437736874454810622 (that is, ${sup(64)} − ${
      sup(53)
    } − 2) finite nonzero values are of two kinds:</p>`,
    `<p>18428729675200069632 (that is, ${sup(64)} − ${
      sup(54)
    }) of them are <i>normalized</i>, having the form</p>`,
    `<p style="text-align:center"><i>s</i> ⋅ <i>m</i> ⋅ 2<sup><i>e</i></sup></p>`,
    `<p>where <i>s</i> is +1 or −1, <i>m</i> is a positive integer less than ${
      sup(53)
    } but not less than ${
      sup(52)
    }, and <i>e</i> is an integer ranging from −1074 to 971, inclusive.</p>`,
    `<p>The remaining 9007199254740990 (that is, ${
      sup(53)
    } − 2) values are <i>denormalized</i>, having the form</p>`,
    `<p style="text-align:center"><i>s</i> ⋅ <i>m</i> ⋅ 2<sup><i>e</i></sup></p>`,
    `<p>where <i>s</i> is +1 or −1, <i>m</i> is a positive integer less than ${
      sup(52)
    }, and <i>e</i> is −1074.</p>`,
    `<p>Note that all the positive and negative integers whose magnitude is no greater than ${
      sup(53)
    } are representable in the Number type (indeed, the integer 0 has two representations, <b>+0</b> and <b>-0</b>).</p>`,
    `<p>We say that a finite number has an <i>odd significand</i> if it is nonzero and the integer <i>m</i> used to express it (in one of the two forms shown above) is odd. Otherwise we say that it has an <i>even significand</i>.</p>`,
    `<p>In this specification, the phrase "the number value for <i>x</i>" where <i>x</i> represents an exact nonzero real mathematical quantity (which might even be an irrational number such as π) means a number value chosen in the following manner. Consider the set of all finite values of the Number type, with −0 removed and with two additional values added to it that are not representable in the Number type, namely ${
      sup(1024)
    } (which is +1 ⋅ ${sup(53)} ⋅ ${sup(971)}) and −${
      sup(1024)
    } (which is −1 ⋅ ${sup(53)} ⋅ ${
      sup(971)
    }). Choose the member of this set that is closest in value to <i>x</i>. If two values of the set are equally close, then the one with an even significand is chosen; for this purpose, the two extra values ${
      sup(1024)
    } and −${sup(1024)} are considered to have even significands. Finally, if ${
      sup(1024)
    } was chosen, replace it with +∞; if −${
      sup(1024)
    } was chosen, replace it with −∞; if +0 was chosen, replace it with −0 if and only if <i>x</i> is less than zero; any other chosen value is used unchanged. The result is the number value for <i>x</i>. (This procedure corresponds exactly to the behavior of the IEEE 754 "round to nearest" mode.)</p>`,
    `<p>Some ECMAScript operators deal only with integers in the range −${
      sup(31)
    } through ${sup(31)} − 1, inclusive, or in the range 0 through ${
      sup(32)
    } − 1, inclusive. These operators accept any value of the Number type but first convert each such value to one of ${
      sup(32)
    } integer values. See the descriptions of the ToInt32 and ToUint32 operators in sections 9.5 and 9.6, respectively.</p>`,
  ].join("\n"),
  "sec-9.5": [
    `<p>The operator ToInt32 converts its argument to one of ${
      sup(32)
    } integer values in the range −${sup(31)} through ${
      sup(31)
    } − 1, inclusive. This operator functions as follows:</p>`,
    `<ol class="ecma-alg"><li>Call ToNumber on the input argument.</li>`,
    `<li>If Result(1) is <b>NaN</b>, +0, −0, +∞, or −∞, return +0.</li>`,
    `<li>Compute sign(Result(1)) ⋅ floor(abs(Result(1))).</li>`,
    `<li>Compute Result(3) modulo ${
      sup(32)
    }; that is, a finite integer value <i>k</i> of Number type with positive sign and less than ${
      sup(32)
    } in magnitude such that the mathematical difference of Result(3) and <i>k</i> is mathematically an integer multiple of ${
      sup(32)
    }.</li>`,
    `<li>If Result(4) is greater than or equal to ${
      sup(31)
    }, return Result(5) − ${sup(32)}; otherwise return Result(5).</li></ol>`,
    `<p class="es2-note"><b>Discussion:</b> Note that the ToInt32 operation is idempotent: if applied to a result that it produced, the second application leaves that value unchanged. Note also that ToInt32(ToUint32(<i>x</i>)) is equal to ToInt32(<i>x</i>) for all values of <i>x</i>. (It is to preserve this latter property that +∞ and −∞ are mapped to +0.) Note that ToInt32 maps −0 to +0.</p>`,
  ].join("\n"),
  "sec-9.6": [
    `<p>The operator ToUint32 converts its argument to one of ${
      sup(32)
    } integer values in the range 0 through ${
      sup(32)
    } − 1, inclusive. This operator functions as follows:</p>`,
    `<ol class="ecma-alg"><li>Call ToNumber on the input argument.</li>`,
    `<li>If Result(1) is <b>NaN</b>, +0, −0, +∞, or −∞, return +0.</li>`,
    `<li>Compute sign(Result(1)) ⋅ floor(abs(Result(1))).</li>`,
    `<li>Compute Result(3) modulo ${
      sup(32)
    }; that is, a finite integer value <i>k</i> of Number type with positive sign and less than ${
      sup(32)
    } in magnitude such that the mathematical difference of Result(3) and <i>k</i> is mathematically an integer multiple of ${
      sup(32)
    }.</li>`,
    `<li>Return Result(4).</li></ol>`,
    `<p class="es2-note"><b>Discussion:</b> Note that step 5 is the only difference between ToUint32 and ToInt32. The ToUint32 operation is idempotent: if applied to a result that it produced, the second application leaves that value unchanged. ToUint32(ToInt32(<i>x</i>)) is equal to ToUint32(<i>x</i>) for all values of <i>x</i>. (It is to preserve this latter property that +∞ and −∞ are mapped to +0.) ToUint32 maps −0 to +0.</p>`,
  ].join("\n"),
  "sec-9.7": [
    `<p>The operator ToUint16 converts its argument to one of ${
      sup(16)
    } integer values in the range 0 through ${
      sup(16)
    } − 1, inclusive. This operator functions as follows:</p>`,
    `<ol class="ecma-alg"><li>Call ToNumber on the input argument.</li>`,
    `<li>If Result(1) is <b>NaN</b>, +0, −0, +∞, or −∞, return +0.</li>`,
    `<li>Compute sign(Result(1)) ⋅ floor(abs(Result(1))).</li>`,
    `<li>Compute Result(3) modulo ${
      sup(16)
    }; that is, a finite integer value <i>k</i> of Number type with positive sign and less than ${
      sup(16)
    } in magnitude such that the mathematical difference of Result(3) and <i>k</i> is mathematically an integer multiple of ${
      sup(16)
    }.</li>`,
    `<li>Return Result(4).</li></ol>`,
    `<p class="es2-note"><b>Discussion:</b> The substitution of ${
      sup(16)
    } for ${
      sup(32)
    } in step 4 is the only difference between ToUint32 and ToUint16. ToUint16 maps −0 to +0.</p>`,
  ].join("\n"),
};

const SECTION_OVERRIDE = EDITION === "es1"
  ? ES1_SECTION_OVERRIDE
  : ES2_SECTION_OVERRIDE;

// ES1's "Brief History" page was captured by Marker only as an image (see
// frontMatter); restore its prose as text from the PDF. ES2's is real text.
const BRIEF_HISTORY = EDITION === "es1"
  ? "<p>This ECMA Standard is based on several originating technologies, the " +
    "most well known being JavaScript&trade; (Netscape Communications) and " +
    "JScript&trade; (Microsoft Corporation). The development of this Standard " +
    "started in November 1996.</p>" +
    "<p>The ECMA Standard is submitted to ISO/IEC JTC 1 for adoption under the " +
    "fast-track procedure.</p>" +
    "<p>This ECMA Standard has been adopted by the ECMA General Assembly of " +
    "June 1997.</p>"
  : "";

// ES2 spelling (American) vs bclary es3 (British): normalise borrowed markup.
const normSpell = (html) => html.replace(/Initialiser/g, "Initializer");
const es3Name = (es2Name) => es2Name.replace(/Initializer/g, "Initialiser");

const dlRe = /<dl class="grammar">\s*<dt>([\s\S]*?)<\/dt>([\s\S]*?)<\/dl>/g;
const grammarNameOf = (dtHtml) => plain(dtHtml).replace(/\s*:.*$/s, "").trim();
// Keep the <dt>'s inner markup (so "one of", italics, etc. survive) but strip
// the trailing "See N.N" cross-ref bclary appends.
const cleanDt = (dtHtml) =>
  dtHtml.replace(/<span class="gsee">[\s\S]*?<\/span>/g, "")
    .replace(/\s*:+\s*See\s[0-9.]+/g, (s) => s.replace(/See\s[0-9.]+/, ""))
    .trim();

// Split an es3 <dd> into per-alternative fragments that are each tag-balanced.
// es3 wraps runs of nonterminals in a single <i> that spans the <br/>s between
// alternatives, so a naive split leaves dangling <i>/</i> — and dropping an
// ES3-only alternative would then strip a tag belonging to a kept one. Re-open
// any tag still open at a <br/> boundary and close it at the segment end, so
// every alternative stands alone and is safe to drop.
const INLINE = /<(\/?)(i|b|tt|sub|sup)>/gi;
const splitAlts = (ddHtml) => {
  const inner = ddHtml.replace(/^\s*<dd>/i, "").replace(/<\/dd>\s*$/i, "");
  const open = [];
  const out = [];
  for (const seg of inner.split(/<br\s*\/?>/i)) {
    const prefix = open.map((t) => `<${t}>`).join("");
    const stack = open.slice();
    let mm;
    INLINE.lastIndex = 0;
    while ((mm = INLINE.exec(seg)) !== null) {
      const tag = mm[2].toLowerCase();
      if (mm[1]) {
        const k = stack.lastIndexOf(tag);
        if (k >= 0) stack.splice(k, 1);
      } else stack.push(tag);
    }
    const suffix = stack.slice().reverse().map((t) => `</${t}>`).join("");
    const frag = (prefix + seg + suffix).trim();
    if (plain(frag).length > 0) out.push(frag);
    open.length = 0;
    open.push(...stack);
  }
  return out;
};

const grammar = new Map(); // name -> { dt, alts: [htmlFragment, ...] }
const indexGrammar = (text) => {
  const re = new RegExp(dlRe.source, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = grammarNameOf(m[1]);
    if (!name || ES3_ONLY.has(name)) continue;
    if (!grammar.has(name)) {
      grammar.set(name, { dt: cleanDt(m[1]), alts: splitAlts(m[2]) });
    }
  }
};
// Prefer Annex A's consolidated productions, then backfill from the body.
const es3annexAt = es3src.search(/name="annex-a"/);
indexGrammar(es3src.slice(es3annexAt));
indexGrammar(es3src.slice(0, es3annexAt));

// es3 production → ES2: strip NoIn, drop do-while + ES3-only whole-alternatives,
// normalise spelling.
const stripNoIn = (html) => html.replace(/NoIn/g, "");
const isDoWhileAlt = (alt) => /^\s*do\b/.test(plain(alt));
const isES3OnlyAlt = (alt) =>
  ES3_ONLY.has(plain(alt).replace(/\bopt\b/g, "").trim());
const renderEs2Dl = (name) => {
  const key = grammar.has(name) ? name : es3Name(name);
  const entry = grammar.get(key);
  if (!entry) return null; // genuinely ES2-only (ch.7 lexical divergence)
  const alts = entry.alts
    .filter((a) => !isDoWhileAlt(a))
    .filter((a) => !isES3OnlyAlt(a))
    .map((a) => normSpell(stripNoIn(a)));
  // Render with the ES2 (American) nonterminal name in the <dt>.
  const dt = normSpell(entry.dt).replace(
    new RegExp(`<i>\\s*${es3Name(name)}\\s*</i>`),
    `<i>${name}</i>`,
  );
  const dd = alts.join("\n      <br />\n      ");
  return `<dl class="grammar"><dt>${dt}</dt>\n      <dd>${dd}</dd>\n    </dl>`;
};

// ===========================================================================
// Syntax-block grammar swap
// ===========================================================================

// Split a region into top-level Marker blocks (flat — Marker doesn't nest).
const BLOCK_RE = /<(h[1-6]|p|pre|table|ul|ol|div)\b[^>]*>[\s\S]*?<\/\1>/gi;
const splitBlocks = (html) => html.match(BLOCK_RE) ?? [];
const blockTag = (b) => (b.match(/^<([a-z0-9]+)/i)?.[1] ?? "").toLowerCase();
// A production declaration: text begins "Nonterminal :" / "::" / ":::".
const declOf = (b) => {
  const t = plain(b);
  const m = t.match(/^([A-Z][A-Za-z]+)\s*(:::|::|:)\s*(one of)?/);
  if (!m) return null;
  return { name: m[1], oneOf: !!m[3] };
};
// Distinguish a flattened grammar alternative (drop / fold into a production)
// from prose (keep). Prose has consecutive lowercase words; grammar runs are
// Capitalised nonterminals + lowercase terminals + symbols.
const isGrammarish = (b) => {
  const tag = blockTag(b);
  if (tag !== "p" && tag !== "pre") return false;
  return !/[a-z]{3,}\s+[a-z]{3,}/.test(plain(b));
};

const unmappedNTs = new Set();

// Rebuild one Syntax region: swap structural productions for es3, keep Marker's
// "one of" tables, drop the flattened alternative paragraphs.
const rebuildSyntax = (regionHtml) => {
  const blocks = splitBlocks(regionHtml);
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const decl = declOf(b);
    if (!decl) {
      // Flattened continuation of a structural production → drop. Anything that
      // isn't grammar-shaped (prose, tables, lists) is kept.
      if (!isGrammarish(b)) out.push(b);
      continue;
    }
    // Hand-authored ES2 form wins over both es3 and Marker (productions ES3
    // changed, or that Marker mangled). Consume Marker's version that follows.
    if (ES2_GRAMMAR_OVERRIDE[decl.name]) {
      out.push(ES2_GRAMMAR_OVERRIDE[decl.name]);
      while (
        i + 1 < blocks.length && !declOf(blocks[i + 1]) &&
        (isGrammarish(blocks[i + 1]) || blockTag(blocks[i + 1]) === "table")
      ) i++;
      continue;
    }
    if (decl.oneOf) {
      // "one of" terminal list. The keyword family (Keyword, Punctuator, …)
      // differs from ES3, so keep Marker's table. Others (digits, operators,
      // escapes) are identical to ES3, so if Marker lost the table — its
      // terminals were promoted to a heading and stripped — fall back to es3.
      const table = blockTag(blocks[i + 1]) === "table" ? blocks[i + 1] : null;
      const es3Only = /^(Keyword|FutureReservedWord|Punctuator|DivPunctuator)$/
        .test(decl.name);
      if (!table && !es3Only && renderEs2Dl(decl.name)) {
        out.push(renderEs2Dl(decl.name));
      } else {
        out.push(`<p class="grammar-oneof">${plain(b)}</p>`);
        if (table) out.push(blocks[++i]);
      }
      continue;
    }
    const dl = renderEs2Dl(decl.name);
    if (dl) {
      out.push(dl);
      // following non-declaration blocks (this production's flattened alts) are
      // dropped by the !decl branch on subsequent iterations.
    } else {
      // ES2-only lexical production with no es3 equivalent: keep Marker's
      // (flattened) content, flagged for hand review.
      unmappedNTs.add(decl.name);
      out.push(`<dl class="grammar es2-grammar-unmapped"><dt>${plain(b)}</dt>`);
      const dd = [];
      // Only fold in following grammar-shaped blocks (the flattened alts) —
      // stop at the first prose paragraph / heading / next declaration.
      while (
        i + 1 < blocks.length && !declOf(blocks[i + 1]) &&
        isGrammarish(blocks[i + 1])
      ) {
        dd.push(plain(blocks[++i]));
      }
      out.push(`<dd>${dd.join("<br />")}</dd></dl>`);
    }
  }
  return out.join("\n    ");
};

// Within a section body, find each "Syntax" sub-heading and rebuild the grammar
// region that follows it (up to the next Semantics/Description/NOTE heading —
// section boundaries are already handled by the splitter).
const STOP_LABEL = /^(Semantics|Description|Runtime Semantics|NOTE\b)/i;
const swapGrammar = (body) => {
  const headRe = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const heads = [];
  let m;
  while ((m = headRe.exec(body)) !== null) {
    heads.push({ text: plain(m[2]), start: m.index, end: headRe.lastIndex });
  }
  // Process from the end so earlier offsets stay valid as we splice.
  let result = body;
  for (let h = heads.length - 1; h >= 0; h--) {
    if (!/^Syntax$/i.test(heads[h].text)) continue;
    // Region = after this Syntax heading up to the next stop-label heading
    // (or end of body).
    let end = result.length;
    for (let k = h + 1; k < heads.length; k++) {
      if (STOP_LABEL.test(heads[k].text)) {
        end = heads[k].start;
        break;
      }
    }
    const region = result.slice(heads[h].end, end);
    result = result.slice(0, heads[h].end) + "\n    " + rebuildSyntax(region) +
      "\n    " + result.slice(end);
  }
  return result;
};

// Marker sometimes promotes a grammar production declaration ("ArgumentList :",
// "StringNumericLiteral :::") to an <h*> heading. Outside a "Syntax" block (e.g.
// the §5.1.5 notation examples, §7.8 ASI examples) swapGrammar never sees it, so
// it renders as an italicised heading. Demote any such leftover to a grammar
// line so it reads as a production, not a section heading. ("Syntax"/"Semantics"
// /"Description"/"NOTE" sub-headings have no leading "NT :" and are kept.)
const demoteGrammarHeadings = (html) =>
  html.replace(
    /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi,
    (m, _t, inner) =>
      /^[A-Z][A-Za-z]+\s*:{1,3}(\s|<|$)/.test(plain(inner))
        ? `<p class="grammar-oneof">${inner.trim()}</p>`
        : m,
  );

// ===========================================================================
// Body cleanup  (algorithms, Marker cruft)
// ===========================================================================

// Algorithm lists: Marker emits <ul><li block-type="ListItem">1. …</li></ul>.
// Turn into <ol> and strip the leading "N." (and the ListGroup <p> wrapper).
const algoLists = (html) =>
  html.replace(
    /<p[^>]*block-type="ListGroup"[^>]*>\s*<ul>([\s\S]*?)<\/ul>\s*<\/p>/gi,
    (_m, items) => {
      const lis = items.replace(
        /<li[^>]*>\s*([0-9]+)\.\s*([\s\S]*?)<\/li>/gi,
        (_x, _n, txt) => `<li>${txt.trim()}</li>`,
      );
      return `<ol class="ecma-alg">${lis}</ol>`;
    },
  );
// Drop Marker's block-type bookkeeping attributes (cosmetic).
const dropBlockType = (html) => html.replace(/\s*block-type="[^"]*"/g, "");

// Specific OCR fixes from Marker (each verified unique in the source). Dropped
// math symbols (−, ×) in prose are NOT auto-fixed — restoring them reliably
// needs the PDF — and remain a known residue.
const OCR_FIXES = [
  [/\b2n d Edition\b/g, "2nd Edition"],
  [/\bfunctionlocal\b/g, "function-local"],
  [/\bdoubleprecision\b/g, "double-precision"],
  [/\bNon-a-Number\b/g, "Not-a-Number"],
];
const ocrFixes = (html) =>
  OCR_FIXES.reduce((s, [re, to]) => s.replace(re, to), html);

// Marker extracts whole title/cover/back pages as "Picture" images
// (`_page_N_Picture_*`, full-page aspect) — not spec figures. Drop them (and any
// wrapping <p>). Real diagrams are `_page_N_Figure_*` and are kept.
const dropCoverImages = (html) =>
  html.replace(/<p>\s*<img[^>]*_Picture_[^>]*>\s*<\/p>/gi, "")
    .replace(/<img[^>]*_Picture_[^>]*>/gi, "");

// ===========================================================================
// Parse sections  (dotted-number headings only)
// ===========================================================================

// Keep only headings whose text starts with a dotted section number + a title
// word. This rejects Marker's leaked grammar headings ("ArgumentList :"),
// algorithm-step headings ("8. Return Result(7)."), and OCR junk.
const headRe = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
const SECNUM = /^(\d+(?:\.\d+)*)\s+(\S[\s\S]*)$/;
const rawHeads = [];
let hm;
while ((hm = headRe.exec(src)) !== null) {
  const text = plain(hm[2]);
  const m = text.match(SECNUM);
  if (!m) continue;
  // Reject OCR'd grammar "one of" terminal rows that look like a number + a run
  // of single characters (e.g. "0 1 2 3 … f A … F", "1 2 3 4 5 6 7 8 9"). A real
  // single-letter title (15.8.1.1 "E") is one token, never a long run.
  const words = m[2].trim().split(/\s+/);
  if (words.length >= 4 && words.every((w) => w.length === 1)) continue;
  // Chapters are 1…16; reject a bogus leading "0".
  if (Number(m[1].split(".")[0]) < 1) continue;
  rawHeads.push({
    num: m[1],
    title: m[2].replace(/\s+/g, " ").trim(),
    start: hm.index,
    end: headRe.lastIndex,
  });
}
if (rawHeads.length === 0) {
  throw new Error("no numbered section headings found");
}

const sections = rawHeads.map((h, i) => {
  const end = i + 1 < rawHeads.length ? rawHeads[i + 1].start : src.length;
  return {
    id: `sec-${h.num}`,
    num: h.num,
    title: h.title,
    body: (SYMBOL_FIXES[h.num] ?? src.slice(h.end, end)).trim(),
    depth: h.num.split(".").length,
    children: [],
  };
});

// --- group into top-level chapters + rebuild each chapter's tree -------------
const want = (s) => !ONLY || s.num === ONLY || s.num.startsWith(`${ONLY}.`);
const chosen = sections.filter(want);
if (chosen.length === 0) throw new Error(`no sections matched (only=${ONLY})`);

const roots = [];
const stack = [];
for (const s of chosen) {
  while (stack.length && stack[stack.length - 1].depth >= s.depth) stack.pop();
  (stack.length ? stack[stack.length - 1].children : roots).push(s);
  stack.push(s);
}

// Front matter → the edition root (index) page: the Brief History + intro,
// minus the giant table-of-contents (the site sidebar replaces it). Skipped in
// --only debug mode.
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
  const start = src.indexOf("</h1>", bh) + 5;
  const firstSec = rawHeads[0].start;
  let intro = src.slice(start, firstSec);
  // Drop the "Table of contents" heading and everything after it up to §1 (the
  // end of the front matter). A long ToC is split across several <table>s, so
  // stopping at the first </table> (as before) would leave the rest behind.
  intro = intro.replace(
    /<h[1-6][^>]*>\s*(?:<b>)?\s*Table of contents[\s\S]*$/i,
    "",
  );
  // The front matter (title page / Brief History / ToC) has no figures, so any
  // <img> here is a Marker page-scan artefact — e.g. ES1's Brief History page
  // mis-extracted as `_page_4_Figure_1` (not caught by dropCoverImages, which
  // only targets `_Picture_`). Real figures live in numbered body sections.
  intro = intro.replace(/<p>\s*<img[^>]*>\s*<\/p>/gi, "").replace(
    /<img[^>]*>/gi,
    "",
  );
  // Drop empty tables (Marker emits a contentless <table> grid next to the ES1
  // Brief-History image).
  intro = intro.replace(
    /<table>[\s\S]*?<\/table>/gi,
    (m) => (plain(m) ? m : ""),
  );
  // ES1's Brief History was captured ONLY as that page-scan image (no text), so
  // restore the prose from the PDF text layer; ES2's Brief History is real text.
  intro = BRIEF_HISTORY + intro;
  const ed = EDITION === "es1" ? "1st" : "2nd";
  const tail = EDITION === "es1"
    ? "ES1 (1997) is the first edition; ES2 (1998) is its editorial reissue."
    : "ES2 (1998) is an editorial reissue of ES1 (1997).";
  const note = `<p class="es2-source-note">This edition is ` +
    `<strong>reconstructed from the ${ed}-edition PDF with Marker (ML)</strong> — ` +
    "it is not the official ECMA text (which exists only as a PDF) and may " +
    "contain conversion artefacts. The grammar productions are sourced from the " +
    `3rd Edition and pruned. ${tail}</p>`;
  return leaf("index", "index", "Introduction", note + intro);
};

let pages = roots;
if (!ONLY) {
  pages = [frontMatter(), ...roots].filter(Boolean);
}

// ===========================================================================
// Re-skin pipeline  (shared shape with build-chapters-es3.mjs)
// ===========================================================================
const pathFor = (slug) => `${BASE_PATH}${slug === "index" ? "" : `/${slug}`}`;
const idToSlug = {}; // sec-<num> -> chapter slug
const numToId = {}; // "11.2" -> "sec-11.2" (only for known sections)

// Reconstruct cross-references: ES2's PDF refers to sections by text
// ("see 11.2", "in section 7.2", "(section 10.1.3)"). Rewrite recognised ones
// to anchors; numbers without a known section are left as plain text.
const rewriteXrefs = (html) =>
  html.replace(
    /\b(see\s+|section\s+)(\d+(?:\.\d+)+)\b/gi,
    (full, lead, num) => {
      const id = numToId[num];
      const slug = id && idToSlug[id];
      return slug ? `${lead}<a href="${pathFor(slug)}#${id}">${num}</a>` : full;
    },
  );
// Marker names extracted figures `_page_N_Figure_*` — but Lume excludes any
// path segment starting with "_" (its `_includes`/`_data` convention), so such
// files never reach _site and render broken. Strip the leading underscore(s) so
// they publish; the copy step below renames the files to match.
const imgName = (file) => file.replace(/^_+/, "");
const imgPaths = (html) =>
  html.replace(
    /\b(src|data)="([^"/]+\.(?:svg|png|jpe?g|gif))"/gi,
    (_m, attr, file) => `${attr}="${BASE_PATH}/img/${imgName(file)}"`,
  );
const reskin = (html) => imgPaths(rewriteXrefs(html));

const secnumSpan = (n) => (n ? `<span className="secnum">${n}</span> ` : "");

// Section titles are plain text (entities decoded during parsing), so operator
// titles like "The left shift operator ( << )" carry raw <, >, {, } that MDX
// reads as JSX. Re-escape them for the MDX heading line.
const mdxTitle = (t) =>
  t.replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");

// --- assign chapter slugs + global maps --------------------------------------
for (const c of pages) {
  c.slug = c.slug || slugify(c.title) || `section-${c.num}`;
  (function map(n) {
    idToSlug[n.id] = c.slug;
    if (n.num) numToId[n.num] = n.id;
    n.children.forEach(map);
  })(c);
}

// Full per-section transform: grammar swap → algorithms → cleanup → re-skin.
const processBody = (body) =>
  ocrFixes(
    reskin(
      dropCoverImages(
        dropBlockType(demoteGrammarHeadings(algoLists(swapGrammar(body)))),
      ),
    ),
  );

// ===========================================================================
// Emit the scratch contract
// ===========================================================================
const meta = {};
for (const chapter of pages) {
  const slug = chapter.slug;
  const secMap = {};
  (function collect(n) {
    secMap[n.id] = SECTION_OVERRIDE[n.id] ?? processBody(n.body);
    n.children.forEach(collect);
  })(chapter);

  const componentSrc = [
    `// Generated from ecma262/${EDITION}/spec.html (Marker re-skin) — do not edit by hand.`,
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
    `<div id="spec-container" className="ecma-spec ecma-${EDITION}">`,
    "",
  ];
  (function emit(n, level) {
    const hashes = "#".repeat(Math.min(level, 6));
    mdxLines.push(`<emu-clause id="${n.id}">`, "");
    mdxLines.push(
      `${hashes} ${secnumSpan(n.num)}${reskin(mdxTitle(n.title))}`,
      "",
    );
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

// img/ — mirror the vendored Marker figures.
if (PUBLIC_IMG_DIR) {
  fs.mkdirSync(PUBLIC_IMG_DIR, { recursive: true });
  const imgSrc = path.join(path.dirname(INPUT), "img");
  if (fs.existsSync(imgSrc)) {
    for (const name of fs.readdirSync(imgSrc)) {
      // Rename to match imgName() so Lume doesn't skip "_"-prefixed files.
      fs.copyFileSync(
        path.join(imgSrc, name),
        path.join(PUBLIC_IMG_DIR, imgName(name)),
      );
    }
  }
}

if (unmappedNTs.size) {
  console.log(
    `[${EDITION}] ${unmappedNTs.size} unmapped nonterminal(s) kept from Marker ` +
      `(flag es2-grammar-unmapped): ${[...unmappedNTs].sort().join(", ")}`,
  );
}
console.log(
  `[${EDITION}] converted ${Object.keys(meta).length} page(s): ${
    Object.keys(meta).join(", ")
  }`,
);
