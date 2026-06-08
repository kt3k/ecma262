# lume-poc 本文タイポグラフィを tc39.es に寄せる作業ログ

対象: lume-poc の本文 (`.ecma-spec` 配下) のタイポグラフィを公式
`https://tc39.es/ecma262/multipage/` と揃える作業のまとめ。Nextra
合わせと別に、tc39.es の DOM/CSS にコミットしたい部分をここで揃える。

参照:

- tc39.es CSS: `https://tc39.es/ecma262/assets/css/ecmarkup.css`
- スペック CSS: `lume/styles.css`
- lume-poc CSS: `lume-poc/styles.css`

## 1. font-family / font-weight (commit `4ca4be6`)

### 比較

| 要素                         | tc39.es                                                                            | lume-poc (旧)                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| body                         | `'IBM Plex Serif', serif` (18px, line-height 1.5, `slashed-zero`)                  | system sans (`-apple-system`, `BlinkMacSystemFont`, ...; 17px / 1.65) |
| `<code>`                     | `font-weight: 700` + `'Comic Code','IBM Plex Mono',monospace` + `white-space: pre` | chip スタイル (panel-bg + border + 角丸)                              |
| `<emu-nt>`                   | `font-style: italic`                                                               | 同                                                                    |
| `<emu-t>`                    | `'IBM Plex Mono'` + `font-weight: 700`                                             | system mono + `font-weight: 600`                                      |
| `<emu-val>`                  | `font-weight: 700`                                                                 | `font-weight: 600`                                                    |
| `<emu-geq>`                  | `font-weight: 700`                                                                 | (weight 指定なし、opacity 0.55)                                       |
| `<emu-oneof>`                | `font-weight: 700`                                                                 | (weight 指定なし、italic + opacity 0.7)                               |
| `<emu-const>`                | `'IBM Plex Sans'` + `small-caps` + `text-transform: uppercase`                     | `small-caps` のみ (body sans 継承)                                    |
| `<emu-gprose>`               | `'IBM Plex Sans'` + `font-size: 0.9em`                                             | `font-style: italic` + opacity 0.8                                    |
| `<emu-opt>` / `<emu-params>` | `'IBM Plex Mono'`                                                                  | system mono                                                           |
| `figcaption`                 | `font-weight: 700`                                                                 | (rule 無し)                                                           |
| LHS NT                       | (rule 無し)                                                                        | `font-weight: 600`                                                    |

### 対応 (`4ca4be6`)

- `:root` に 3 つの CSS 変数を追加。webfont を入れたくないので system
  フォントスタックで近いものを並べた:

  ```css
  --font-serif:
    Charter,
    "Bitstream Charter",
    Cambria,
    "Iowan Old Style",
    Georgia,
    ui-serif,
    serif;
  --font-sans:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    "Segoe UI Variable",
    Cantarell,
    "Helvetica Neue",
    Arial,
    sans-serif;
  --font-mono:
    ui-monospace,
    "SF Mono",
    Menlo,
    "Cascadia Mono",
    "Cascadia Code",
    Consolas,
    "DejaVu Sans Mono",
    "Liberation Mono",
    monospace;
  ```

- `main[data-pagefind-body]` に `font-family: var(--font-serif)` を当て、
  本文だけ serif (chrome は system sans のまま)
- `emu-const` / `emu-gprose` に `var(--font-sans)`
- grammar 系 (`emu-t` / `emu-opt` / `emu-params` / `emu-constraints` /
  `emu-gann` / `emu-gmod`) を `var(--font-mono)` に統一
- inline `<code>` に `var(--font-mono)` + `font-weight: 700`
- `font-weight`: `emu-val` 600 → 700、`emu-t` 600 → 700、`emu-geq` / `emu-oneof`
  / `figcaption` に 700 を新規付与
- `emu-grammar emu-production > emu-nt` の `font-weight: 600` を削除 (tc39.es は
  LHS をボールドにしない)

line-height は別件として手付かず。

## 2. highlight.js github テーマ (commit `a7a20f6`)

### 状況

