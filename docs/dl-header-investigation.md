# 調査メモ: 節シグネチャの "for" が改行される件（`dl.header`）

## 症状

17th(ES2026) の 10.1.1
`[[GetPrototypeOf]] ( ): a normal completion containing either an Object or null`
など、節の冒頭で「for an ordinary object O」の **"for"
が単独行に落ちて改行**される。

## 該当ソース

`ecma262/es2026/spec.html:12583`（内部メソッド／抽象操作の節すべてに同型で出現）:

```html
<dl class="header">
  <dt>for</dt>
  <dd>an ordinary object _O_</dd>
</dl>
```

これは ecmarkup が節のシグネチャ情報（"for ～" 等）を表すのに使う定義リスト。

## 原因

1. `ecma-spec.css` に `dl/dt/dd` のルールが**一つも無い** → ブラウザ既定の block
   レイアウトが適用される。
   - `<dt>`（"for"）は block → 単独行
   - `<dd>`（"an ordinary object O"）は block かつ `margin-inline-start: 40px` →
     次行に字下げ
   - 結果、"for" で改行されて見える。
2. より本質的な原因：`build-chapters.mjs` は ecmarkup
   の**ソースHTML（未加工）をそのまま注入**しており、ecmarkup の **structured
   header 変換**を通していない。
   - 公式サイトはビルド時にこの変換を通すため、`dl.header`
     は消えて説明文になる。
   - つまり「for
     で改行」は、変換工程を経ていない生ソースを表示していることが本質で、CSS
     が無いのはその一部にすぎない。
3. これは今回のタイポグラフィ変更（grid 化等）とは**無関係の既存問題**。grid
   化前から dt/dd は block 既定だった。

## 規模

- `dl.header` は es2026 ソースだけで **786
  箇所**。内部メソッド／抽象操作の節すべてに出る。

## 「公式サイトで "for" は太字か?」→ 原本に "for" は存在しない

- 公式 `ecmarkup.css` には `dl.header`/`dt`/`dd` のCSSが**一切ない**。
- ecmarkup の structured header 機能が `<h1>` シグネチャ + `<dl class="header">`
  を**一つの説明文に変換**するため。
- 公式のレンダリング後HTML（tc39.es 実物）:

```html
<h1>…[[GetPrototypeOf]] ( )</h1>
<p>
  The [[GetPrototypeOf]] internal method of an ordinary object obj takes no
  arguments and returns a normal completion containing either an Object or null.
  It performs the following steps when called:
</p>
<emu-alg>…</emu-alg>
```

- よって "for" という語も `dl` も出てこない。「for が太字か」は成立しない。
- 補足：原本は `obj`、手元の es2026 ソースは `_O_`。これは editor's draft
  との版の違いで本件とは無関係。

## 適用済みの暫定修正（CSS）

`lume/styles.css` に追加済み（`deno fmt` 構文OK）:

```css
/* ecmarkup clause "header" list — the signature metadata (for / description /
   etc.) under a clause heading. Without a rule the dt/dd fall back to default
   block layout, dropping the label ("for") onto its own line and indenting the
   value. Render each entry inline so it reads "for an ordinary object O", one
   line per dt/dd pair. */
.ecma-spec dl.header {
  margin-block: 1em;
}
.ecma-spec dl.header dt {
  display: inline;
  font-weight: 600;
}
.ecma-spec dl.header dt::after {
  content: "\00a0";
}
.ecma-spec dl.header dd {
  display: inline;
  margin: 0;
}
.ecma-spec dl.header dd::after {
  content: "";
  display: block;
}
```

これで生の dl.header が「**for** an ordinary object
_O_」と1行で表示され、改行バグは解消する。ただし公式の見た目（説明文）とは異なる独自表示になる。

## 未決：進め方の分岐

1. **このまま CSS で（軽量・適用済み）**
   - 改行は直る。ただし全786箇所が「for
     ～」のラベル表示になり、公式の説明文スタイルにはならない。
   - "for" の太字は外すことも可能。
2. **公式に忠実にする（大きめの変更）**
   - `build-chapters.mjs` に structured-header 変換を実装し、`<h1>` ＋
     `dl.header` から 「The … internal method of … takes … and returns …. It
     performs the following steps when called:」を生成。
   - 原本と同じ見た目になるが、シグネチャ解析の実装が必要。別タスク扱い。

---

# 追記: 16th 10.1.1 の公式 vs 当サイト 全差分比較

"for 改行" は単独の不具合ではなく、もっと広い **「structured header
未変換」問題**の一側面だと判明した。16th(ES2025) の 10.1.1
を公式（tc39.es/ecma262/2025/）と当サイトで突き合わせた結果。

## 公式 ES2025（レンダリング後HTML、実物）

```html
<h1>
  <span class="secnum">10.1.1</span><var class="field">[[GetPrototypeOf]]</var>
  ( )
</h1>
<p>
  The <var class="field">[[GetPrototypeOf]]</var> internal method of an
  <a>ordinary object</a> <var>O</var> takes no arguments and returns a
  <a>normal completion containing</a> either an Object or <emu-val
  >null</emu-val>. It performs the following steps when called:
</p>
<emu-alg>…</emu-alg>
```

## 当サイトの生成結果

```
### 10.1.1 [[GetPrototypeOf]] ( ): a normal completion containing either an Object or **null**
<dl class="header"><dt>for</dt><dd>an ordinary object O</dd></dl>
<emu-alg>…</emu-alg>
```

