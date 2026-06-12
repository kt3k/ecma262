// Check 5: navigation wiring.
//
// Static pass (fs, every page of every edition):
//   - the sidebar on every page lists exactly the edition's chapter pages,
//     in the same order as the edition index's sidebar;
//   - prev/next links chain the sidebar order (prev of sidebar[i] is
//     sidebar[i-1], next is sidebar[i+1], absent at the ends);
//   - the version switcher menu lists every edition that exists in dist
//     (plus nothing else), every href resolves, and the current item is
//     marked with aria-current and points at this edition's root.
//
// Browser pass (playwright, one representative chapter per edition — kept
// light per the OOM policy):
//   - mobile (375x667): #menu-toggle opens the sidebar (body.menu-open,
//     visible, aria-expanded) and closes it again;
//   - desktop: the version-switcher trigger shows/hides the menu, and
//     clicking another edition's item actually lands on that edition.
//
// Usage: node check-nav.mjs <distDir> <baseURL>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [distDir, baseURL] = process.argv.slice(2);
const basePath = new URL(baseURL).pathname.replace(/\/$/, ""); // e.g. /ecma262

const problems = [];
const bad = (page, why) => problems.push({ page, why });

const editions = fs.readdirSync(distDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !["about", "nextra-poc"].includes(e.name))
  .map((e) => e.name)
  .sort();

// Chapter links inside <aside id="sidebar">. The active chapter's <li>
// nests an <ol> of in-page section anchors, so a lazy …*?</ol> match would
// stop at the nested close — take the whole aside and keep only the
// fragment-less page links.
const sidebarOf = (html) => {
  const m = html.match(/<aside id="sidebar"[\s\S]*?<\/aside>/);
  if (!m) return null;
  return [...m[0].matchAll(/<a href="([^"#]+)"/g)].map((x) => x[1])
    .filter((h) => h.startsWith(basePath + "/"));
};
const switcherOf = (html) => {
  const m = html.match(
    /<ul id="version-switcher-menu"[^>]*>([\s\S]*?)<\/ul>/,
  );
  if (!m) return null;
  return [...m[1].matchAll(/<a ([^>]*)href="([^"]+)"([^>]*)>/g)].map((x) => ({
    href: x[2],
    current: /aria-current="page"/.test(x[1] + x[3]),
  }));
};
const linkOf = (html, cls) =>
  html.match(new RegExp(`<a class="prev-next-link ${cls}" href="([^"]+)"`))
    ?.[1];

// --- static pass ---
let pagesChecked = 0;
for (const ed of editions) {
  const edDir = path.join(distDir, ed);
  const chapters = fs.readdirSync(edDir, { withFileTypes: true })
    .filter((e) =>
      e.isDirectory() && !["img", "pagefind"].includes(e.name) &&
      fs.existsSync(path.join(edDir, e.name, "index.html"))
    )
    .map((e) => `${basePath}/${ed}/${e.name}/`);
  const indexHtml = fs.readFileSync(path.join(edDir, "index.html"), "utf8");
  const order = sidebarOf(indexHtml);
  if (!order) {
    bad(`/${ed}/`, "no sidebar-list on the edition index");
    continue;
  }
  // sidebar covers exactly the chapter pages (+ the edition root itself)
  const expected = new Set([`${basePath}/${ed}/`, ...chapters]);
  for (const href of order) {
    if (!expected.has(href)) {
      bad(`/${ed}/`, `sidebar link has no page: ${href}`);
    }
  }
  const inSidebar = new Set(order);
  for (const href of expected) {
    if (!inSidebar.has(href)) {
      bad(`/${ed}/`, `page missing from sidebar: ${href}`);
    }
  }
  if (new Set(order).size !== order.length) {
    bad(`/${ed}/`, "duplicate sidebar entries");
  }

  // every page: same sidebar, correct prev/next, sane version switcher
  for (let i = 0; i < order.length; i++) {
    const rel = order[i].slice(basePath.length);
    const file = path.join(distDir, rel.slice(1), "index.html");
    if (!fs.existsSync(file)) continue; // already reported above
    const html = fs.readFileSync(file, "utf8");
    pagesChecked++;

    const sb = sidebarOf(html);
    if (!sb || sb.join("\n") !== order.join("\n")) {
      bad(rel, "sidebar differs from the edition index's sidebar");
    }

    const prev = linkOf(html, "prev-link");
    const next = linkOf(html, "next-link");
    const wantPrev = i > 0 ? order[i - 1] : undefined;
    const wantNext = i < order.length - 1 ? order[i + 1] : undefined;
    if (prev !== wantPrev) {
      bad(
        rel,
        `prev-link is ${prev ?? "absent"}, expected ${wantPrev ?? "absent"}`,
      );
    }
    if (next !== wantNext) {
      bad(
        rel,
        `next-link is ${next ?? "absent"}, expected ${wantNext ?? "absent"}`,
      );
    }

    const vs = switcherOf(html);
    if (!vs) {
      bad(rel, "no version-switcher menu");
      continue;
    }
    const vsEditions = vs.map((v) =>
      v.href.startsWith(basePath + "/")
        ? v.href.slice(basePath.length + 1).replace(/\/$/, "")
        : v.href
    );
    const missing = editions.filter((e) => !vsEditions.includes(e));
    const unknown = vsEditions.filter((e) => !editions.includes(e));
    if (missing.length) {
      bad(rel, `switcher missing editions: ${missing.join(", ")}`);
    }
    if (unknown.length) {
      bad(rel, `switcher has unknown entries: ${unknown.join(", ")}`);
    }
    const cur = vs.filter((v) => v.current);
    if (cur.length !== 1 || cur[0]?.href !== `${basePath}/${ed}/`) {
      bad(
        rel,
        `switcher current item is ${
          cur.map((c) => c.href).join("+") || "absent"
        }, expected ${basePath}/${ed}/`,
      );
    }
  }
}
console.error(
  `static: ${pagesChecked} pages over ${editions.length} editions checked`,
);

