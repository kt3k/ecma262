# Lume マルチバージョン化 TODO

`lume-poc`(現在 `/ecma262/draft/` を配信)の Lume ビルド方式を、es2026 candidate
/ es2025 / es2024 など**全エディション**に広げるための作業計画。

## 方針:単一プロジェクト + 版パラメータ化

各版の差分は「spec ソース・base path・タイトル」の 3 つだけで、コンテンツは
生成物・クロム(レイアウト/CSS/JS)は全版共通。よって版ごとにディレクトリを
分けず、1 つの Lume プロジェクトを `EDITION` / `BASE_PATH` env で回す。

目標ディレクトリ構成:

```
lume/                         # lume-poc を改名(PoC ではなくなったため)
  _config.ts                  # EDITION / BASE_PATH を env から読む
  _includes/                  # 全版共通のクロム
    page.tsx header.tsx sidebar.tsx footer.tsx prev-next.tsx
    editions.ts               # 全版リスト(current は EDITION env 由来)
  scripts/build-pages.ts      # EDITION → ecma262/<id>/spec.html を変換
  styles.css search.js hljs-github.css favicon.svg fonts/ deno.json
  # ↓ 版ごとに再生成する生成物(gitignore)
  content/<slug>.mdx
  lib/<slug>.jsx
  _includes/chapters.json     # build-chapters の _meta.js から版ごとに生成
```

ビルドは版ごとに「再生成 → ビルド → dist へ」を回す:

```
for id in draft es2026 es2025 es2024; do
  EDITION=$id BASE_PATH=/ecma262/$id deno task pages
  EDITION=$id BASE_PATH=/ecma262/$id deno task build
  # assemble が _site → dist/$id へコピー
done
```

## TODO

- [ ] **(1) `lume-poc` → `lume` リネーム + 版パラメータ化**
  - `lume-poc` を `lume` に改名(参照する `assemble-dist.mjs` /
    `.github/workflows/nextjs.yml` / README のパスも追従)
  - `scripts/build-pages.ts`: `EDITION` env → `ecma262/<id>/spec.html` を入力に
    解決(現状 draft 固定)。`BASE_PATH` は既に対応済み
  - 現在版のタイトル/id を `EDITION` env から解決(`editions.ts` の
    `currentEditionId` 固定を env 化。`editions.ts` は全版リストとして残す)
  - サイドバーの章一覧を `build-chapters` の `_meta.js` から**版ごとに生成**
    (手書き `chapters.ts` の draft 固定を廃止。group=annex/back も導出)
  - 生成物(`lib/*.jsx`・`content/*.mdx`・生成した章一覧)を **gitignore**
    して毎ビルド再生成(版数ぶんのコミット肥大・submodule 追従 churn を回避)

- [ ] **(2) `assemble-dist.mjs` を全版 Lume ループに**
  - 現状 draft だけ Lume(`lume/_site → dist/draft`)、他版は Nextra
    `packages/site-<id>/out`。これを全版 Lume ビルドに切り替え
  - 版ごとに `EDITION`/`BASE_PATH` を設定して再生成 + ビルド + Pagefind し、
    `_site` を `dist/<id>` へコピーするオーケストレーション
  - CI(`nextjs.yml`)も全版 Lume ビルドに更新

- [ ] **(3) Nextra `packages/site-es20xx` の退役**
  - 全版が Lume で配信できることを確認後、`packages/site-es2024` / `site-es2025`
    / `site-es2026` を削除(`pnpm-lock.yaml` の importer も)
  - 比較用に `site-draft-nextra`(`/ecma262/draft-nextra/`)は残す
  - `editions.mjs` / `pnpm` workspace の整理

## 補足

- 版ごとにディレクトリを分けない理由: 共通クロムの共有機構が要り設定が版数ぶん
  重複するため。手書きページやクロムを版で変えたい事情が出たら分割を再検討。
- `ecma262/<id>/spec.html` は draft が submodule、es2024/25/26 は vendored
  スナップショット(既存)。
