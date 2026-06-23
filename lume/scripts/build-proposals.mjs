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

// Scan the built draft edition for: fragment -> slug (xref rewriting) and
// slug -> { num, title } of that page's chapter (its top clause), used to map a
// proposal's clauses back to the host ECMA-262 chapter they belong to.
function scanDraft(distDir) {
  const fragMap = Object.create(null);
  const chapBySlug = Object.create(null);
  const draft = path.join(distDir, "draft");
  if (!fs.existsSync(draft)) return { fragMap, chapBySlug };
  for (const e of fs.readdirSync(draft, { withFileTypes: true })) {
    if (!e.isDirectory() || ["img", "fonts", "pagefind"].includes(e.name)) {
      continue;
    }
    const f = path.join(draft, e.name, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    for (const m of html.matchAll(/\sid="([^"]+)"/g)) {
      if (!(m[1] in fragMap)) fragMap[m[1]] = e.name;
    }
    const m = html.match(
      /<emu-(?:clause|annex|intro)\b[^>]*>\s*(?:<div class="attributes-tag">[\s\S]*?<\/div>\s*)?<h1>([\s\S]*?)<\/h1>/,
    );
    if (m) {
      const sm = m[1].match(/<span class="secnum">([\s\S]*?)<\/span>/);
      const num = sm ? strip(sm[1]) : "";
      const title = strip(
        m[1].replace(/<span class="secnum">[\s\S]*?<\/span>/, ""),
      );
      if (num) chapBySlug[e.name] = { num, title };
    }
  }
  return { fragMap, chapBySlug };
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

  // Section outline from clause openers (used for both the left sidebar and the
  // right-rail TOC).
  const sections = [];
  const clauseRe =
    /<emu-clause\b[^>]*\bid="([^"]+)"[^>]*?(?:\bnumber="([^"]*)")?[^>]*>\s*<h1\b[^>]*>([\s\S]*?)<\/h1>/g;
  let c;
  while ((c = clauseRe.exec(body)) !== null) {
    const id = c[1];
    // The section number is what's shown in the heading (.secnum), which is
    // reliable regardless of the clause's attribute order.
    const sm = c[3].match(/<span class="secnum">([\s\S]*?)<\/span>/);
    const num = sm ? strip(sm[1]) : (c[2] || "");
    let t = c[3].replace(/<span class="secnum">[\s\S]*?<\/span>/, "");
    t = strip(t.replace(/<a class="heading-anchor"[\s\S]*?<\/a>/, ""));
    sections.push({ id, num, t, depth: num ? num.split(".").length : 1 });
  }
  const minD = Math.min(...sections.map((x) => x.depth), 1);
  for (const s of sections) s.level = Math.min(4, s.depth - minD + 1);

  return { title, main: body, sections };
}

// Render a section outline as <li data-level> items (shared by the sidebar and
// the right-rail TOC; both link to the in-page anchors).
const sectionItems = (sections) =>
  sections.map((s) =>
    `<li data-level="${s.level}"><a href="#${esc(s.id)}">${
      s.num ? esc(s.num) + " " : ""
    }${esc(s.t)}</a></li>`
  ).join("");