## 差分一覧（10.1.1）

| 項目           | 公式 ES2025                                                                                                                                               | 当サイト                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 見出し         | `10.1.1 [[GetPrototypeOf]] ( )`                                                                                                                           | `… ( ): a normal completion containing either an Object or null`（戻り値注釈が付く） |
| 前文           | 生成文「The [[GetPrototypeOf]] internal method of an ordinary object _O_ takes no arguments and returns …. It performs the following steps when called:」 | **無し**。代わりに生の `dl.header`「for an ordinary object O」                       |
| 内部スロット名 | `<var class="field">[[GetPrototypeOf]]</var>`（専用スタイル）                                                                                             | 平文（h1内のタグは除去される）                                                       |
| xref リンク    | 前文内の "ordinary object" / "normal completion containing" がリンク                                                                                      | 前文が無いので存在しない                                                             |

## パイプライン上の該当箇所

- `build-chapters.mjs` の `parseTree`（:137-139）が `<h1>`
  のテキストを**丸ごと**タイトル化（戻り値注釈 `: …` も含む）。
- `renderMdxTree`（:211）がそのタイトルを見出しに出力。
- h1 内のタグは `replace(/<[^>]+>/g, '')`
  で除去されるため、`<var class="field">` 等のマークアップも失われる。

## ecmarkup の structured header 変換がやっていること（当サイトが省略している処理）

1. h1 シグネチャ `Name ( params ): ReturnType` を解析し、**見出しには
   `Name ( params )` だけ残す**。
2. 戻り値型 ＋ `dl.header`（for / description /
   effects）から**前文の説明文を生成**。
3. `[[Slot]]` を `<var class="field">` で包む。

→ 「見出しの `: 戻り値`」と「"for" 行」は**同じ機能の別側面**。CSS
だけでは見出し注釈・前文生成は直せない。

## 影響範囲（es2025）

- 戻り値注釈付き見出し（`( … ): 型`）：**120+ 箇所**（タグ無し h1
  のみを数えた下限値）。
- `dl.header`：**771 箇所**。
- `var class="field"` はソースに **0**（ecmarkup
  が生成するものなので当サイトには出ない）。
- 全4版（es2024/es2025/es2026/draft）で同型。

## 結論

きれいに直すには上記「選択肢2（build-chapters に structured-header
変換を実装）」が、見出し・前文・"for"・field
をまとめて解決する唯一の道。CSS（選択肢1）は "for"
の改行だけを応急処置するもので、見出し注釈や前文欠落は直らない。

---

# 実装結果（選択肢2を採用）

`build-chapters.mjs` に ecmarkup の structured-header
変換を移植して実装した（src/header-parser.ts の parseHeader / formatHeader /
formatPreamble、src/Clause.ts の発動条件の port）。

## 実装内容

- 追加ヘルパー：`parseStructuredH1`（h1シグネチャ解析）, `formatSimpleParamList`
  / `formatParamsClause`（引数整形）, `formatHeaderTitle`（見出し）,
  `parseHeaderDl`（for/description抽出）,
  `buildStructuredBody`（前文生成＋末尾文の配置）, `formatEnglishList`。
- 発動条件：`<h1>` の直後に `<dl class="header">` が来るクローズ（ecmarkup の
  `extractStructuredHeader` と同じ）。
- 見出しから戻り値注釈を除去（`type="sdo"` は引数リストも除去）。
- 前文 `<p>` を生成し dl を置換。種別ごとの定型文（abstract operation /
  host-defined / implementation-defined / syntax-directed / internal・concrete
  method of <for>）。
- description は inline なら前文に連結、ブロック(`<p>…`)なら別段落。
- 末尾文（"It performs the following steps when called:" / SDOは "It is defined
  piecewise over the following productions:"）は、直後が emu-alg/emu-grammar
  のときのみ付与。note 挟み・block description のときは別 `<p>` として
  alg/grammar の直前に挿入（ecmarkup と同じ）。
- 暫定の `.ecma-spec dl.header` CSS は不要になったので撤去。

## 検証

- 全4版（es2024/es2025/es2026/draft）再生成後、残存 `dl.header` = **0**。
- 公式 ES2025 と一致を確認：
  - 10.1.1 `[[GetPrototypeOf]] ( )`（internal method, for, no args）
  - 5.2.3.1 Completion（typed引数 + inline description）
  - 6.1.6.1.1 Number::unaryMinus（numeric method → "abstract operation"）
  - 7.1.4.1.2 StringNumericValue（sdo, 引数除去, note後に "It is defined
    piecewise…" 分離挿入）
  - concrete method（HasBinding）/ host-defined / implementation-defined /
    optional 引数（EvaluateImportCall）/ 複数typed引数の englishList
- es2025 を `next dev` で実レンダリング：該当ページ HTTP
  200・コンパイルエラー無し、見出し・前文とも正しく描画。

## 既知の非対応（許容）

- **autolink** は非対応。公式では "Completion Record" / "ordinary object" /
  "syntax-directed operation"
  等が定義クローズへのリンクになるが、当サイトはプレーンテキスト（用語→クローズの対応表が必要なため別機能）。テキスト内容は一致。
- `[[Slot]]` は平文表示（公式は `<var class="field">`
  で着色のみ。テキストは同一）。
- 編集用の `<ins>/<del>/<mark>`
  ラッパは未対応（公開版スナップショットには出現しない）。