- spec 内のコードブロック (`<pre><code class="hljs javascript">…</code></pre>`)
  は build 時に highlight.js でトークンに `<span class="hljs-*">` が 付与済み
- が、lume-poc は **highlight.js のテーマ CSS をどこからもロードして
  いない**。トークンは全部ただの黒テキスト
- 既存の `html.dark .ecma-spec pre code.hljs { background: transparent }` rule
  は実質 dead code (打ち消す相手が居ない)
- tc39.es は github テーマ相当をロードしつつ
  `pre code.hljs { background: 0 0; margin: 0; padding: 0 }` で chrome
  をゼロアウトしている (= 色だけ受け取る方針)

### 対応 (`a7a20f6`)

- `highlight.js/styles/github.css` を `lume-poc/hljs-github.css` に vendored
  copy (117 行、Nextra 版は `import "highlight.js/styles/github.css"`
  で同じものを取っている)
- `_config.ts`: `site.copy("hljs-github.css")` で `_site/` に配置
- `page.tsx`: `<link rel="stylesheet" href="…/hljs-github.css">` を `styles.css`
  の **前** に。後続の styles.css で specificity を気にせず 上書きできる
- `styles.css`:
  `html.dark .ecma-spec pre code.hljs { background:
  transparent; color: inherit }`
  を捨てて、ライト・ダーク両方で効く
  `.ecma-spec pre code.hljs { background: transparent; padding: 0;
  margin: 0 }`
  に書き換え (tc39.es の `background: 0 0; margin: 0;
  padding: 0` 相当)
- dark モード時のトークン色 (`hljs-keyword` / `hljs-built_in` / `hljs-string`)
  の override は github テーマが light 専用設計なので 残す

## 3. inline `<code>` chip 撤去 (commit `703413d`)

### 比較

tc39.es は `<code>` を **本文中の短いキーワード/演算子** (`this`, `new`,
`typeof`, `+`, `-`, `void` 等) に使う。built HTML を grep すると 63
個ヒットしてどれも 1〜8 文字。

tc39.es:

```css
code {
  font-weight: 700;
  font-family: "Comic Code", "IBM Plex Mono", monospace;
  white-space: pre;
}
pre code {
  font-weight: inherit;
}
pre code.hljs {
  background-color: var(--background-color);
  margin: 0;
  padding: 0;
  background: 0 0;
}
emu-table:not(.code) td code {
  white-space: normal;
}
```

lume-poc (旧):

```css
.ecma-spec :not(pre) > code {
  background: var(--ecma-panel-bg);
  border: 1px solid var(--ecma-panel-border);
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-size: 0.9em; /* 10% 縮小 */
  font-family: var(--font-mono);
  font-weight: 700;
  box-decoration-break: clone;
}
```

主な違い:

1. **chip vs 素**: lume-poc は GitHub/Linear docs 風の chip、tc39.es は
   背景なしの太字 mono のみ。1 文字の演算子 (`+`, `-`) を chip でラップ すると
   glyph より枠が大きく違和感
2. **`white-space: pre`**: tc39.es は inline `<code>` の中の空白を 保持 +
   折り返さない。`<code>StringToNumber( )</code>` のような
   意図的なスペースが詰まらない代わりに、長い識別子は親をはみ出る ので
   `emu-table:not(.code) td code { white-space: normal }` で table セル内だけ
   wrap 許可
3. **font-size**: lume-poc は 0.9em 縮小、tc39.es は本文サイズ

### 対応 (`703413d`)

完全 tc39.es 化:

```css
.ecma-spec :not(pre) > code {
  font-family: var(--font-mono);
  font-weight: 700;
  white-space: pre;
}
.ecma-spec emu-table:not(.code) td code {
  white-space: normal;
}
```

chip 系プロパティ (背景、枠、角丸、padding、box-decoration-break、 font-size
縮小) を全削除。

## 4. IBM Plex Mono vendoring (commit `0357d8d`)

`--font-mono` は system mono fallback (ui-monospace / SF Mono / Cascadia Mono /
...) で動かしていたが、tc39.es と同じ Plex Mono の 正確な字形が欲しいので
webfont として同梱。

