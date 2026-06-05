// Discover every published edition from packages/site-*, newest first
// (draft on top, then descending version id). Single source of truth shared by
// the combined landing page (assemble-dist) and each site's footer.
import fs from "node:fs";
import path from "node:path";
import { readSpecSource } from "./spec-source.mjs";

// The display name lives in each site's app/layout.jsx (`const siteTitle = ...`)
// so titles never drift from the per-site navbar/<title>.
function readSiteTitle(siteDir, fallback) {
  const layout = fs.readFileSync(path.join(siteDir, "app/layout.jsx"), "utf8");
  const m = layout.match(/const siteTitle = ["']([^"']*)["']/);
  return m ? m[1] : fallback;
}

export function readEditions(root) {
  const packagesDir = path.join(root, "packages");
  const editions = fs
    .readdirSync(packagesDir)
    .filter((name) => name.startsWith("site-"))
    .map((name) => {
      const id = name.slice("site-".length);
      return {
        id,
        title: readSiteTitle(path.join(packagesDir, name), id),
        source: readSpecSource(path.join(root, "ecma262", id)),
      };
    });

  // The `draft` edition is rendered by the Lume build (lume-poc), not a
  // packages/site-* app, so it isn't discovered above. Inject it (unless a
  // packages/site-draft re-appears) so the landing redirect, version switcher
  // and footer still list it. assemble-dist copies lume-poc/_site -> dist/draft.
  if (!editions.some((e) => e.id === "draft")) {
    editions.push({
      id: "draft",
      title: "ECMA-262, 18th, ES2027 draft",
      source: readSpecSource(path.join(root, "ecma262", "draft")),
    });
  }

  editions.sort((a, b) => {
    if (a.id === "draft") return -1;
    if (b.id === "draft") return 1;
    return b.id.localeCompare(a.id);
  });

  return editions;
}
