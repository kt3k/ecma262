// Build every edition into a single dist/ for GitHub Pages.
//
//   editions (draft, es20xx)  ->  built per edition with Lume, dist/<id>/
//   site-draft-nextra/out/    ->  dist/draft-nextra/ (comparison, if built)
//   dist/index.html           <-  redirect to the editor's draft
//
// Each edition is (re)built here: run lume's pages/build/pagefind tasks with
// EDITION + BASE_PATH set, then copy lume/_site -> dist/<id>. The Nextra
// comparison build is copied from its static export when present. Paths resolve
// off the repo root.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { readEditions } from "./editions.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const packagesDir = path.join(root, "packages");
const distDir = path.join(root, "dist");
const lumeDir = path.join(root, "lume");

const editions = readEditions(root);

if (editions.length === 0) {
  console.error("[assemble-dist] no editions in packages/shared/editions.json");
  process.exit(1);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const lumeSite = path.join(lumeDir, "_site");
for (const edition of editions) {
  // Regenerate this edition's pages, build, and index, all under its deploy
  // prefix, then copy the result in.
  const env = {
    ...process.env,
    EDITION: edition.id,
    BASE_PATH: `/ecma262/${edition.id}`,
  };
  for (const task of ["pages", "build", "pagefind"]) {
    execFileSync("deno", ["task", task], {
      cwd: lumeDir,
      env,
      stdio: "inherit",
    });
  }
  fs.cpSync(lumeSite, path.join(distDir, edition.id), { recursive: true });
  console.log(`[assemble-dist] ${edition.id}: Lume -> dist/${edition.id}/`);
}

// Nextra comparison build (site-draft-nextra) — not a listed edition; deploy at
// /draft-nextra/ when its static export is present (`pnpm build:nextra`).
const nextraOut = path.join(packagesDir, "site-draft-nextra", "out");
if (fs.existsSync(nextraOut)) {
  fs.cpSync(nextraOut, path.join(distDir, "draft-nextra"), { recursive: true });
  console.log(
    "[assemble-dist] draft-nextra: Nextra out/ -> dist/draft-nextra/",
  );
} else {
  console.log(
    "[assemble-dist] draft-nextra: no out/, skipping comparison build",
  );
}

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Shared shell for the top-level static pages (landing + about).
const page = (title, main, css) =>
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)}</title>
  <style>
${css}
  </style>