// --- browser pass: one chapter page per edition ---
const browser = await chromium.launch();
for (const ed of editions) {
  const edDir = path.join(distDir, ed);
  const chapter = fs.readdirSync(edDir, { withFileTypes: true })
    .find((e) =>
      e.isDirectory() && !["img", "pagefind"].includes(e.name) &&
      fs.existsSync(path.join(edDir, e.name, "index.html"))
    )?.name;
  if (!chapter) continue;
  const rel = `/${ed}/${chapter}/`;
  const url = `${baseURL}${rel}`;

  // mobile hamburger
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    const state = () =>
      page.evaluate(() => {
        const sb = document.getElementById("sidebar");
        const r = sb.getBoundingClientRect();
        return {
          open: document.body.classList.contains("menu-open"),
          // off-canvas hiding slides the panel up (translateY(-100%)), so
          // require overlap with the viewport on both axes
          visible: r.width > 0 && r.right > 0 && r.left < innerWidth &&
            r.bottom > 0 && r.top < innerHeight &&
            getComputedStyle(sb).visibility !== "hidden",
          expanded: document.getElementById("menu-toggle")
            ?.getAttribute("aria-expanded"),
        };
      });
    const closed = await state();
    if (closed.visible) bad(rel, "mobile sidebar visible before opening");
    await page.click("#menu-toggle");
    await page.waitForTimeout(300);
    const opened = await state();
    if (!opened.open || !opened.visible || opened.expanded !== "true") {
      bad(rel, `hamburger open failed: ${JSON.stringify(opened)}`);
    }
    await page.click("#menu-toggle");
    await page.waitForTimeout(300);
    const reclosed = await state();
    if (reclosed.open || reclosed.visible) {
      bad(rel, `hamburger close failed: ${JSON.stringify(reclosed)}`);
    }
    await ctx.close();
  }

  // desktop version switcher open/close
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    const menuVisible = () =>
      page.evaluate(() => {
        const m = document.getElementById("version-switcher-menu");
        return m && !m.classList.contains("ecma-vs-hidden") &&
          m.getBoundingClientRect().height > 0;
      });
    if (await menuVisible()) bad(rel, "switcher menu visible before opening");
    await page.click("#version-switcher-trigger");
    await page.waitForTimeout(150);
    if (!(await menuVisible())) bad(rel, "switcher trigger did not open menu");
    await page.click("#version-switcher-trigger");
    await page.waitForTimeout(150);
    if (await menuVisible()) bad(rel, "switcher trigger did not close menu");
    await ctx.close();
  }
}

// one real switcher navigation: draft -> es2026
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(`${baseURL}/draft/`, { waitUntil: "load", timeout: 60000 });
  await page.click("#version-switcher-trigger");
  await page.click('#version-switcher-menu a[href$="/es2026/"]');
  await page.waitForURL("**/es2026/", { timeout: 15000 }).catch(() => {});
  const landed = new URL(page.url()).pathname;
  if (landed !== `${basePath}/es2026/`) {
    bad(
      "/draft/",
      `switcher navigation landed on ${landed}, expected ${basePath}/es2026/`,
    );
  }
  await ctx.close();
}
await browser.close();

console.log(`\nnav check: ${problems.length} problems`);
for (const p of problems.slice(0, 60)) console.log(`  ${p.page} — ${p.why}`);
fs.writeFileSync(
  "/tmp/pwtest/nav-report.json",
  JSON.stringify(problems, null, 2),
);
