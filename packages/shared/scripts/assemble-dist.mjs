// Build every edition into a single dist/ for GitHub Pages.
//
//   editions (draft, es20xx)  ->  built per edition with Lume, dist/<id>/
//   nextra-poc/ (vendored)    ->  dist/nextra-poc/ (Nextra comparison, prebuilt)
//   dist/index.html           <-  redirect to the editor's draft
//
// Each edition is (re)built here: run lume's pages/build/pagefind tasks with
// EDITION + BASE_PATH set, then copy lume/_site -> dist/<id>. The Nextra
// comparison site is no longer built in CI — its static export is vendored
// under nextra-poc/ (regenerate with `pnpm vendor:nextra`) and copied in
// verbatim. Paths resolve off the repo root.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { readEditions } from "./editions.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
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

// Nextra comparison site — not a listed edition; deployed at /nextra-poc/ from
// the vendored static export (built once with BASE_PATH=/ecma262/nextra-poc and
// committed under nextra-poc/, so CI doesn't need the Next.js toolchain).
const nextraVendored = path.join(root, "nextra-poc");
if (fs.existsSync(nextraVendored)) {
  fs.cpSync(nextraVendored, path.join(distDir, "nextra-poc"), {
    recursive: true,
  });
  console.log(
    "[assemble-dist] nextra-poc: vendored export -> dist/nextra-poc/",
  );
} else {
  console.log(
    "[assemble-dist] nextra-poc: no vendored export, skipping",
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

// Editorial styling for the top-level article pages (/about),
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
// tc39.es/ecma262/). Every edition, plus /about, stays reachable
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
  <p><strong>ECMA-262 Restyled</strong> is an unofficial, reader-focused rendering of the ECMAScript® Language Specification. It mirrors the source from the official <a href="https://github.com/tc39/ecma262">tc39/ecma262</a> repository and restyles it for readability; it is <strong>not normative</strong>. For the authoritative text, see the official specification at <a href="https://tc39.es/ecma262/">tc39.es/ecma262</a>. The source for this site is at <a href="https://github.com/kt3k/ecma262">kt3k/ecma262</a>.</p>`,
);

console.log(`[assemble-dist] assembled dist/ from ${editions.length} sites`);
