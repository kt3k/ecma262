// Fetch + vendor the published ecmarkup spec for each proposal in
// proposals/proposals.json into proposals/<name>/spec.html. Vendoring (rather
// than fetching at build time) keeps the build reproducible and offline, the
// same way the edition spec.html files are committed. Re-run to refresh.
//
//   deno run -A tools/fetch-proposals.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "proposals");
const list = JSON.parse(
  fs.readFileSync(path.join(dir, "proposals.json"), "utf8"),
);

let ok = 0;
for (const p of list) {
  try {
    const res = await fetch(p.spec, { redirect: "follow" });
    if (!res.ok) {
      console.error(`✗ ${p.name}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    fs.mkdirSync(path.join(dir, p.name), { recursive: true });
    fs.writeFileSync(path.join(dir, p.name, "spec.html"), html);

    // Vendor the relative images the spec references (figures live in img/),
    // resolved against the spec URL — build-proposals copies them next to the
    // page so the relative <img src> still resolves.
    const imgs = new Set(
      [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1])
        .filter((s) => !/^(https?:)?\/\//.test(s) && !s.startsWith("data:")),
    );
    let imgN = 0;
    for (const rel of imgs) {
      const r2 = await fetch(new URL(rel, p.spec).href);
      if (!r2.ok) continue;
      const dest = path.join(dir, p.name, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, new Uint8Array(await r2.arrayBuffer()));
      imgN++;
    }
    console.log(
      `✓ ${p.name}: ${(html.length / 1024 | 0)} KB${
        imgN ? ` + ${imgN} img` : ""
      }`,
    );
    ok++;
  } catch (e) {
    console.error(`✗ ${p.name}: ${e.message}`);
  }
}
console.log(`fetched ${ok}/${list.length} proposal specs`);