</head>
<body>
${main}
</body>
</html>
`;

// Editorial styling for the top-level article pages (/about, /pipeline),
// evoking the Ghost "Edition" theme: Mulish sans throughout with an extra-bold
// (800) display heading, a narrow measure, roomy line-height, and muted
// underlined links. 62.5% root keeps rem ≈ px/10 (as Edition does).
const articleCss =
  `    @import url('https://fonts.googleapis.com/css2?family=Mulish:wght@400;600;700;800&display=swap');
    html { font-size: 62.5%; }
    body {
      font-family: 'Mulish', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 1.9rem;
      line-height: 1.7;
      color: #333;
      background: #fff;
      max-width: 62rem;
      margin: 14vh auto 8rem;
      padding: 0 2rem;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    h1 {
      font-family: 'Mulish', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-weight: 800;
      font-size: 4.4rem;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: #15171a;
      margin: 0 0 2rem;
    }
    p { margin: 0 0 1.6rem; }
    h2 { font-family: 'Mulish', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-weight: 700; font-size: 2.6rem; line-height: 1.25; letter-spacing: -0.01em; color: #15171a; margin: 3.4rem 0 1rem; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.86em; background: #f6f6f6; padding: 0.1em 0.35em; border-radius: 4px; }
    .flow { list-style: none; padding: 0; margin: 0 0 1.2rem; }
    .flow li { position: relative; background: #f6f6f6; border: 1px solid #e8e8e8; border-radius: 8px; padding: 1.2rem 1.6rem; }
    .flow li strong { display: block; color: #15171a; font-weight: 700; font-size: 1.7rem; }
    .flow li span { display: block; color: #6b6b6b; font-size: 1.4rem; margin-top: 0.2rem; }
    .flow li + li { margin-top: 3.4rem; }
    .flow li:not(:last-child)::after { content: "\\2193"; position: absolute; left: 50%; bottom: -2.9rem; transform: translateX(-50%); color: #bbb; font-size: 1.8rem; line-height: 1; }
    pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.35rem; line-height: 1.6; background: #f6f6f6; border: 1px solid #e8e8e8; border-radius: 8px; padding: 1.1rem 1.3rem; overflow-x: auto; color: #333; margin: 0 0 1rem; }
    table { border-collapse: collapse; width: 100%; margin: 0 0 2.4rem; font-size: 1.5rem; }
    th, td { border: 1px solid #e2e2e2; padding: 0.55rem 0.85rem; text-align: left; vertical-align: top; }
    th { background: #f6f6f6; font-weight: 700; color: #15171a; }
    figure { margin: 2rem 0; }
    figure pre + pre { margin-top: 0.6rem; }
    figcaption { color: #999; font-size: 1.4rem; margin-top: 0.6rem; }
    strong { font-weight: 600; color: #15171a; }
    a { color: inherit; text-decoration: underline; text-decoration-color: rgba(0,0,0,0.28); text-underline-offset: 3px; }
    a:hover { text-decoration-color: currentColor; }
    footer { margin-top: 4rem; display: flex; flex-direction: column; align-items: flex-start; gap: 0.6rem; font-size: 1.6rem; }
    footer a { color: #15171a; text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    footer .copyright { margin-top: 0.8rem; color: #999; font-size: 1.4rem; }
    footer .copyright a { color: inherit; text-decoration: underline; }`;

// The root has no landing page; it redirects to the editor's draft (like
// tc39.es/ecma262/). Every edition, plus /about and /pipeline, stays reachable
// from each site's footer and version switcher.
const redirectTo = `./${
  (editions.find((e) => e.id === "draft") ?? editions[0]).id
}/`;
fs.writeFileSync(
  path.join(distDir, "index.html"),
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${redirectTo}">
  <link rel="canonical" href="${redirectTo}">
  <title>ECMA-262 Restyled</title>
  <script>location.replace(${JSON.stringify(redirectTo)});</script>
</head>
<body>
  <p>Redirecting to <a href="${redirectTo}">the editor's draft</a>.</p>
</body>
</html>
`,
);

// Footer shared by the article pages: the edition list (styled like the site
// footer) plus the copyright line. Edition links are relative to a /<page>/ dir.
const articleFooter = `  <footer>
${
  editions.map((s) => `    <a href="../${s.id}/">${escape(s.title)}</a>`).join(
    "\n",
  )
}
    <span class="copyright">${
  new Date().getFullYear()
} © <a href="https://github.com/kt3k/ecma262">ECMA-262 Restyled</a></span>
  </footer>`;

const writeArticle = (slug, title, main) => {
  fs.mkdirSync(path.join(distDir, slug), { recursive: true });
  fs.writeFileSync(
    path.join(distDir, slug, "index.html"),
    page(title, `${main}\n${articleFooter}`, articleCss),
  );
};

writeArticle(
  "about",
  "About | ECMA-262 Restyled",
  `  <h1>About</h1>
  <p><strong>ECMA-262 Restyled</strong> is an unofficial, reader-focused rendering of the ECMAScript® Language Specification. It mirrors the source from the official <a href="https://github.com/tc39/ecma262">tc39/ecma262</a> repository and restyles it for readability; it is <strong>not normative</strong>. For the authoritative text, see the official specification at <a href="https://tc39.es/ecma262/">tc39.es/ecma262</a>. The source for this site is at <a href="https://github.com/kt3k/ecma262">kt3k/ecma262</a>.</p>
  <p>See <a href="../pipeline/">how this site is built</a>.</p>`,
);

writeArticle(
  "pipeline",
  "How it's built | ECMA-262 Restyled",
  `  <h1>How ECMA-262 Restyled is built</h1>
  <p>This page documents the internals of ECMA-262 Restyled for readers who already know <a href="https://github.com/tc39/ecmarkup">ecmarkup</a> and want to understand exactly how the site is produced. It assumes familiarity with ecmarkup's tags; it is not a guide to the specification itself.</p>
  <p>For a short, non-technical overview of the project, see <a href="../about/">About</a>.</p>

  <h2>The core idea</h2>
  <p>The vendored <code>spec.html</code> is the <em>ecmarkup source</em>, before ecmarkup builds it, not the published multipage output. So a single Node script, <code>build-chapters.mjs</code>, re-implements the subset of ecmarkup's build steps the site needs, using string and regex transforms with no ecmarkup dependency. Every transform below runs at build time; the resulting HTML is injected into the page with <code>dangerouslySetInnerHTML</code>.</p>

  <ol class="flow">
    <li><strong>Vendor</strong><span>spec.html (ecmarkup source) per edition: draft as a git submodule, ES2024/25/26 as pinned snapshots</span></li>
    <li><strong>Split</strong><span>each top-level emu-clause/annex/intro becomes a page; nested clauses become Markdown headings with their bodies injected as HTML</span></li>
    <li><strong>Resolve &amp; transform</strong><span>two numbering passes feed a chain of per-tag rewrites (xref, prodref, grammar, alg, structured header, inline, autolinks)</span></li>
    <li><strong>Adapt for Lume</strong><span>build-pages.ts wraps each chapter as a Lume page (front matter + local <code>&lt;Sec&gt;</code> import) for one edition (EDITION + BASE_PATH), and emits the sidebar list</span></li>
    <li><strong>Render</strong><span>Lume (Deno; ssx + mdx) injects the HTML and applies styles.css; Pagefind builds the search index</span></li>
    <li><strong>Assemble</strong><span>each edition is built with Lume and combined into one static site</span></li>
  </ol>

  <h2>Splitting into pages</h2>
  <p>The build splits each top-level <code>&lt;emu-clause&gt;</code> / <code>&lt;emu-annex&gt;</code> / <code>&lt;emu-intro&gt;</code> into its own page, then walks the nested clauses. Every clause's <code>&lt;h1&gt;</code> is emitted as a Markdown heading carrying its section number and an id anchor; the clause body is emitted separately and injected as pre-transformed HTML between the headings. Lume's mdx plugin parses the result, and a post-render pass in <code>_config.ts</code> walks the <code>&lt;emu-clause id&gt;</code> tree to build the on-this-page table of contents. The left sidebar comes from a chapter list (slug + title) that <code>build-pages.ts</code> emits alongside the pages.</p>

  <h2>Cross-references and numbering</h2>
  <p>ecmarkup fills empty reference tags with text at build time; the source leaves them empty (e.g. <code>&lt;emu-xref href="#sec-foo"&gt;&lt;/emu-xref&gt;</code>). We resolve them in two passes. <strong>Pass 1</strong> walks every chapter in document order and records, per anchor id, the label a reference should show:</p>
  <table>
    <thead><tr><th>Target</th><th>Anchor id</th><th>Numbered by</th><th>Link text</th></tr></thead>
    <tbody>
      <tr><td>Clause</td><td><code>sec-…</code></td><td><code>registerSectionIds()</code> (nesting position)</td><td><code>14.7.2</code></td></tr>
      <tr><td>Table</td><td><code>table-…</code></td><td>global document-order counter</td><td><code>Table 6</code></td></tr>
      <tr><td>Figure</td><td><code>figure-…</code></td><td>global document-order counter</td><td><code>Figure 2</code></td></tr>
      <tr><td>Note</td><td><code>note-…</code></td><td><code>numberNotes()</code> (per clause)</td><td><code>Note 1</code> / <code>Note</code></td></tr>
      <tr><td>Step</td><td><code>step-…</code></td><td><code>buildAlgTree()</code> + <code>collectAlgSteps()</code></td><td><code>1.d</code></td></tr>
    </tbody>
  </table>
  <p><strong>Pass 2</strong> (<code>applyXrefSubst()</code>) rewrites each empty <code>&lt;emu-xref&gt;</code> into <code>&lt;a href="…#id"&gt;label&lt;/a&gt;</code>, checking the clause map first and the table / figure / note / step map second. Step numbers use the same decimal &rarr; lower-alpha &rarr; lower-roman cycle as the algorithm list styling, so a reference reads <code>1.d</code>.</p>

  <h2>Structured headers</h2>
  <p>When a clause's <code>&lt;h1&gt;</code> holds a typed signature immediately followed by <code>&lt;dl class="header"&gt;</code>, it is rewritten the way ecmarkup does: <code>parseStructuredH1()</code> parses the signature, the return type is dropped from the heading, and <code>buildStructuredBody()</code> synthesises a preamble paragraph from the signature plus the <code>for</code> and <code>description</code> entries.</p>
  <figure>
    <pre>&lt;h1&gt;Completion ( _completionRecord_: a Completion Record ): a Completion Record&lt;/h1&gt;
&lt;dl class="header"&gt;
  &lt;dt&gt;description&lt;/dt&gt;
  &lt;dd&gt;It is used to emphasize that a Completion Record is being returned.&lt;/dd&gt;
&lt;/dl&gt;</pre>
    <pre>&lt;h1&gt;Completion ( _completionRecord_ )&lt;/h1&gt;
&lt;p&gt;The abstract operation Completion takes argument _completionRecord_ (a Completion
Record) and returns a Completion Record. It is used to emphasize that a Completion
Record is being returned. It performs the following steps when called:&lt;/p&gt;</pre>
    <figcaption>Source signature + dl.header (top) becomes a clean heading + a generated preamble (bottom).</figcaption>
  </figure>

  <h2>Per-construct handling</h2>
  <p>Each section's body HTML passes through a chain of transforms. The main constructs:</p>
  <table>
    <thead><tr><th>Source construct</th><th>Handler</th><th>Result</th></tr></thead>
    <tbody>
      <tr><td><code>&lt;emu-xref href="#id"&gt;&lt;/emu-xref&gt;</code></td><td><code>applyXrefSubst()</code></td><td>numbered link (see above)</td></tr>
      <tr><td><code>&lt;emu-prodref name="X"&gt;</code></td><td><code>applyProdrefSubst()</code></td><td>inlines the referenced production, collected from every <code>&lt;emu-grammar type="definition"&gt;</code></td></tr>
      <tr><td><code>&lt;emu-grammar&gt;</code></td><td><code>applyGrammarSubst()</code> + <code>tokenizeGrammarBlock()</code></td><td>tokenized into spans (nonterminal, terminal, <code>:</code> arrow, [params], modifiers, prose) styled by CSS</td></tr>
      <tr><td><code>&lt;emu-alg&gt;</code> (Markdown steps)</td><td><code>applyAlgSubst()</code> / <code>parseAlg()</code></td><td>nested <code>&lt;ol&gt;</code>; an <code>[id="step-…"]</code> annotation becomes the <code>&lt;li&gt;</code> anchor</td></tr>
      <tr><td><code>&lt;emu-table&gt;</code> / <code>&lt;emu-figure&gt;</code></td><td><code>applyFloatNum()</code></td><td>adds <code>data-num</code>; CSS renders "Table N: caption"</td></tr>
      <tr><td><code>&lt;emu-note&gt;</code></td><td><code>numberNotes()</code></td><td>adds <code>data-num</code>; CSS labels "Note N"</td></tr>
      <tr><td>inline notation</td><td><code>applyInlineMarkup()</code> / <code>transformInlineText()</code></td><td>see below</td></tr>
    </tbody>
  </table>

  <h2>Inline notation</h2>
  <p>ecmarkup's Markdown-like shorthand is expanded everywhere except inside <code>&lt;pre&gt;</code> / <code>&lt;code&gt;</code> / grammar blocks:</p>
  <table>
    <thead><tr><th>Source</th><th>Output</th><th>Rendered as</th></tr></thead>
    <tbody>
      <tr><td><code>_x_</code></td><td><code>&lt;var&gt;x&lt;/var&gt;</code></td><td>italic variable</td></tr>
      <tr><td><code>*foo*</code></td><td><code>&lt;b&gt;foo&lt;/b&gt;</code></td><td>bold spec value</td></tr>
      <tr><td><code>&#96;foo&#96;</code></td><td><code>&lt;code&gt;foo&lt;/code&gt;</code></td><td>inline code chip</td></tr>
      <tr><td><code>|Foo|</code></td><td><code>&lt;emu-nt&gt;Foo&lt;/emu-nt&gt;</code></td><td>italic nonterminal</td></tr>
      <tr><td><code>~enum~</code></td><td><code>&lt;emu-const&gt;enum&lt;/emu-const&gt;</code></td><td>small-caps enum</td></tr>
      <tr><td><code>%Foo.Bar%</code></td><td><code>&lt;emu-intrinsic&gt;%Foo.Bar%&lt;/emu-intrinsic&gt;</code></td><td>monospace intrinsic</td></tr>
    </tbody>
  </table>

  <h2>The transform chain</h2>
  <p>For each section the rewrites run inner to outer, so later passes see the output of earlier ones (the two autolink passes run last, so they can skip text that an earlier pass already turned into a link):</p>
  <pre>applyNoteNum  &rarr;  applyFloatNum  &rarr;  applyHljsSubst  &rarr;  applyAlgSubst
  &rarr;  applyGrammarSubst  &rarr;  applyEqnInlineSubst  &rarr;  applyProdrefSubst
  &rarr;  applyXrefSubst  &rarr;  applyInlineMarkup  &rarr;  applyDfnLinkSubst  &rarr;  applyAoLinkSubst</pre>

  <h2>Autolinking</h2>
  <p>ecmarkup also turns bare prose mentions into links. We build two target maps up front and apply them in the last two passes:</p>
  <ul>
    <li><strong>Defined terms</strong> — every <code>&lt;dfn&gt;</code> (and its <code>variants</code>) maps to its anchor; <code>applyDfnLinkSubst()</code> links matching prose. Matching is case-sensitive except a lowercase-defined term may also match a sentence-start capital (so "List" links "List" but not the common word "list"). A term is left plain inside the clause its link points at, and inside code / grammar / headings / existing links.</li>
    <li><strong>Abstract operations</strong> — every clause whose <code>type</code> is an operation kind (abstract operation, sdo, numeric method, …), plus any explicit <code>aoid=</code>, maps its name to its definition; <code>applyAoLinkSubst()</code> wraps occurrences (e.g. <code>ThrowCompletion</code>, <code>floor</code>) in <code>&lt;emu-xref aoid&gt;</code>. Very common words (<code>Call</code>, <code>Set</code>, <code>Type</code>, …) link only when written as a call (<code>(</code> next).</li>
  </ul>

  <h2>Rendering and styling</h2>
  <p>The transformed HTML is injected (via <code>dangerouslySetInnerHTML</code>) into <code>&lt;div class="ecma-spec"&gt;</code> and rendered by Lume's ssx/mdx pipeline. The page chrome — sidebar, on-this-page TOC, header, footer, version switcher, dark-mode toggle — is a small set of hand-written ssx components in <code>lume/_includes/</code>. A single stylesheet, <code>styles.css</code> (the ecmarkup look the framework lacks: note callouts, grammar token colours, math-font equations (<code>&lt;emu-eqn&gt;</code>), small-caps enums, the algorithm decimal / alpha / roman list cycle, and table / figure captions), is copied in verbatim. Pagefind indexes the built pages so the search box works on the static deploy.</p>

  <h2>Known limitations</h2>
  <ul>
    <li><strong>Unicode property tables</strong> (e.g. <code>table-binary-unicode-properties</code>) are generated by ecmarkup from the Unicode database and are absent from the vendored snapshot, so a few references to them stay unresolved and some later table numbers differ from the official by a small offset.</li>
    <li><strong>Autolink coverage</strong> — defined terms and abstract operations link (see above), but built-in functions and internal / concrete methods are not yet autolinked the way ecmarkup links them.</li>
    <li><strong>Editorial diff markup</strong> (<code>&lt;ins&gt;</code> / <code>&lt;del&gt;</code> inside headers) is not handled; published snapshots do not use it.</li>
  </ul>`,
);

console.log(`[assemble-dist] assembled dist/ from ${editions.length} sites`);