function shell(
  {
    headTitle,
    titleText,
    titleHref,
    stageNum,
    switcher,
    repo,
    sidebar,
    mainHtml,
    toc,
  },
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
<span class="site-title-group"><a class="site-title" href="${titleHref}"><b>${
    esc(titleText)
  }</b></a>${
    stageNum
      ? `<span class="prop-stage" title="Stage ${esc(stageNum)}">${
        esc(stageNum)
      }</span>`
      : ""
  }${switcher || ""}</span>
<button id="menu-toggle" class="menu-toggle" type="button" aria-label="Open navigation menu" aria-controls="sidebar" aria-expanded="false">
<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><g><path d="M4 6h16"></path></g><path d="M4 12h16"></path><g><path d="M4 18h16"></path></g></svg>
</button>
</nav>
</header>
<div class="layout-wrapper">
<aside id="sidebar" class="sidebar" aria-label="Contents">
<ol class="sidebar-list">${sidebar}</ol>
<div class="sidebar-footer">
<button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle dark mode">
<svg class="icon-sun" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>
<svg class="icon-moon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
<span class="theme-toggle-label"><span class="label-light">Light</span><span class="label-dark">Dark</span></span>
</button>
<button id="sidebar-collapse" class="sidebar-collapse-btn" type="button" aria-controls="sidebar" aria-expanded="true" title="Collapse sidebar">
<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path class="collapse-arrow" d="M11.823 8.177L9.427 10.573A.25.25 0 019 10.396V5.604a.25.25 0 01.427-.177l2.396 2.396a.25.25 0 010 .354z"></path><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75zM1.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25H5.5v-13H1.75zM7 1.5v13h7.25a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H7z"></path></svg>
</button>
</div>
</aside>
<main id="content" data-pagefind-body="true">
<div class="ecma-spec">
${mainHtml}
</div>
</main>
<aside class="toc toc-proposal" aria-label="On this page">
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
<script>
(function(){
  var b=document.getElementById("menu-toggle");
  if(!b)return;
  function set(o){document.body.classList.toggle("menu-open",o);document.documentElement.classList.toggle("menu-open",o);b.setAttribute("aria-expanded",o?"true":"false");}
  b.addEventListener("click",function(){set(!document.body.classList.contains("menu-open"));});
  matchMedia("(max-width: 767px)").addEventListener("change",function(e){if(!e.matches)set(false);});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false);});
  document.querySelectorAll("#sidebar a").forEach(function(a){a.addEventListener("click",function(){set(false);});});
})();
(function(){
  var root=document.getElementById("proposal-switcher");
  var t=document.getElementById("proposal-switcher-trigger");
  var m=document.getElementById("proposal-switcher-menu");
  if(!root||!t||!m)return;
  function set(o){m.classList.toggle("ecma-vs-hidden",!o);t.setAttribute("aria-expanded",o?"true":"false");}
  t.addEventListener("click",function(e){e.stopPropagation();set(m.classList.contains("ecma-vs-hidden"));});
  document.addEventListener("mousedown",function(e){if(!root.contains(e.target))set(false);});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false);});
})();
(function(){
  document.querySelectorAll(".theme-toggle").forEach(function(btn){
    btn.addEventListener("click",function(){
      var d=document.documentElement.classList.toggle("dark");
      try{localStorage.setItem("theme",d?"dark":"light");}catch(_){}
    });
  });
  var cb=document.getElementById("sidebar-collapse");
  if(cb){
    function setC(c){
      document.body.classList.toggle("sidebar-collapsed",c);
      cb.setAttribute("aria-expanded",c?"false":"true");
      cb.setAttribute("title",c?"Expand sidebar":"Collapse sidebar");
    }
    try{if(localStorage.getItem("sidebar")==="collapsed")setC(true);}catch(_){}
    cb.addEventListener("click",function(){
      var c=!document.body.classList.contains("sidebar-collapsed");
      setC(c);
      try{localStorage.setItem("sidebar",c?"collapsed":"open");}catch(_){}
    });
  }
})();
</script>
</body>
</html>`;
}

export function buildProposals(distDir, rootDir) {
  const pdir = path.join(rootDir, "proposals");
  const listFile = path.join(pdir, "proposals.json");
  if (!fs.existsSync(listFile)) return 0;
  const list = JSON.parse(fs.readFileSync(listFile, "utf8"));
  const { fragMap, chapBySlug } = scanDraft(distDir);

  // The host ECMA-262 chapters a proposal touches: map each clause id back to
  // its draft page's chapter (so the left nav is a subset of the edition's
  // chapter list, with correct host numbers even when the proposal renumbers
  // locally). Anchor = the first proposal clause in that chapter. Falls back to
  // the proposal's own top-level clauses for pure additions (new ids).
  const chapterNav = (sections) => {
    const seen = new Map();
    for (const s of sections) {
      const slug = fragMap[s.id];
      const ch = slug && chapBySlug[slug];
      if (ch && !seen.has(ch.num)) {
        seen.set(ch.num, { num: ch.num, title: ch.title, anchor: s.id });
      }
    }
    let items = [...seen.values()];
    if (items.length) {
      items.sort((a, b) =>
        (parseFloat(a.num) || 1e9) - (parseFloat(b.num) || 1e9)
      );
    } else {
      // pure addition — list the proposal's own top-level clauses
      items = sections.filter((s) => s.level === 1).map((s) => ({
        num: s.num,
        title: s.t,
        anchor: s.id,
      }));
    }
    return items.map((c) =>
      `<li><a href="#${esc(c.anchor)}">${c.num ? esc(c.num) + " " : ""}${
        esc(c.title)
      }</a></li>`
    ).join("");
  };

  // Parse every proposal that has a vendored spec. The deploy slug mirrors the
  // official URL / repo name (proposal-<name>), so a page lives at
  // /ecma262/proposal-<name>/ alongside the editions.
  const parsed = [];
  for (const p of list) {
    const f = path.join(pdir, p.name, "spec.html");
    if (!fs.existsSync(f)) continue;
    const info = parseSpec(fs.readFileSync(f, "utf8"), fragMap);
    parsed.push({
      ...p,
      ...info,
      slug: p.repo.split("/").pop(),
      repoUrl: `https://github.com/${p.repo}`,
    });
  }

  // Proposal selector dropdown (same DOM shape as the editions' version
  // switcher, so the .ecma-vs-* CSS applies; opened by the inline handler).
  const selectorIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9l4 -4l4 4"></path><path d="M16 15l-4 4l-4 -4"></path></svg>';
  const switcher = (cur) =>
    `<span class="ecma-vs" id="proposal-switcher">` +
    `<button id="proposal-switcher-trigger" type="button" class="ecma-vs-trigger" aria-label="Switch proposal" aria-haspopup="menu" aria-expanded="false">${selectorIcon}</button>` +
    `<ul id="proposal-switcher-menu" class="ecma-vs-menu ecma-vs-hidden" role="menu">` +
    parsed.map((p) =>
      `<li role="none"><a role="menuitem" href="/ecma262/${p.slug}/"${
        p.slug === cur ? ' aria-current="page"' : ""
      } class="ecma-vs-item${p.slug === cur ? " ecma-vs-current" : ""}"><span>${
        esc(p.title)
      }</span><span class="prop-stage" title="Stage ${esc(p.stage)}">${
        esc(p.stage)
      }</span></a></li>`
    ).join("") +
    `</ul></span>`;

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

  // Footer nav for a proposal's sidebar — links out, but never lists the other
  // proposals (the left nav is this proposal's own sections only).
  const navFooter =
    `<li class="group-start"><a href="/ecma262/proposals/">← All proposals</a></li>` +
    `<li><a href="${A}/">← ECMA-262 draft</a></li>`;

  // Per-proposal pages: left sidebar = this proposal's section outline.
  for (const p of parsed) {
    const html = shell({
      headTitle: `${p.title} — TC39 proposal · ECMA-262 Restyled`,
      titleText: p.title,
      titleHref: `/ecma262/${p.slug}/`,
      stageNum: p.stage,
      switcher: switcher(p.slug),
      repo: p.repoUrl,
      sidebar: chapterNav(p.sections) + navFooter,
      mainHtml: `<h1 class="prop-title">${esc(p.title)}</h1>\n${
        note(p)
      }\n${p.main}`,
      toc: sectionItems(p.sections),
    });
    const dir = path.join(distDir, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
    // Copy the proposal's vendored figures so the relative <img src="img/…">
    // resolves under /ecma262/<slug>/.
    const imgDir = path.join(pdir, p.name, "img");
    if (fs.existsSync(imgDir)) {
      fs.cpSync(imgDir, path.join(dir, "img"), { recursive: true });
    }
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
        `<li><a href="/ecma262/${p.slug}/">${esc(p.title)}</a> ` +
        `<a class="prop-index-src" href="${
          esc(p.spec)
        }" target="_blank" rel="noreferrer">spec ↗</a></li>`
      ).join("") + `</ul>`
    ).join("");
  // The index is the hub, so its sidebar *does* list the proposals.
  const indexSidebar =
    parsed.map((p) =>
      `<li><a href="/ecma262/${p.slug}/">${esc(p.title)}</a></li>`
    ).join("") +
    `<li class="group-start"><a href="${A}/">← ECMA-262 draft</a></li>`;
  const indexHtml = shell({
    headTitle: "TC39 Proposals · ECMA-262 Restyled",
    titleText: "TC39 Proposals",
    titleHref: "/ecma262/proposals/",
    stageNum: "",
    switcher: switcher(""),
    repo: "https://github.com/tc39/proposals",
    sidebar: indexSidebar,
    mainHtml: indexMain,
    toc: "",
  });
  fs.mkdirSync(path.join(distDir, "proposals"), { recursive: true });
  fs.writeFileSync(path.join(distDir, "proposals", "index.html"), indexHtml);

  return parsed.length;
}
