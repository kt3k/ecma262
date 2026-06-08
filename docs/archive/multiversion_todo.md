-
  1. [x] monorepo に再編成: `packages/shared/` (build スクリプト +
         ecma-spec.css + catch-all テンプレ), `packages/site-<id>/` (Next.js
         app, version 毎), `ecma262/<id>/spec.html` (バージョン毎の spec
         source). 現在 root にある `app/`, `content/`, `lib/`, `scripts/`,
         `next.config.mjs` などは `packages/site-draft/` 配下へ移設し、現状の
         `ecma262/` submodule は `ecma262/draft/` の位置に移動
-
  2. [x] `packages/shared/scripts/build-chapters.mjs` を引数化:
         `--input <spec.html>` / `--content-dir <dir>` / `--lib-dir <dir>` /
         `--public-img-dir <dir>` / `--base-path </id>`。各 site の
         `package.json` の `build:chapters` で自前のパスを渡して呼ぶ
-
  3. [x] 過去版を `ecma262/<id>/spec.html` に vendored 配置
         (`mkdir -p ecma262/es2024 && curl -o ecma262/es2024/spec.html https://raw.githubusercontent.com/tc39/ecma262/refs/tags/es2024/spec.html` +
         `img/` 同梱)。`refs/tags/` プレフィックスで frozen な tag
         を確実に取得。draft は引き続き `ecma262/draft/` の submodule
-
  4. [x] 各 site の per-version config を設定: (a) `next.config.mjs` の
         `basePath: '/<id>'` 固定 + `NEXT_PUBLIC_BASE_PATH` の env mirror、(b)
         `app/layout.jsx` の `metadata.title` を `"ECMA-262, <Nth>, ES20<NN>"`
         形式に (例: site-es2025 → `"ECMA-262, 16th, ES2025"`、site-draft →
         `"ECMA-262, 18th, ES2027 (draft)"`)
-
  5. [x] ルート `package.json` の scripts に `build:all` を追加
         (`pnpm -r build`)、CI で全 site を順次ビルドし、各 site の `out/` を
         `dist/<id>/` にコピーして合体させ、`dist/index.html` (landing page) に
         version 一覧と各 site への link を吐く。GitHub Pages にはこの `dist/`
         をアップロード

## 詳細・補足

### 1. monorepo レイアウト

```
ecma262/
  pnpm-workspace.yaml          # packages/* を workspace に
  package.json                  # root: build:all, deploy
  ecma262/                      # spec source の集約場所
    draft/                      # git submodule (tc39/ecma262 master/HEAD)
      spec.html
      img/
      …
    es2026/
      spec.html
      img/
    es2025/
      spec.html
      img/
    es2024/
      spec.html
      img/
  packages/
    shared/
      package.json
      scripts/
        build-chapters.mjs
        patch-nextra-theme.mjs
      templates/
        ecma-spec.css
        catch-all-route.jsx
    site-draft/
      package.json              # name: "site-draft"
      next.config.mjs           # basePath: '/ecma262/draft' (CI 時)
      app/
        layout.jsx              # metadata.title: "ECMA-262, 18th, ES2027 (draft)"
      content/                  # build:chapters の出力 (gitignored)
      lib/spec/                 # 同上
      public/img/               # 同上
      mdx-components.jsx
    site-es2026/
      package.json              # name: "site-es2026", basePath '/ecma262/es2026'
      app/layout.jsx            # title: "ECMA-262, 17th, ES2026"
      ... (site-draft と同構造)
    site-es2025/
      app/layout.jsx            # title: "ECMA-262, 16th, ES2025"
      ...
    site-es2024/
      app/layout.jsx            # title: "ECMA-262, 15th, ES2024"
      ...
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
onlyBuiltDependencies:
  - sharp
```

`ecma262/` 直下の `.gitmodules` 設定例:

```ini
[submodule "ecma262/draft"]
  path = ecma262/draft
  url = https://github.com/tc39/ecma262
  branch = main
```