### 対応

- tc39.es が `/ecma262/assets/fonts/` から配ってる **slashed-zero 入り WOFF2 の
  4 weight** (Regular / Bold 700 / Italic / Bold Italic、 各 10–12 KB) を
  `lume-poc/fonts/IBMPlexMono-*-SlashedZero.woff2` に vendored copy。IBM Plex は
  OFL なので vendoring OK
- `_config.ts`: `site.copy("fonts")` でビルド出力に投入
- `styles.css` 先頭に 4 つの `@font-face` (`font-display: swap`) を 宣言:
  ```css
  @font-face {
    font-family: "IBM Plex Mono";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("/fonts/IBMPlexMono-Regular-SlashedZero.woff2") format("woff2");
  }
  /* ... Bold 700 / Italic 400 / Bold Italic 700 も同様 */
  ```
- `--font-mono` の先頭に `"IBM Plex Mono"` を追加:
  ```css
  --font-mono:
    "IBM Plex Mono",
    ui-monospace,
    "SF Mono",
    Menlo,
    "Cascadia Mono",
    "Cascadia Code",
    Consolas,
    "DejaVu Sans Mono",
    "Liberation Mono",
    monospace;
  ```

`font-display: swap` でフォント読み込み中は system mono がフォールバック
として描画されるので FOIT は出ない。

## 5. `.secnum` 統合 (commit `763bd15`)

### 比較

tc39.es:

```css
h1 .secnum {
  text-decoration: none;
  margin-right: 5px;
}
h1 .secnum:empty {
  margin: 0;
  padding: 0;
}
```

(font-family 指定なし、opacity なし、tnum なし — h1 から継承)

lume-poc (旧):

```css
.secnum {
  font-family: ui-monospace, SFMono-Regular, ...;
  font-feature-settings: "tnum";
  opacity: 0.65;
  padding-inline-end: 0.4em;
  font-weight: inherit;
}
```

(monospace + 0.65 opacity で数字部分を控えめにする演出)

### 対応 (`763bd15`)

tc39.es に完全一致:

```css
h1 .secnum {
  text-decoration: none;
  margin-right: 5px;
}
h1 .secnum:empty {
  margin: 0;
  padding: 0;
}
```

これで章番号は heading 本文と同じ serif + 同じ weight + 同じ濃さで 描画され、5px
の隙間だけ空けてタイトルに続く。

## 6. heading / clause margin の取り回し (commit `879bf48`)

### tc39.es の方針

heading 自身には margin を付けず (`h1 { margin-bottom: 0 }` のみ)、 section
break の余白を `<emu-clause>` / `<emu-intro>` / `<emu-annex>` コンテナ自体の
`margin-top` で持たせる。depth で減衰する:

```css
emu-annex, emu-clause, emu-intro {
  margin-top: 4em;
}
emu-annex emu-annex, emu-clause emu-clause, … {
  margin-top: 3.12em;
}
… nested ×3 {
  margin-top: 2.5em;
}
… nested ×4 {
  margin-top: 2.22em;
}
… nested ×5 {
  margin-top: 2em;
}
… nested ×6 +  {
  margin-top: 1.8em;
}
#spec-container > emu-clause:first-of-type, … {
  margin-top: 0;
}
```

### lume-poc (旧) の方針

逆方向 — heading そのものに `margin-top` を付けて section break を 作っていた:

```css
.ecma-spec emu-clause > h1 {
  margin-top: 0.5rem;
  margin-bottom: 0.4em;
  font-size: 2.1em;
}
.ecma-spec emu-clause emu-clause > h1 {
  margin-top: 3.5em;
  margin-bottom: 0.4em;
  font-size: 1.75em;
}
.ecma-spec emu-clause emu-clause emu-clause > h1 {
  margin-top: 2.5em;
  margin-bottom: 0.4em;
  font-size: 1.4em;
}
.ecma-spec emu-clause emu-clause emu-clause emu-clause > h1 {
  margin-top: 2em;
  margin-bottom: 0.4em;
  font-size: 1.18em;
}
```

