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
    console.log(`✓ ${p.name}: ${(html.length / 1024 | 0)} KB`);
    ok++;
  } catch (e) {
    console.error(`✗ ${p.name}: ${e.message}`);
  }
}
console.log(`fetched ${ok}/${list.length} proposal specs`);