各 site の `package.json` は shared を相対パス参照:

```json
{
  "name": "site-es2025",
  "private": true,
  "scripts": {
    "build:chapters": "node ../shared/scripts/build-chapters.mjs --input ../../ecma262/es2025/spec.html --base-path /ecma262/es2025",
    "build": "pnpm build:chapters && next build",
    "dev": "pnpm build:chapters && next dev",
    "postinstall": "node ../shared/scripts/patch-nextra-theme.mjs"
  },
  "dependencies": {
    "next": "^16.2.6",
    "nextra": "^4.6.1",
    "nextra-theme-docs": "^4.6.1",
    "react": "^19.2.6",
    "react-dom": "^19.2.6"
  }
}
```

### 2. build-chapters.mjs 引数化

`node:util` の `parseArgs` で:

```js
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: {
    input: { type: "string" },
    "content-dir": { type: "string", default: "content" },
    "lib-dir": { type: "string", default: "lib/spec" },
    "public-img-dir": { type: "string", default: "public/img" },
    "base-path": { type: "string", default: "" },
  },
});
const SPEC_FILE = path.resolve(values.input);
const CONTENT_DIR = path.resolve(values["content-dir"]);
const LIB_DIR = path.resolve(values["lib-dir"]);
const PUBLIC_IMG_DIR = path.resolve(values["public-img-dir"]);
const SPEC_IMG_DIR = path.join(path.dirname(SPEC_FILE), "img");
```

実行は site dir から相対パスで:

```bash
cd packages/site-es2025
node ../shared/scripts/build-chapters.mjs --input ../../ecma262/es2025/spec.html --base-path /ecma262/es2025
```

### 3. spec source layout

- `ecma262/` を repo root に置き、`<id>/spec.html` + `<id>/img/`
  のペアで各バージョンを格納
- 過去版は plain file vendored (`refs/tags/<id>` から fetch)
- draft は `ecma262/draft/` の submodule
- `img/` ディレクトリも一緒に必要 (build-chapters.mjs が `public/img/`
  にミラーする)

vendored 版の取得 (release tag を明示):

```bash
git clone --depth 1 --branch es2024 https://github.com/tc39/ecma262 /tmp/ecma262-es2024
# ↑ branch 名と tag 名が衝突するので、念のため checkout で tag を上書き:
( cd /tmp/ecma262-es2024 && git fetch --depth 1 origin refs/tags/es2024:refs/tags/es2024 && git checkout tags/es2024 )
mkdir -p ecma262/es2024
cp /tmp/ecma262-es2024/spec.html ecma262/es2024/
cp -r /tmp/ecma262-es2024/img ecma262/es2024/
```

または raw URL から spec.html だけ取って img は後で手動補完:

```bash
mkdir -p ecma262/es2024
curl -o ecma262/es2024/spec.html https://raw.githubusercontent.com/tc39/ecma262/refs/tags/es2024/spec.html
```

(spec が `<img>` を参照していたら 404 になるので、git clone 方式の方が確実)

draft submodule の再配置 (現状の `ecma262/` から `ecma262/draft/` へ):

```bash
git submodule deinit ecma262
git rm ecma262
rm -rf .git/modules/ecma262
git submodule add https://github.com/tc39/ecma262 ecma262/draft
```

### 4. 各 site の per-version config

#### (a) `next.config.mjs` の basePath

```js
import nextra from "nextra";
const withNextra = nextra({});
const basePath = process.env.GITHUB_ACTIONS === "true" ? "/ecma262/es2025" : "";
// ↑ ローカル dev では basePath なし (site 単独で localhost:3000 で動く)
// CI では GitHub Pages の repo path + version id
export default withNextra({
  output: "export",
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
});
```

xref の resolve 自体は変更不要 — 既存の `pathFor(slug)` が site 内で完結する
root-relative path を出し、Sec component が `_basePath` を prefix
する仕組みがそのまま使える。

#### (b) `app/layout.jsx` の `metadata.title`

