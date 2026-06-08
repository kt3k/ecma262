# Nextra → Lume 移行の進捗・履歴

ECMA-262 Restyled のレンダリングを **Next.js + Nextra から
[Lume](https://lume.land/)
(Deno)へ移行**した経緯と、移行後のアーキテクチャの記録(2026-06-03〜2026-06-06)。

関連: tc39 との意図的な差異は [`tc39-deviations.md`](tc39-deviations.md)。

> 注: 本ドキュメントは **移行完了時点(2026-06-06)のスナップショット**。以降の
> 変更(`packages/shared` → `src/` 移動、`draft-nextra` → ベンダリング
> `nextra-poc`、ES2015〜ES5.1 の追加、`/pipeline` 撤去など)は反映していない。
> 現行構成はコードを参照。

## 移行完了時点のアーキテクチャ(2026-06-06)

- 全エディション(draft / es2026 / es2025 / es2024)を **Lume が単一プロジェクト
  `lume/` から版パラメータ化してビルド**。
- 旧 Nextra サイト(`packages/site-draft`, `site-es2024/25/26`)は退役・削除。
  **`packages/site-draft-nextra` のみ比較用に残置**(`/ecma262/draft-nextra/`)。
- 入力 `ecma262/<id>/spec.html`(ecmarkup ソース)を `build-chapters.mjs` が変換
  (ecmarkup 非依存)→ `build-pages.ts` が Lume ページ化 → Lume がレンダリング。

```
lume/                         # 単一 Lume プロジェクト(旧 lume-poc)
  _config.ts                  # jsx/mdx プラグイン、静的コピー、TOC 生成
  _includes/                  # 共通クロム(page/header/sidebar/footer/prev-next)
    editions.ts               # → packages/shared/editions.json を import
    chapters.ts               # → 生成 chapters.json の薄い型付きローダ
  scripts/build-pages.ts      # EDITION/BASE_PATH で版ごとにページ生成
  styles.css search.js fonts/ favicon.svg hljs-github.css deno.json
  # 生成物(gitignore・毎ビルド再生成): lib/*.jsx, *.mdx, img/, _includes/chapters.json
packages/shared/
  editions.json               # 全エディションの単一ソース(id + title, 新しい順)
  scripts/{build-chapters,build-pages の呼出元,assemble-dist,editions,spec-source}.mjs
packages/site-draft-nextra/   # 比較用 Nextra(/draft-nextra)
ecma262/<id>/spec.html        # draft=submodule, es2024/25/26=vendored snapshot
```

### ビルド & デプロイ

- 版ごと:
  `EDITION=<id> BASE_PATH=/ecma262/<id> deno task pages && deno task build`
- 結合: `pnpm assemble`(= `assemble-dist.mjs`)が各版を Lume でビルドし
  `dist/<id>/` へ、`site-draft-nextra/out` を `dist/draft-nextra/`
  へ、ランディング (`/`, `/about`,
  `/pipeline`)を生成。CI(`.github/workflows/nextjs.yml`)は
  `pnpm build:nextra`(比較サイトのみ)→ `pnpm assemble` → Pages へデプロイ。
- 公開 URL: `/ecma262/{draft,es2026,es2025,es2024}/`(Lume)、
  `/ecma262/draft-nextra/`(Nextra 比較)。`/ecma262/` は draft へリダイレクト。

## 主要な設計判断

- **ecmarkup は流用しない**。`spec.html`(ecmarkup ソース)を自前
  `build-chapters.mjs` で変換。将来 ecmarkup
  に無い独自メタ情報を付加できるよう出力を所有するため。
- **版ごとにディレクトリを分けない**。差分は spec ソース・base path・タイトルの
  3 つ だけで、コンテンツは生成物・クロムは共通。1 プロジェクトを
  `EDITION`/`BASE_PATH` env で回す。
- **生成物は
  gitignore**(`lib/*.jsx`・`*.mdx`・`img/`・`chapters.json`)。版数ぶんの
  コミット肥大と submodule 追従 churn を回避し、毎ビルド再生成。
- **`editions.json` を単一ソース化**。`editions.mjs`(Node)と
  `lume/_includes/editions.ts`
  (Deno)が同じファイルを読み、タイトルの二重管理を解消。
- **`draft-nextra` を比較用に残す**。エディション一覧には載せず直 URL のみ。

## 履歴(時系列・コミット)

### フェーズ 1: tc39 パリティの作り込み(2026-06-03)

単一章 PoC(`lume-poc`, notational-conventions)を tc39 multipage の実出力と
突き合わせ、`build-chapters.mjs` とスタイルを揃えた。

- 文法表示: グラムパネル撤去・注釈色・レイアウトを tc39 化(`f4bb2fb`
  `742e1eb`)、 単一行 production を inline
  維持(`0e81d6b`)、`emu-production emu-gprose` の
  `margin-right`(`3ac5a44`)、collapsed production の **margin カスケードを tc39
  と 一致**(詳細度 0,3,2→0,2,1、`de83df8`)。
- `emu-grammar` の **`example`/`definition` 種別を保持**(5.2.3
  の例示文法、`096bfe0`)。
- オプショナル `?` を **下付き "opt"** にレンダリング(`abeb497`)。
- `emu-xref` の **`title` 属性**で節タイトル展開(`28fb93f`)。
- **dfn 自動リンクの大小規則を ecmarkup と一致**: 先頭文字レニエンシを一方向に
  (`75d0a20`)、自己参照抑制を「リンク先 id == 節 id」基準に + 大小衝突時に小文字
  surface 優先(`223bda7`)。
- **抽象操作(aoid)の自動リンクを ecmarkup 同等に実装**(`dec6187`)。
- draft submodule を最新 main に更新(`48effc1`)。

### フェーズ 2: 全章 Lume 化と draft の切替(2026-06-05)

- `lume-poc` を **全 38 章**に拡張(`build-pages.ts` 新設、`3d4ef82`)。
- フッターの `.site-switchers`(Nextra パリティではないと判明)を削除(`fb98782`)。
- **`/ecma262/draft/` を Nextra(`site-draft`)から Lume
  ビルドへ切替**、`site-draft` 削除(`d238d09`)。

### フェーズ 3: マルチバージョン化(2026-06-05〜06)

3 段階の TODO(`459de16`)を実施:

1. **`lume-poc` → `lume` リネーム + 版パラメータ化**(`070eabc`): `EDITION` で
   spec ソース選択、`BASE_PATH` でリンクプレフィックス、章一覧・現在版を生成/env
   化、 生成物を gitignore。
2. **`assemble-dist.mjs` を全版 Lume ループに**(`2c26650`): 各版を
   `EDITION`/`BASE_PATH` 付きでビルドし `dist/<id>` へ。CI を簡素化。
3. **Nextra `site-es20xx` を退役**(`b5f108e`): 3 パッケージ削除、`editions.json`
   を単一ソース化、draft-nextra は別途任意コピーに。

### フェーズ 4: ドキュメント(2026-06-06)

- `/pipeline`(「How it's built」)記事を Lume 構成に更新(`f0c158b`)。

## 残作業 / 今後

- **autolink の拡充**: built-in function / internal・concrete method は未リンク
  (ecmarkup は一部リンクする)。
- **Unicode プロパティ表**: ecmarkup が Unicode DB から生成する表は vendored
  スナップショットに無く未解決(既知の制限)。
- 比較が済めば `site-draft-nextra` も将来的に退役検討。
