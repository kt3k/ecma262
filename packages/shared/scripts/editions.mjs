// The published editions, newest first, as the single source of truth shared by
// the combined landing page (assemble-dist), each Nextra site's footer/version
// switcher (via NEXT_PUBLIC_EDITIONS), and the Lume build
// (lume/_includes/editions.ts imports the same editions.json).
//
// All editions are rendered by the Lume build. The Nextra comparison build
// (site-draft-nextra, deployed at /draft-nextra) is intentionally NOT listed
// here — it's reachable by direct URL only.
import fs from "node:fs";
import path from "node:path";
import { readSpecSource } from "./spec-source.mjs";

export function readEditions(root) {
  const list = JSON.parse(
    fs.readFileSync(
      path.join(import.meta.dirname, "..", "editions.json"),
      "utf8",
    ),
  );
  return list.map((e) => ({
    ...e,
    source: readSpecSource(path.join(root, "ecma262", e.id)),
  }));
}