```js
export const metadata = {
  title: "ECMA-262, 16th, ES2025",
  description: "The ECMAScript 2025 Language Specification, 16th edition.",
};
```

ECMA-262 edition 番号 ↔ 年号 マッピング:

| edition | year   | site id |
| ------- | ------ | ------- |
| 6th     | ES2015 | es2015  |
| 7th     | ES2016 | es2016  |
| 8th     | ES2017 | es2017  |
| 9th     | ES2018 | es2018  |
| 10th    | ES2019 | es2019  |
| 11th    | ES2020 | es2020  |
| 12th    | ES2021 | es2021  |
| 13th    | ES2022 | es2022  |
| 14th    | ES2023 | es2023  |
| 15th    | ES2024 | es2024  |
| 16th    | ES2025 | es2025  |
| 17th    | ES2026 | es2026  |
| 18th    | ES2027 | draft   |

site-draft のタイトルは `"ECMA-262, 18th, ES2027 (draft)"` のように `(draft)`
を付けて在編集中を明示する。

ナビバーの logo 表示も合わせると統一感が出る:

```jsx
const navbar = <Navbar logo={<b>ECMA-262, 16th, ES2025</b>} />;
```

### 5. CI: 統合ビルド

`.github/workflows/nextjs.yml` の build step を以下に置き換え:

```yaml
- name: Build all sites
  run: pnpm -r build

- name: Assemble combined dist/
  run: |
    mkdir -p dist
    for site in packages/site-*; do
      id="${site#packages/site-}"
      cp -r "$site/out" "dist/$id"
    done
    # landing page: 各 version への link を出す
    cat > dist/index.html <<'EOF'
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>ECMA-262 versions</title></head>
    <body>
      <h1>ECMA-262</h1>
      <ul>
        <li><a href="draft/">ECMA-262, 18th, ES2027 (draft)</a></li>
        <li><a href="es2026/">ECMA-262, 17th, ES2026</a></li>
        <li><a href="es2025/">ECMA-262, 16th, ES2025</a></li>
        <li><a href="es2024/">ECMA-262, 15th, ES2024</a></li>
      </ul>
    </body></html>
    EOF

- name: Upload artifact
  uses: actions/upload-pages-artifact@v3
  with:
    path: ./dist
```

GitHub Pages デプロイ後の URL:

- `kt3k.github.io/ecma262/` → landing
- `kt3k.github.io/ecma262/draft/` → site-draft (ECMA-262, 18th, ES2027 draft)
- `kt3k.github.io/ecma262/es2025/` → site-es2025 (ECMA-262, 16th, ES2025)
- ...

ローカル開発: `cd packages/site-es2025 && pnpm dev` で `localhost:3000`
(basePath 無し) でその site だけ立ち上げる。

## サイズ感

- 過去版 5 つ (ES2022〜ES2026) vendored source (spec.html + img/): ~20MB
- 各 site の `out/`: ~50MB × 5 = ~250MB (combined `dist/`)
- 各 site の `lib/spec/` / `content/` は gitignore (build-chapters.mjs が再生成)
- 各 site の `node_modules` は pnpm の symlink で共有されるので実サイズは少ない

## マイルストーン順序の提案

1. **タスク 1 着手** — まずディレクトリ移動だけ。`packages/site-draft/`
   を作って現在のファイルを丸ごと移し、現状 `ecma262/` の submodule を
   `ecma262/draft/` へ再配置、CI が引き続き通ることを確認 (basePath は
   `/ecma262/draft` に更新)
2. **タスク 2** — build-chapters.mjs 引数化、site-draft で動作確認
3. **タスク 3** — `ecma262/es2025/spec.html` を 1
   個だけ持ってきて、`packages/site-es2025/` を site-draft から複製して作成
4. **タスク 4** — site-es2025 が basePath と title 込みで build できることを確認
5. **タスク 5** — CI 統合、過去版を更に追加

3〜5 はループで残りの version を増やしていく。
