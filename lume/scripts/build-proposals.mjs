// Render vendored TC39 proposal specs (proposals/<name>/spec.html, listed in
// proposals/proposals.json) into the restyled reading experience under
// dist/proposals/. Called from assemble-dist.mjs after the editions are built,
// so the draft edition's assets, scripts and xref index are already in
// dist/draft/ — proposal pages borrow them (and rewrite their cross-references
// into the draft, so links resolve inside this site and even get hover cards).
//
// Each proposal spec is a snapshot; pages carry a prominent non-normative note.
import fs from "node:fs";
import path from "node:path";

const A = "/ecma262/draft"; // borrowed asset/base path
const strip = (h) =>
  h.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// fragment -> draft slug, from the built draft edition (for xref rewriting).
function draftFragMap(distDir) {
  const map = Object.create(null);
  const draft = path.join(distDir, "draft");
  if (!fs.existsSync(draft)) return map;
  for (const e of fs.readdirSync(draft, { withFileTypes: true })) {
    if (!e.isDirectory() || ["img", "fonts", "pagefind"].includes(e.name)) {
      continue;
    }
    const f = path.join(draft, e.name, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    for (const m of html.matchAll(/\sid="([^"]+)"/g)) {
      if (!(m[1] in map)) map[m[1]] = e.name;
    }
  }
  return map;
}

// Parse one proposal spec snapshot into { title, main, toc }.
function parseSpec(raw, fragMap) {
  // Drop ecmarkup's inline scripts/styles (the menu JS contains 'EMU-CLAUSE'
  // strings that would fool the clause slice below) — we only want the content.
  const src = raw.replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");

  const tm = src.match(/<h1 class="title">([\s\S]*?)<\/h1>/);
  const title = tm ? strip(tm[1]) : "Proposal";

  const i = src.indexOf("<emu-clause");
  const j = src.lastIndexOf("</emu-clause>");
  let body = i >= 0 && j >= 0 ? src.slice(i, j + "</emu-clause>".length) : "";

  // Rewrite main-spec cross-references to this site's draft (fall back to the
  // official URL when a fragment isn't in draft).
  body = body.replace(
    /href="https?:\/\/tc39\.es\/ecma262\/[^"]*#([^"]+)"/g,
    (m, frag) => (fragMap[frag] ? `href="${A}/${fragMap[frag]}/#${frag}"` : m),
  );

  // Inject a "#" heading-anchor into each clause heading (heading-anchors.js
  // turns clicks into copy-link; styled by .heading-anchor). Empty <a> so its
  // text doesn't leak into the TOC.
  body = body.replace(
    /(<emu-clause\b[^>]*\bid="([^"]+)"[^>]*>\s*(?:<div class="attributes-tag">[\s\S]*?<\/div>\s*)?<h1\b[^>]*>[\s\S]*?)(<\/h1>)/g,
    (_m, pre, id, close) =>
      `${pre}<a class="heading-anchor" href="#${id}" aria-label="Permalink to this section"></a>${close}`,
  );

  // Build the right-rail TOC from clause openers.
  const toc = [];
  const clauseRe =
    /<emu-clause\b[^>]*\bid="([^"]+)"[^>]*?(?:\bnumber="([^"]*)")?[^>]*>\s*<h1\b[^>]*>([\s\S]*?)<\/h1>/g;
  let c;
  while ((c = clauseRe.exec(body)) !== null) {
    const id = c[1], num = c[2] || "";
    let t = c[3].replace(/<span class="secnum">[\s\S]*?<\/span>/, "");
    t = strip(t.replace(/<a class="heading-anchor"[\s\S]*?<\/a>/, ""));
    toc.push({ id, num, t, depth: num ? num.split(".").length : 1 });
  }
  const minD = Math.min(...toc.map((x) => x.depth), 1);
  const tocHtml = toc.map((x) =>
    `<li data-level="${Math.min(4, x.depth - minD + 1)}"><a href="#${
      esc(x.id)
    }">${x.num ? esc(x.num) + " " : ""}${esc(x.t)}</a></li>`
  ).join("");

  return { title, main: body, toc: tocHtml };
}

function shell(
  { title, headTitle, stage, spec, repo, sidebar, mainHtml, toc },
) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(headTitle)}</title>
<script>(function(){var p=localStorage.getItem("theme");var d=p==="dark"||(p===null&&matchMedia("(prefers-color-scheme:dark)").matches);if(d)document.documentElement.classList.add("dark");})();</script>
<link rel="stylesheet" href="${A}/hljs-github.css">
<link rel="stylesheet" href="${A}/styles.css">
<link rel="icon" href="${A}/favicon.svg">
<script defer src="${A}/xref-hover.js" data-xref-index="${A}/xref-index.json"></script>
<script defer src="${A}/reading-progress.js"></script>
<script defer src="${A}/breadcrumb.js"></script>
<script defer src="${A}/heading-anchors.js"></script>
<script defer src="${A}/back-to-top.js"></script>
</head>
<body>
<header class="site-header"><div class="site-header-blur" aria-hidden="true"></div>
<nav class="site-header-inner">
<span class="site-title-group"><a class="site-title" href="/ecma262/proposals/"><b>TC39 Proposals</b></a>${
    stage ? `<span class="prop-stage">Stage ${esc(stage)}</span>` : ""
  }</span>