`<emu-clause>` 自体は `display: grid` (measure column 用) だけで margin なし。

grid layout なので heading と clause の margin は collapse せず加算
されてしまい、tc39.es より gap が大きくなりがちだった。

### 対応 (`879bf48`)

1. **headings**: per-level の `margin-top` / `margin-bottom: 0.4em` を全削除、
   代わりに全 spec h1 に `margin-top: 0; margin-bottom: 0` を当てる。 font-size
   scale (2.1em / 1.75em / 1.4em / 1.18em) はそのまま (今回の スコープは margin
   だけ):

   ```css
   .ecma-spec :is(emu-clause, emu-intro, emu-annex) > h1 {
     margin-top: 0;
     margin-bottom: 0;
   }
   ```

2. **clause containers**: depth 別の `margin-top` を tc39.es 値で追加。
   `:is(emu-clause, emu-intro, emu-annex)` をネストしてカスケードさせる:

   ```css
   .ecma-spec :is(emu-clause, emu-intro, emu-annex) {
     margin-top: 4em;
   }
   .ecma-spec :is(…) :is(…) {
     margin-top: 3.12em;
   }
   .ecma-spec :is(…) :is(…) :is(…) {
     margin-top: 2.5em;
   }
   /* 4em → 3.12em → 2.5em → 2.22em → 2em → 1.8em で深さに応じて減衰 */
   .ecma-spec > :is(emu-clause, emu-intro, emu-annex):first-of-type {
     margin-top: 0;
   }
   ```

3. heading → 最初のパラグラフの gap は既存の
   `.ecma-spec :is(emu-clause, emu-intro, emu-annex) > * + * { margin-top: 1.5em }`
   rhythm rule が引き続き供給するので、heading の lead-out は変わらない。

## 7. h1 の line-height (commit `87c6144`)

### 比較

tc39.es は generic h1 rule で `line-height: 1em` を当てている (=
フォントサイズと 同じ高さ、行 box が glyph に張り付く):

```css
h1 {
  font-size: 2.67em;
  margin-bottom: 0;
  line-height: 1em;
}
```

font-size はマルチページ版だと `emu-clause h1 { font-size: 2em }`
がチャプタートップに 当たって 36px、lume-poc も 2.1em × 17px = 35.7px とほぼ一致
(~1% 差) なので font-size は据え置き。

lume-poc (旧) は h1 に line-height 指定無し → `main[data-pagefind-body]` の
`1.65` が 継承され、行 box が glyph の ~1.65 倍。tc39.es より上下に約 65%
の余白が入る。

### 対応 (`87c6144`)

既存の zero-margin ブロックに `line-height: 1em` を追加:

```css
.ecma-spec :is(emu-clause, emu-intro, emu-annex) > h1 {
  margin-top: 0;
  margin-bottom: 0;
  line-height: 1em; /* 追加 */
}
```

font-size scale (2.1em / 1.75em / 1.4em / 1.18em) は手付かず。

## 8. h2-h6 → h1 flatten (commit `13fa2a9`)

### 経緯

ここまでの heading 関連 CSS (font-size scale、`line-height: 1em`、margin 撤去)
は すべて `.ecma-spec emu-clause emu-clause > h1` のような **h1
ターゲットのセレクタ** で書かれていた。しかし lume-poc の MDX は
`##`/`###`/`####` を素直に `<h2>`/`<h3>`/`<h4>` に変換してて、CSS ルールが **L2
以下にマッチしない** ことが 判明。

- ビルド済み HTML: `1 <h1>, 3 <h2>, 13 <h3>, 14 <h4>` (notational-conventions
  ページ)
- L2 以下は **CSS ルールではなくブラウザのデフォルト** (h2 ~1.5em / h3 ~1.17em /
  h4 ~1em + 本文の line-height 1.65 継承) で描画されていた
- 直前の `line-height: 1em` も L1 にしか効いていなかった

`git log -S "markdown-derived" -- lume-poc/` で確認したところ、最初の lume-poc
移行 プラン commit `819e78d` に既に書かれていた:

