// Resolve the upstream tc39/ecma262 commit an edition was built from, so both
// the per-site navbar and the combined landing page can link to it.
//
//   - draft: a git submodule -> read its checked-out HEAD (moving target)
//   - vendored-from-tag editions: a plain dir -> read ecma262/<id>/source.json
//
// Returns { commit, short, url } or null when the source is unknown.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function readSpecSource(specDir) {
  let commit = null;

  if (fs.existsSync(path.join(specDir, ".git"))) {
    try {
      commit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: specDir,
        encoding: "utf8",
      }).trim();
    } catch (err) {
      console.warn(
        `[spec-source] git rev-parse failed in ${specDir}: ${err.message}`,
      );
    }
  } else {
    const metaFile = path.join(specDir, "source.json");
    if (fs.existsSync(metaFile)) {
      try {
        commit = JSON.parse(fs.readFileSync(metaFile, "utf8")).commit ?? null;
      } catch (err) {
        console.warn(
          `[spec-source] bad source.json in ${specDir}: ${err.message}`,
        );
      }
    }
  }

  if (!commit) return null;
  return {
    commit,
    short: commit.slice(0, 7),
    url: `https://github.com/tc39/ecma262/commit/${commit}`,
  };
}
