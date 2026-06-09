// Generate the Lume pages for one ECMA-262 edition from its spec source.
//
// build-chapters.mjs emits, for every chapter, a `<Sec>` component
// (lib/spec/<slug>.jsx) and a skeleton MDX page (content/<slug>.mdx) wired for
// the Next.js/Nextra build. This script runs that generator into a scratch dir
// and adapts each chapter to this Lume site:
//   • copy the <Sec> component into lume/lib/<slug>.jsx
//   • rewrite the MDX import path ('../lib/spec/x' → './lib/x.jsx')
//   • prepend Lume front matter (title/layout/url/slug) and write lume/<slug>.mdx
//   • emit the sidebar chapter list to _includes/chapters.json
//   • copy spec figures into lume/img/
//
// All output is regenerated (and gitignored) per build, so the same conversion
// targets any edition. Driven by env:
//   EDITION    which ecma262/<id>/spec.html to render (default "draft")
//   BASE_PATH  deploy prefix, e.g. /ecma262/es2026 (default "" for local dev)
// Run with `deno task pages`.

const lumeRoot = new URL("../", import.meta.url).pathname; // lume/
const repoRoot = new URL("../../", import.meta.url).pathname; // repo root

const edition = Deno.env.get("EDITION") ?? "draft";
const basePath = Deno.env.get("BASE_PATH") ?? "";

const scratch = await Deno.makeTempDir({ prefix: "lume-pages-" });
// ES5.1, ES3 and ES2 predate ecmarkup: their spec.html is already-rendered HTML,
// so each goes through its own re-skin ingester instead of the ecmarkup resolver
// (ES5.1 = official ECMA HTML, ES3 = the bclary HTML, ES2 = a Marker conversion
// of the PDF). See docs/es5.1-plan.md, docs/es3-plan.md, docs/es2-plan.md. Other
// editions use the standard generator.
const buildChapters = edition === "es3"
  ? `${repoRoot}src/build-chapters-es3.mjs`
  : edition === "es5.1"
  ? `${repoRoot}src/build-chapters-es51.mjs`
  : edition === "es2"
  ? `${repoRoot}src/build-chapters-es2.mjs`
  : `${repoRoot}src/build-chapters.mjs`;

console.log(`• building edition "${edition}" (base "${basePath || "/"}")`);
const run = new Deno.Command("deno", {
  args: [
    "run",
    "-A",
    // Use the repo-root config so build-chapters.mjs resolves its bare
    // "highlight.js" import via the root deno.json import map (the spawn
    // inherits lume/ as cwd, whose deno.json doesn't declare it).
    "--config",
    `${repoRoot}deno.json`,
    buildChapters,
    "--input",
    `${repoRoot}ecma262/${edition}/spec.html`,
    "--lib-dir",
    `${scratch}/lib`,
    "--content-dir",
    `${scratch}/content`,
    "--public-img-dir",
    `${scratch}/img`,
    "--base-path",
    basePath,
  ],
  stdout: "inherit",
  stderr: "inherit",
});
const { success } = await run.output();
if (!success) {
  console.error("build-chapters.mjs failed");
  Deno.exit(1);
}

// Chapter slug → sidebar/page title (e.g. "12 ECMAScript Language: Lexical
// Grammar"), in document order. Emitted by build-chapters alongside the MDX.
const meta: Record<string, string> =
  (await import(`file://${scratch}/content/_meta.js`)).default;

// Clear last edition's generated output so a chapter that doesn't exist in this
// edition doesn't linger.
for (const dir of ["lib", "img"]) {
  await Deno.remove(`${lumeRoot}${dir}`, { recursive: true }).catch(() => {});
  await Deno.mkdir(`${lumeRoot}${dir}`, { recursive: true });
}
for await (const entry of Deno.readDir(lumeRoot)) {
  if (entry.isFile && entry.name.endsWith(".mdx")) {
    await Deno.remove(`${lumeRoot}${entry.name}`);
  }
}

// 1. Copy every <Sec> component into lume/lib/.
let libCount = 0;
for await (const entry of Deno.readDir(`${scratch}/lib`)) {
  if (!entry.isFile || !entry.name.endsWith(".jsx")) continue;
  await Deno.copyFile(
    `${scratch}/lib/${entry.name}`,
    `${lumeRoot}lib/${entry.name}`,
  );
  libCount++;
}

// 2. Copy spec figures into lume/img/ (served as a static dir by _config.ts).
let imgCount = 0;
try {
  for await (const entry of Deno.readDir(`${scratch}/img`)) {
    if (!entry.isFile) continue;
    await Deno.copyFile(
      `${scratch}/img/${entry.name}`,
      `${lumeRoot}img/${entry.name}`,
    );
    imgCount++;
  }
} catch { /* no img dir for this edition */ }

// 3. Turn each scratch content/<slug>.mdx into a Lume page in lume/, and build
//    the sidebar chapter list (slug, title, optional annex/back group bucket).
const chapters: { slug: string; title: string; group?: "annex" | "back" }[] =
  [];
let pageCount = 0;
for (const [slug, title] of Object.entries(meta)) {
  const srcPath = `${scratch}/content/${slug}.mdx`;
  let body: string;
  try {
    body = await Deno.readTextFile(srcPath);
  } catch {
    console.warn(`  ! no content for ${slug}, skipping`);
    continue;
  }
  // Nextra import path → local ./lib/<slug>.jsx (Lume resolves the extension).
  body = body.replace(
    /from '\.\.\/lib\/spec\/([^']+)'/,
    "from './lib/$1.jsx'",
  );
  // The introduction is the site root; every other chapter is /<slug>/.
  const url = slug === "index" ? "/" : `/${slug}/`;
  const frontMatter = [
    "---",
    `title: ${JSON.stringify(title)}`,
    "layout: page.tsx",
    `url: ${url}`,
    `slug: ${slug}`,
    "---",
    "",
    "",
  ].join("\n");
  await Deno.writeTextFile(`${lumeRoot}${slug}.mdx`, frontMatter + body);
  pageCount++;

  const group = /^Annex [A-Z]/.test(title)
    ? "annex"
    : (title === "Bibliography" || title === "Colophon")
    ? "back"
    : undefined;
  chapters.push(group ? { slug, title, group } : { slug, title });
}

// 4. Emit the chapter list the sidebar / prev-next read (via chapters.ts).
await Deno.writeTextFile(
  `${lumeRoot}_includes/chapters.json`,
  JSON.stringify(chapters, null, 2) + "\n",
);

await Deno.remove(scratch, { recursive: true });
console.log(
  `✓ ${edition}: ${pageCount} pages, ${libCount} components, ${imgCount} images`,
);
