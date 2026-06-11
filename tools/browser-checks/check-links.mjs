// Check 1: anchor / internal-link integrity, full sweep.
//
// Pass 1 — load every page, collect (a) every element id / <a name> on the
// page, (b) every <a href>.
// Pass 2 — validate in memory: internal page targets must exist; fragment
// targets must exist on the destination page (same-page or cross-page).
//
// Usage: node check-links.mjs <distDir> <baseURL>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [distDir, baseURL] = process.argv.slice(2);
const base = new URL(baseURL); // e.g. http://localhost:8907/ecma262
const basePath = base.pathname.replace(/\/$/, ""); // /ecma262

// Enumerate pages: dist/<...>/index.html -> /<...>/
const pages = [];
const walk = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "nextra-poc" || e.name === "pagefind") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, `${rel}${e.name}/`);
    else if (e.name === "index.html") pages.push(rel);
  }
};
walk(distDir, "/");
const pageSet = new Set(pages);

const ids = new Map(); // pageRel -> Set(ids)
const links = new Map(); // href(abs URL string) -> [sourcePage, ...]

const browser = await chromium.launch();
let next = 0;
const worker = async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  while (next < pages.length) {
    const rel = pages[next++];
    await page.goto(base.origin + basePath + rel, { waitUntil: "load" });
    const data = await page.evaluate(() => ({
      ids: [
        ...new Set([
          ...[...document.querySelectorAll("[id]")].map((e) => e.id),
          ...[...document.querySelectorAll("a[name]")].map((e) =>
            e.getAttribute("name")
          ),
        ]),
      ],
      hrefs: [...document.querySelectorAll("a[href]")].map((a) => a.href),
    }));
    ids.set(rel, new Set(data.ids));
    for (const h of data.hrefs) {
      if (!links.has(h)) links.set(h, []);
      const src = links.get(h);
      if (src.length < 3) src.push(rel);
    }
    if (next % 100 === 0) console.error(`...collected ${next}/${pages.length}`);
  }
  await ctx.close();
};
await Promise.all(Array.from({ length: 6 }, worker));
await browser.close();

// Pass 2 — validate.
const problems = [];
let internal = 0, external = 0;
for (const [href, sources] of links) {
  const u = new URL(href);
  if (u.origin !== base.origin) {
    external++;
    continue;
  }
  internal++;
  if (!u.pathname.startsWith(basePath + "/") && u.pathname !== basePath) {
    problems.push({ href, sources, why: "outside base path" });
    continue;
  }
  let rel = u.pathname.slice(basePath.length);
  if (rel === "") rel = "/";
  if (rel.startsWith("/nextra-poc")) continue; // vendored comparison site
  // file target (images, pdf, …) — check on disk
  if (!rel.endsWith("/")) {
    if (fs.existsSync(path.join(distDir, rel))) {
      if (fs.statSync(path.join(distDir, rel)).isFile()) continue;
      rel += "/"; // a directory link without trailing slash
    } else {
      problems.push({ href, sources, why: "missing file" });
      continue;
    }
  }
  if (!pageSet.has(rel)) {
    problems.push({ href, sources, why: "missing page" });
    continue;
  }
  if (u.hash) {
    let frag = u.hash.slice(1);
    try {
      frag = decodeURIComponent(frag);
    } catch { /* raw %-sequence in the id itself — match it verbatim */ }
    if (!ids.get(rel)?.has(frag)) {
      problems.push({ href, sources, why: `missing fragment on ${rel}` });
    }
  }
}

console.log(
  `\n${pages.length} pages, ${links.size} unique links ` +
    `(${internal} internal, ${external} external), ${problems.length} broken`,
);
for (const p of problems.slice(0, 80)) {
  console.log(`\n${p.href}\n  why: ${p.why}\n  from: ${p.sources.join(", ")}`);
}
fs.writeFileSync(
  "/tmp/pwtest/link-report.json",
  JSON.stringify(problems, null, 2),
);
