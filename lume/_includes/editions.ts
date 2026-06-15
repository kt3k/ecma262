// Edition list for the footer + version switcher, from the shared single source
// of truth that assemble-dist also reads (newest first).
import data from "../editions.json" with { type: "json" };

export interface Edition {
  id: string;
  title: string;
}

const editions = data as Edition[];

// The edition this build renders, from the EDITION env var (default "draft").
// scripts/build-pages.ts reads the same var to pick the spec source, so the
// chrome (header / <title> / VersionSwitcher) and the content stay in sync.
// In the former Nextra sites each edition fixed its own title in its layout;
// here one env var drives it.
export const currentEditionId = Deno.env.get("EDITION") ?? "draft";

// Whether this edition ships the generated /glossary/ page. The pre-2016
// editions come from different source pipelines (PDF / bclary ingest) whose
// <dfn> markup is sparse or absent, so the glossary is built only for the
// ecmarkup-sourced editions: ES2016 onward, plus the draft.
export const hasGlossary = currentEditionId === "draft" ||
  /^es20(1[6-9]|2\d)$/.test(currentEditionId);

// Header title parts: bold main string + dotted-underline status link
// ("draft" / "candidate"). Matches the parsing the former Nextra spec-layout
// used so the visual hierarchy is identical.
const current = editions.find((e) => e.id === currentEditionId)!;
const qualMatch = current.title.match(/\s+\(?(draft|candidate)\)?$/i);
export const titleMain = qualMatch
  ? current.title.slice(0, qualMatch.index).trimEnd()
  : current.title;
export const titleQual = qualMatch ? qualMatch[1] : "";

// Where the "draft" / "candidate" badge links to. Nextra wires this to the
// exact tc39/ecma262 commit via NEXT_PUBLIC_SPEC_COMMIT_URL; for the PoC we
// fall back to the repo root.
export const specCommitUrl = "https://github.com/tc39/ecma262";

export default editions;
