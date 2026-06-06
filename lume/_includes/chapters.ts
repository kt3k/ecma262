// Sidebar chapter list for the edition currently being built. The data is
// generated per build by scripts/build-pages.ts (from build-chapters' _meta.js)
// into chapters.json — gitignored, regenerated for whatever EDITION is built —
// so the list always matches the rendered edition's actual chapters. This thin
// module just types and re-exports it.
//
// `slug` is the URL path segment; `title` is the sidebar label; `group` buckets
// annexes / back-matter for the thin dividers the sidebar draws between groups.
import data from "./chapters.json" with { type: "json" };

export interface Chapter {
  slug: string;
  title: string;
  group?: "annex" | "back";
}

const chapters = data as Chapter[];
export default chapters;
