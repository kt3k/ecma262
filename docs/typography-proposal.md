# タイポグラフィ改善提案 — Ghost "Edition" テーマからの応用

`edition.ghost.io`（Ghost 公式 Edition
テーマ）のタイポグラフィを実測・分析し、本仕様書サイト（`lume/styles.css`）へ取り込む価値のある手法をまとめる。

## 背景

仕様書は読み方が二極化する:

- **散文（段落・手順の説明）** …
  行が長すぎると読みにくい。読み幅を狭く抑えたい。
- **表・図・コード・長い algorithm** …
  狭いと窮屈。本文より広げたい、時に画面いっぱいに出したい。

現状の Nextra は本文幅が一律なので、この相反を解消できていない。

## Edition の実測値

| 項目                 | 値                                                               |
| -------------------- | ---------------------------------------------------------------- |
| ルート               | `html { font-size: 62.5% }` → 1rem = 10px                        |
| 本文 (`.gh-content`) | `--content-font-size: 1.7rem` = 17px                             |
| 本文 line-height     | 1.6                                                              |
| 読み幅 (measure)     | `--content-width: 720px`（約 75〜80 字/行）                      |
| フォント対           | 見出し = Lora (serif) / UI・本文 = Mulish (sans)                 |
| 見出しスケール       | content 内 h2 `1.6em` / h3 `1.4em`（em 相対）                    |
| 見出し字間           | `letter-spacing: -0.01em`                                        |
| 縦リズム             | `margin-top: calc(1.6em * var(--content-spacing-multiplier, 1))` |

---

## 提案 1（最重要）: CSS Grid 名前付きラインによる measure 制御

### 狙い

本文テキストは常に快適な読み幅（約
720px）に固定しつつ、図・表・コードなど個別要素だけを外側へ「逃がして」広げられるようにする。マイナスマージンや絶対配置のハックを使わない。

### 仕組み

本文コンテナを、幅の異なる入れ子の列（トラック）を持つ Grid
にし、各列境界に名前を付ける。

```css
.gh-canvas {
  --gap: 2rem;
  --content-width: 720px; /* 本文の読み幅 */
  --container-width: 1200px; /* wide 時の最大幅 */

  --main: min(var(--content-width), 100% - var(--gap) * 2);
  --wide: minmax(0, calc((var(--container-width) - var(--content-width)) / 2));
  --full: minmax(var(--gap), 1fr);

  display: grid;
  grid-template-columns:
    [full-start] var(--full)
    [wide-start] var(--wide)
    [main-start] var(--main) [main-end]
    var(--wide) [wide-end]
    var(--full) [full-end];
}
```

横方向に入れ子の帯ができる:

```
[full-start]                                                   [full-end]
   │   [wide-start]                                 [wide-end]   │
   │      │      [main-start]            [main-end]      │       │
   │ full │ wide │   main (720px本文)    │ wide        │ full   │
   ◄─────────────── full (画面いっぱい) ──────────────────────►
          ◄──────────── wide (約1200px) ─────────────►
                 ◄──── main (720px) ────►
```

- **main** … 中央 720px。読み幅。
- **wide** … main の左右に張り出す帯（合計 約1200px）。
- **full** … さらに外側、画面端まで。

### 使い方

デフォルトで全子要素を `main` 列に置き、広げたい要素だけ列を上書きする。

```css
.gh-canvas > * {
  grid-column: main;
} /* 本文は狭く */
.kg-width-wide {
  grid-column: wide-start / wide-end;
} /* 約1200px */
.kg-width-full {
  grid-column: full-start / full-end;
} /* 画面いっぱい */
```

### 本仕様書サイトへの適用例

```css
.gh-content > * {
  grid-column: main;
} /* 散文は狭く読みやすく */
.gh-content emu-table,
.gh-content emu-figure,
.gh-content emu-alg.wide {
  grid-column: wide;
} /* 表・図・長い手順は広く */
```

### 利点

- 本文の measure が常に一定 → 読みやすさが崩れない。
- 広げたい要素は `grid-column` を 1 行変えるだけ。
- 中央寄せ・左右対称の計算を Grid が自動で行う。

---

## 提案 2: em ベースの縦リズム + 調整ノブ 1 個

余白をすべて `em`（フォントサイズ相対）で定義し、`--content-spacing-multiplier`
1
変数で全体の密度を一括調整できるようにする。見出し前後で間隔を変え、見出しと後続段落を近く・前の段落とは離して塊感を作る。

```css
.gh-content > * + * {
  margin-top: calc(1.6em * var(--content-spacing-multiplier, 1));
}
.gh-content > [id] + * {
  margin-top: calc(0.8em * var(--content-spacing-multiplier, 1));
} /* 見出し直後は詰める */
```

## 提案 3: 見出しスケールも em 相対

```css
.gh-content h2 {
  font-size: 1.6em;
}
.gh-content h3 {
  font-size: 1.4em;
}
```

本文サイズを変えれば見出しも比例して動くので、スケール全体が崩れない。

## 提案 4: 大見出しに負の字間

大きい文字は字間が間延びして見えるため僅かに詰める。本文は 0 のまま。

```css
.gh-content :is(h1, h2, h3) {
  letter-spacing: -0.01em;
}
```

## 提案 5: 行長・行間のゾーン

本文 17px・行間 1.6
はロングフォームの定番。現状より少し大きめで疲れにくい。仕様書の本文サイズ・行間をこの帯に寄せる。

## 提案 6（任意）: セリフ見出し × サンセリフ UI

長文の階層は serif で表情を付け、ナビ等の chrome は sans
で機能的に。役割でフォントを分ける。仕様書では可読性・既存トーンとの兼ね合いで採否を検討。

---

## 優先度・リスク

| 提案                 | 効果 | リスク | 備考                               |
| -------------------- | ---- | ------ | ---------------------------------- |
| 1. Grid measure      | 大   | 中     | レイアウト骨格に関わる。要動作確認 |
| 2. em 縦リズム       | 中   | 低     | 既存 CSS へ加算しやすい            |
| 3. em 見出しスケール | 中   | 低     |                                    |
| 4. 負の字間          | 小   | 低     |                                    |
| 5. 行長・行間        | 中   | 低     |                                    |
| 6. フォント対        | 中   | 中     | トーン変更を伴う。要合意           |

## 次のステップ（案）

1. 提案 1 を `ecma-spec.css` に試験導入し、1 チャプターで表・図の wide
   化を確認。
2. 問題なければ 2〜5 を低リスク順に追加。
3. 6 は別途デザイン合意のうえ判断。
