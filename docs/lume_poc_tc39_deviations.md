# lume-poc があえて tc39.es と変えている点

`docs/lume_poc_tc39_alignment.md` が「tc39.es に**寄せた**作業ログ」なのに
対し、こちらは本文 (`.ecma-spec` 配下) のタイポグラフィ／配色のうち **あえて
tc39.es と揃えずに lume-poc 独自のまま維持している点**をまとめる。 将来「tc39
と違う＝バグ」と誤解して直されないための備忘録。

参照:

- tc39.es CSS: `https://tc39.es/ecma262/assets/css/ecmarkup.css`
- lume-poc CSS: `lume-poc/styles.css`

## 一覧

| 項目                                       | tc39.es             | lume-poc（維持）                 | 理由                                |
| ------------------------------------------ | ------------------- | -------------------------------- | ----------------------------------- |
| 本文 line-height                           | `1.5`               | **`1.65`**                       | 少し広めの行送りを好みで採用        |
| 本文色（light）                            | `#111`              | **`#111827`**（`--fg`）          | lume の chrome と共通パレットに統一 |
| 本文色（dark）                             | `#fcfcfc`           | **`#e5e7eb`**（`--fg`）          | 同上（純白より少し落とした明度）    |
| `<emu-const>` / `<emu-gprose>` font-family | `'IBM Plex Sans'`   | **system sans（`--font-sans`）** | Plex Sans は webfont 未読み込み     |
| 節番号 `.secnum` のフォント                | monospace（`tnum`） | **本文フォント（sans/serif）**   | 数字を本文と馴染ませる意図          |

> 注: font-size 18px・IBM Plex Serif / Mono の webfont・`slashed-zero`・
> 見出しスケール・`emu-nt`/`emu-xref` のリンク色などは tc39 に**揃えている**
> （`lume_poc_tc39_alignment.md`
> 参照）。ここに挙げたのは意図的に**外した**もの。

## 1. 本文 line-height（`1.65` / tc39 `1.5`）

- tc39.es: `body { line-height: 1.5 }`
- lume-poc: `main[data-pagefind-body] { line-height: 1.65 }`

font-size は 18px に揃えた（tc39 と同じ）が、行送りだけは 1.65 を維持。
計算後の行高は lume 29.7px / tc39 27px。

該当: `lume-poc/styles.css` の `main[data-pagefind-body]`（コメントにも 「tc39
uses 1.5 — we keep the slightly airier measure deliberately」と明記）。

## 2. 本文色（lume は `--fg` 独自パレット）

| モード | tc39.es (`--foreground-color`) | lume-poc (`--fg`) |
| ------ | ------------------------------ | ----------------- |
| light  | `#111`                         | `#111827`         |
| dark   | `#fcfcfc`                      | `#e5e7eb`         |

- tc39.es は chromeless なので地の文をほぼ純黒／純白に振っている。
- lume-poc はヘッダ／サイドバー／フッタ（chrome）と同じ `--fg` を本文にも
  使い、ページ全体で配色を統一する方針。tc39 とは light で青み寄りの暗
  グレー、dark で純白より落とした明度になる。

### 副作用: `emu-nt` リンクとのコントラスト

`emu-nt a` のリンク色（`#333` / dark `#d0d0d0`）は **tc39 と同一**だが、
地の文色が違うため「地の文 ↔ emu-nt」のコントラスト比がわずかにずれる:

|            | 地の文    | emu-nt    | 比       |
| ---------- | --------- | --------- | -------- |
| lume light | `#111827` | `#333`    | 1.40 : 1 |
| tc39 light | `#111`    | `#333`    | 1.49 : 1 |
| lume dark  | `#e5e7eb` | `#d0d0d0` | 1.25 : 1 |
| tc39 dark  | `#fcfcfc` | `#d0d0d0` | 1.50 : 1 |

特に dark で lume の方が emu-nt が地の文に溶け込みやすい（1.25 vs 1.50）。
これは本文色を独自に維持した結果であり、許容する。地の文↔背景・emu-nt↔
背景はいずれも 11〜19:1 と高く、可読性／アクセシビリティ上の問題はない。

該当: `lume-poc/styles.css` の `:root` / `html.dark` の `--fg`。

## 3. `<emu-const>` / `<emu-gprose>` のフォント（system sans 維持）

- tc39.es: どちらも `font-family: 'IBM Plex Sans', sans-serif`。
- lume-poc: `var(--font-sans)`（`-apple-system` 等の system sans）。

IBM Plex Serif / Mono は webfont として読み込んだが、**Plex Sans は読み
込んでいない**。Sans を使うのは `emu-const`・`emu-gprose`・`figcaption`
程度と少なく、system sans で十分近いと判断してフォント追加を見送った。
small-caps / uppercase / italic などの装飾は tc39 に合わせてある。

該当: `lume-poc/styles.css` の `.ecma-spec emu-const` /
`.ecma-spec emu-grammar emu-gprose`（コメントに「We keep our system-sans token
(--font-sans) rather than loading IBM Plex Sans」）。

将来 Plex Sans を入れて完全一致させたくなったら `@font-face` 追加 +
`--font-sans` の先頭に `"IBM Plex Sans"` を足すだけでよい。

## 4. 節番号 `.secnum` のフォント（本文フォント維持）

- tc39.es: グローバル `.secnum` を monospace（`font-feature-settings:"tnum"`）
  でレンダリング。
- lume-poc: 節番号を本文フォント（sans / serif）のまま表示し、monospace に
  しない。見出し内の `h1 .secnum` にも monospace 指定を入れていない。

数字を等幅にせず本文と馴染ませる意図。なお tc39 の TOC は monospace の `.secnum`
を持つぶん行ボックスが 2x ディスプレイで約 0.5px 高くなるため、 lume 側は TOC
の行間（`aside.toc li + li`）に `+0.5px` を足してリズムを
揃えている（これも本項の派生対応）。

該当: `lume-poc/styles.css` の `h1 .secnum` / `aside.toc li + li`
（コメントに「lume keeps the number in the sans body font (by design)」）。

## 補足: ページ chrome 全体

ヘッダ／サイドバー／右 TOC／フッタは tc39.es ではなく Nextra 由来の
デザインを踏襲している。これは PoC の目的（Nextra → Lume 移行で同じ
DOM/見た目を再現する）そのものなので、本ドキュメントの「本文タイポ
グラフィの意図的相違」とは別軸。詳細は `docs/lume_design_alignment.md` /
`docs/lume_migration.md` を参照。