${
    spec
      ? `<a class="qual-link" href="${
        esc(spec)
      }" target="_blank" rel="noreferrer">official spec ↗</a>`
      : ""
  }
</nav>
</header>
<div class="layout-wrapper">
<aside id="sidebar" class="sidebar" aria-label="Proposals">
<ol class="sidebar-list">${sidebar}
<li class="group-start"><a href="${A}/">← ECMA-262 draft</a></li>
</ol>
</aside>
<main id="content" data-pagefind-body="true">
<div class="ecma-spec">
${mainHtml}
</div>
</main>
<aside class="toc" aria-label="On this page">
<h2>On This Page</h2>
<ol>${toc}</ol>
${
    repo
      ? `<a class="toc-feedback" href="${
        esc(repo)
      }" target="_blank" rel="noreferrer">Proposal repo ↗</a>`
      : ""
  }
</aside>
</div>
</body>
</html>`;
}

export function buildProposals(distDir, rootDir) {
  const pdir = path.join(rootDir, "proposals");
  const listFile = path.join(pdir, "proposals.json");
  if (!fs.existsSync(listFile)) return 0;
  const list = JSON.parse(fs.readFileSync(listFile, "utf8"));
  const fragMap = draftFragMap(distDir);

  // Parse every proposal that has a vendored spec.
  const parsed = [];
  for (const p of list) {
    const f = path.join(pdir, p.name, "spec.html");
    if (!fs.existsSync(f)) continue;
    const info = parseSpec(fs.readFileSync(f, "utf8"), fragMap);
    parsed.push({ ...p, ...info, repoUrl: `https://github.com/${p.repo}` });
  }

  const note = (p) =>
    `<p class="es2-source-note"><strong>Unofficial restyling of a TC39 proposal.</strong> ` +
    `This is a snapshot of the <em>${esc(p.title)}</em> proposal (Stage&nbsp;${
      esc(p.stage)
    }), rendered from its ecmarkup spec for reading. It is not normative and may ` +
    `be out of date — see the official proposal at ` +
    `<a href="${esc(p.spec)}">${
      esc(p.spec.replace(/^https?:\/\//, ""))
    }</a>. ` +
    `Cross-references link into this site's draft edition.</p>`;

  const sidebarFor = (cur) =>
    parsed.map((p) =>
      `<li class="${
        p.name === cur ? "current" : ""
      }"><a href="/ecma262/proposals/${p.name}/">${esc(p.title)}</a></li>`
    ).join("\n");

  // Per-proposal pages.
  for (const p of parsed) {
    const html = shell({
      headTitle: `${p.title} — TC39 proposal · ECMA-262 Restyled`,
      stage: p.stage,
      spec: p.spec,
      repo: p.repoUrl,
      sidebar: sidebarFor(p.name),
      mainHtml: `<h1 class="prop-title">${esc(p.title)}</h1>\n${
        note(p)
      }\n${p.main}`,
      toc: p.toc,
    });
    const dir = path.join(distDir, "proposals", p.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
  }

  // Index page.
  const byStage = {};
  for (const p of parsed) (byStage[p.stage] ||= []).push(p);
  const stages = Object.keys(byStage).sort((a, b) =>
    parseFloat(b) - parseFloat(a)
  );
  const indexMain = `<h1 class="prop-title">TC39 Proposals</h1>` +
    `<p class="es2-source-note"><strong>Unofficial restyling of active TC39 proposals.</strong> ` +
    `Snapshots rendered for reading; not normative. Source list: ` +
    `<a href="https://github.com/tc39/proposals">tc39/proposals</a>.</p>` +
    stages.map((st) =>
      `<h2 class="gl-letter">Stage ${esc(st)}</h2><ul class="prop-index">` +
      byStage[st].map((p) =>
        `<li><a href="/ecma262/proposals/${p.name}/">${esc(p.title)}</a> ` +
        `<a class="prop-index-src" href="${
          esc(p.spec)
        }" target="_blank" rel="noreferrer">spec ↗</a></li>`
      ).join("") + `</ul>`
    ).join("");
  const indexHtml = shell({
    headTitle: "TC39 Proposals · ECMA-262 Restyled",
    stage: "",
    spec: "",
    repo: "https://github.com/tc39/proposals",
    sidebar: sidebarFor(""),
    mainHtml: indexMain,
    toc: "",
  });
  fs.mkdirSync(path.join(distDir, "proposals"), { recursive: true });
  fs.writeFileSync(path.join(distDir, "proposals", "index.html"), indexHtml);

  return parsed.length;
}
