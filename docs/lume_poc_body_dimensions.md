# Lume PoC 本文の寸法系スタイル — Nextra 版との比較

対象: `<main>` 内に注入される `<emu-clause>`
の本文タイポグラフィ。色・カーニング は除外し、**margin / padding / font-size /
line-height / 幅** のみを比較。

調査ソース:

- Nextra: デプロイ済み HTML (`/tmp/nextra.html` 取得分) と
  `node_modules/.../nextra-theme-docs/dist/mdx-components/{heading,index}.js`
- スペック CSS: `lume/styles.css` (両者がほぼコピーで持っている)
- Lume PoC: `lume-poc/styles.css` の `main` および `.ecma-spec ...` 周辺

両者は **同じ `ecma-spec.css` の中身を共有** していて、`<emu-clause>`
内のほとんどの 寸法が一致する。差分はおもに 2 箇所:

1. 外側コンテナ (`<article>` / `<main>`) の padding
2. Nextra が `mdx-components/index.js` 経由で `<p>` / `<li>` / `<ul>` / `<ol>` /
   `<blockquote>` に追加で当てている Tailwind ユーティリティ

## 寸法差分テーブル

| 要素 / プロパティ                   | Nextra                                             | lume-poc                                                          | 一致?                              |
| ----------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| `<article>` / `main` padding-top    | `pt-4` = 16px                                      | `1.5rem` = 24px                                                   | △ (+8px)                           |
| 同 padding-bottom                   | `pb-8` = 32px                                      | `4rem` = 64px                                                     | △ (+32px)                          |
| 同 padding-x (mobile)               | `px-4` = 16px                                      | `2rem` = 32px                                                     | △ (+16px)                          |
| 同 padding-x (md+)                  | `md:px-12` = 48px                                  | `2rem` = 32px (固定)                                              | △ (−16px、lume はレスポンシブなし) |
| 本文 font-size                      | `1.0625rem` (17px)                                 | `1.0625rem` (17px)                                                | ✅                                 |
| 本文 line-height                    | `leading-7` = 28px ≈ 1.647                         | `1.65`                                                            | ✅ (実質一致)                      |
| 測度 `--ecma-measure`               | `45rem`                                            | `45rem`                                                           | ✅                                 |
| トップレベル `<h1>` margin-top      | `mt-2` = 8px (Nextra `heading.js`)                 | ブラウザ既定 ≈ 0.67em ≈ 11.4px                                    | △ 微差                             |
| L1 `<h1>` font-size                 | `2.1em` (ecma-spec.css が `text-4xl` を上書き)     | `2.1em`                                                           | ✅                                 |
| L2 `<h1>` font-size + mt            | `1.75em` + `3.5em`                                 | 同左                                                              | ✅                                 |
| L3 `<h1>` font-size + mt            | `1.4em` + `2.5em`                                  | 同左                                                              | ✅                                 |
| L4 `<h1>` font-size + mt            | `1.18em` + `2em`                                   | 同左                                                              | ✅                                 |
| クローズ直下兄弟 `* + *` mt         | `1.5em` (ecma-spec.css)                            | `1.5em`                                                           | ✅                                 |
| `<emu-table>` / `<emu-figure>` mt   | `2em`                                              | `2em`                                                             | ✅                                 |
| `<p>` 直下 grid child               | `1.5em` (ecma-spec.css)                            | `1.5em`                                                           | ✅                                 |
| `<p>` リスト内 / note 内 / quote 内 | `not-first:mt-[1.25em]` + `leading-7` (Nextra mdx) | `margin-block: 0.75em` (lume `:is(emu-note, li, blockquote) > p`) | ❌ Nextra 1.25em vs lume 0.75em    |
| `<li>` 縦 margin                    | `my-[.5em]` (Nextra mdx)                           | ブラウザ既定 ≈ 0                                                  | ❌                                 |
| `<ul>` indent                       | `ms-[1.5em]` ≈ 24px                                | ブラウザ既定 ≈ 40px                                               | ❌                                 |
| `<ol>` indent                       | `ms-6` = 24px                                      | ブラウザ既定 ≈ 40px                                               | ❌                                 |
| ネスト `<ol>` / `<ul>` margin-block | `my-[.75em]`                                       | (なし)                                                            | ❌                                 |
| `<ol>` / `<ul>` 兄弟 mt             | `not-first:mt-[1.25em]`                            | `1.5em` (`* + *` 経由)                                            | △ 微差 (1.25em vs 1.5em)           |
| `<blockquote>` padding-start        | `ps-[1.5em]` = 24px                                | (なし)                                                            | ❌ Nextra のみ実装                 |

(凡例: ✅ 一致 / △ 微差 / ❌ はっきり違う)

## 由来の確認

### Nextra の Tailwind ユーティリティ

`nextra-theme-docs/dist/mdx-components/index.js` から:

```js
const Blockquote = (props) => <blockquote
  className={cn(
    "x:not-first:mt-[1.25em] x:border-gray-300 x:italic ...",
    "x:border-s-2 x:ps-[1.5em]"
  )} {...props} />;

li: (props) => <li className="x:my-[.5em]" {...props} />,
ol: (props) => <ol className="x:[:is(ol,ul)_&]:my-[.75em] x:not-first:mt-[1.25em] x:list-decimal x:ms-6" {...props} />,
p:  (props) => <p  className="x:not-first:mt-[1.25em] x:leading-7" {...props} />,
ul: (props) => <ul className="x:[:is(ol,ul)_&]:my-[.75em] x:not-first:mt-[1.25em] x:list-disc x:ms-[1.5em]" {...props} />,
```

### Nextra の heading 階層

`nextra-theme-docs/dist/mdx-components/heading.js` から:

```js
cn(
  "x:tracking-tight x:text-slate-900 x:dark:text-slate-100",
  Tag === "h1" ? "x:font-bold" : "x:font-semibold ...",
  {
    h1: "x:mt-2 x:text-4xl",
    h2: "x:mt-10 x:border-b x:pb-1 x:text-3xl nextra-border",
    h3: "x:mt-8 x:text-2xl",
    h4: "x:mt-8 x:text-xl",
    h5: "x:mt-8 x:text-lg",
    h6: "x:mt-8 x:text-base",
  }[Tag],
  className,
);
```

ecmarkup の出力は **全章 `<h1>` のみ** なので、h1 の Tailwind 値
(`mt-2 text-4xl`) が出発点になり、`.ecma-spec emu-clause > h1` 系の CSS
でセレクタ特異度の高い方が 上書きする。L1 だけは margin-top
の上書きルールがないので `mt-2` (= 8px) が残る。

### lume-poc 側のリスト関連

`lume-poc/styles.css` の `.ecma-spec ...` セクションには、`<li>`, `<ul>`, `<ol>`
の縦余白・インデント・ネスト時の挙動を設定するルールがない。ブラウザ既定
(`ul/ol { margin: 1em 0; padding-inline-start: 40px; }`、`li` は margin なし) が
そのまま効く。`emu-note, li, blockquote > p` だけは `margin-block: 0.75em`
を明示している。

## どうしたいか

- **完全に Nextra に揃える** → 全ての ❌ 項目を上書きする CSS を追加
- **読みやすさ重視で取捨選択** → 例: リストインデント (24px) と `<li>` の 0.5em
  だけ揃え、`<p>` 内縦リズムは 0.75em のまま (詰めた方が読みやすい)
- **コンテナ padding だけ揃える** → 上下を 16/32px に詰め、横をレスポンシブに

具体的に「これとこれ」と指定してくれれば、対応する CSS を `styles.css` に
追加・修正します。
