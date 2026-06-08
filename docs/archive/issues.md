-
  1. [x] `<emu-xref>` の空タグ (796/844 件) がリンクテキストごと欠落
-
  2. [x] `<emu-prodref>` の空タグ (381/381 件) で文法生成規則がまるごと欠落
-
  3. [x] `<emu-grammar>` の中身がプレーンテキストのまま
         (文法ボックス・色分けなし)
-
  4. [x] `<emu-alg>` 内のステップ番号が `1.a.i` の階層採番にならず `1. 2. 3.`
         のまま
-
  5. [x] `<emu-alg>` / `<emu-eqn>` 内の ecmarkup 記号が未変換: `_x_` (→斜体),
         `*foo*` (→太字), `` `foo` `` (→code), `|Foo|` (→非終端リンク), `~enum~`
         (→enum スタイル)
-
  6. [x] `<emu-note>`
         が「Note」ラベル付きの枠で囲まれず、ただのブロックとして表示
-
  7. [x] `<emu-eqn>` が数式スタイルで描画されずプレーンテキスト
-
  8. [x] テキスト入りの `<emu-xref>` (48 件) がクリック可能なリンクにならない

## 詳細

### 1. `<emu-xref>` 空タグ

ecmarkup はビルド時に参照先セクションのタイトル/番号を中に注入する。source HTML
では `<emu-xref href="#sec-foo"></emu-xref>` のように空。dangerouslySetInnerHTML
で素のまま描画するとブラウザは何も表示しない。

解決状況 (build-chapters.mjs):

- 節 (`sec-*`): 番号 + リンクに解決済み。
- 表 / 図 (`table-*` / `figure-*`): 文書通し番号を振り「Table N」/「Figure N」
  リンクに解決。表の caption も「Table N: …」で描画。
- ノート (`note-*`): 節内で複数なら「Note 1」…、単独なら「Note」に解決。
- ステップ (`step-*`): `[id="step-…"]` を `<li>` アンカー化し、階層番号 (`1.d`
  等) に解決。
- 残課題: Unicode プロパティ表 (`table-binary-unicode-properties` ほか計 3 表)
  は ecmarkup がビルド時に Unicode DB から生成する表で、取り込み元の spec.html
  スナップショットに存在しない。アンカーも無いため当サイトでは解決できず、参照は
  生 id 表示のまま残る。詳細は `docs/emu-xref-investigation.md`。

### 2. `<emu-prodref>` 空タグ

全 381 件すべて空。ecmarkup は参照先の `<emu-grammar>`
定義をその場に展開するが、現状はカスタム要素のまま空表示で、本来そこにある文法定義が完全に欠落する。

### 3〜8. スタイル/装飾欠落

SKILL.md の Known limitations に記載済みの「No ecmarkup styling」と同じ原因 —
`nextra-theme-docs/style.css` のみ読み込んでいて ecmarkup の CSS/JS
変換が一切走らない。

## 修正方針の候補

- **A. ビルド時解決**: `scripts/build-chapters.mjs` 内で `emu-xref` /
  `emu-prodref` を spec.html の対応箇所から解決して埋め込む (issue 1, 2 対応)
- **B. ecmarkup CSS 取り込み**: `https://tc39.es/ecma262/ecmarkup.css` を
  `app/layout.jsx` から import (issue 3, 6, 7 を視覚的に近づける)
- **C. ecmarkup 記号 pre-process**: `_x_` などを HTML タグに置換する処理を
  build-chapters.mjs に追加 (issue 5 対応)
- **D. 本家 ecmarkup の出力流用**: `ecmarkup --multipage out`
  の生成物を直接読み込む構成に切り替え (全 issue 一括解消)