> "Heading levels remain markdown-derived (h1-h4 by depth) instead of the all-h1
> trick; a rehype plugin could flatten if exact parity is wanted."

つまり最初から保留扱い。Nextra 版
(`packages/site-draft-nextra/mdx-components.jsx`) は React MDX components の
`h2: h1AsH1, h3: h1AsH1, ...` で同等のことをしているが、Lume の MDX は別系統
なので別途必要。

### 対応 (`13fa2a9`)

`_config.ts` に小さな rehype プラグインを書いて `mdx({ rehypePlugins: [...] })`
に 渡す:

```ts
// deno-lint-ignore no-explicit-any
function rehypeFlattenHeadings() {
  return (tree: any) => {
    const walk = (node: any) => {
      if (node.type === "element" && /^h[2-6]$/.test(node.tagName)) {
        node.tagName = "h1";
      }
      if (node.children) { for (const c of node.children) walk(c); }
    };
    walk(tree);
  };
}

site.use(mdx({
  rehypePlugins: [rehypeFlattenHeadings],
}));
```

### 効果

ビルド結果の heading 内訳: `30 <h1>, 1 <h2>`。残った 1 個の `<h2>` は右ペイン
TOC の "On this page" ラベル (`aside.toc h2`、`page.tsx` で UI として描画)。spec
本文の heading は全部 `<h1>` に flatten された。

これでようやく以下の既存 CSS が **全 heading にマッチ** するようになる:

- `.ecma-spec :is(emu-clause, emu-intro, emu-annex) > h1 { line-height: 1em; margin: 0 }`
- `.ecma-spec emu-clause emu-clause > h1 { font-size: 1.75em }` (L2
  用、これまで素通り)
- 同 L3 / L4 用ルール

(L1 だけは emu-clause 直下の h1 = MDX 元の `#` も rehype 後の `<h1>` も同じ)

## 残課題 / 今後の候補

- font-size scale の深い階層: tc39.es は 2.67em / 2em / 1.56em / 1.25em / 1.11em
  / 1em / 0.9em の 7 段階。lume-poc は 2.1em / 1.75em / 1.4em / 1.18em の 4 段階
  止まり。L5 以下は本文サイズと同じ。深い階層が出てくるページでは追加要。
- body line-height: tc39.es は 1.5、lume-poc は 1.65 で緩め。h1 は 7. で揃えたが
  本文段落側は未調整。
- IBM Plex Sans を webfont として同梱する選択肢 (今は system sans stack:
  `-apple-system` / Segoe UI / Cantarell でフォールバック)。
- IBM Plex Serif の webfont 化 (同上)。tc39.es は本文も Plex Serif で vendoring
  済み。system fallback Charter / Cambria / Georgia
  の見た目に違和感が出るなら検討。
- 内部 `<a>` のスタイル: tc39.es は下線なし (色のみ)、lume-poc は薄い下線あり。
- `<emu-mods>` の sub-script スタイル (tc39.es:
  `font-size: 0.85em;
  vertical-align: sub`)。

## 関連 commit リスト

| commit    | 内容                                                                             |
| --------- | -------------------------------------------------------------------------------- |
| `4ca4be6` | 本文 font-family / font-weight を tc39.es 寄せ                                   |
| `a7a20f6` | highlight.js github テーマを vendored + chrome ゼロアウト                        |
| `703413d` | inline `<code>` の chip を撤去、bold mono のみに                                 |
| `0357d8d` | IBM Plex Mono WOFF2 4 weight vendoring                                           |
| `763bd15` | `.secnum` を tc39.es ルールに統合 (mono / opacity / tnum 削除)                   |
| `879bf48` | heading の margin を撤去し emu-clause depth 別 `margin-top` に移動               |
| `87c6144` | spec h1 に `line-height: 1em` を追加 (tc39.es generic h1 rule 相当)              |
| `13fa2a9` | rehype プラグインで MDX h2-h6 を h1 に flatten、depth 別 CSS が全 heading に有効 |
