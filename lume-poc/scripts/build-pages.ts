// Generate one Lume MDX page per ECMA-262 chapter from the draft spec.
//
// build-chapters.mjs already emits, for every chapter, a `<Sec>` component
// (lib/spec/<slug>.jsx) and a skeleton MDX page (content/<slug>.mdx) wired for
// the Next.js/Nextra build. This script runs that generator into a scratch dir
// and adapts each chapter to this Lume PoC:
//   • copy the <Sec> component into lume-poc/lib/<slug>.jsx
//   • rewrite the MDX import path ('../lib/spec/x' → './lib/x.jsx')
//   • prepend Lume front matter (title/layout/url/slug) and write
//     lume-poc/<slug>.mdx
//
// So the SAME conversion that produced notational-conventions now produces
// every other chapter too. Run with `deno task pages`.

const lumeRoot = new URL("../", import.meta.url).pathname; // lume-poc/
const repoRoot = new URL("../../", import.meta.url).pathname; // repo root

// Base path the pages deploy under. Empty for local dev (localhost serves at
// /); CI sets BASE_PATH=/ecma262/draft so build-chapters prefixes every
// cross-page href accordingly (matching page.tsx's asset/nav base path).
const basePath = Deno.env.get("BASE_PATH") ?? "";

const scratch = await Deno.makeTempDir({ prefix: "lume-pages-" });
const buildChapters = `${repoRoot}packages/shared/scripts/build-chapters.mjs`;

console.log("• running build-chapters.mjs …");
const run = new Deno.Command("node", {
  args: [
    buildChapters,
    "--input",
    `${repoRoot}ecma262/draft/spec.html`,
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
// Grammar"). Emitted by build-chapters alongside the MDX.
const meta: Record<string, string> =
  (await import(`file://${scratch}/content/_meta.js`)).default;

// 1. Copy every <Sec> component into lume-poc/lib/.
await Deno.mkdir(`${lumeRoot}lib`, { recursive: true });
let libCount = 0;
for await (const entry of Deno.readDir(`${scratch}/lib`)) {
  if (!entry.isFile || !entry.name.endsWith(".jsx")) continue;
  await Deno.copyFile(
    `${scratch}/lib/${entry.name}`,
    `${lumeRoot}lib/${entry.name}`,
  );
  libCount++;
}

// 2. Turn each scratch content/<slug>.mdx into a Lume page in lume-poc/.
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
}

await Deno.remove(scratch, { recursive: true });
console.log(`✓ wrote ${pageCount} pages and ${libCount} <Sec> components`);
