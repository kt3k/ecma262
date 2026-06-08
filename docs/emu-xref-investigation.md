# 調査メモ: Issue 1（`<emu-xref>` 空タグ）の解決は部分的

`issues.md` の Issue 1「`<emu-xref>` 空タグ (796/844 件)
がリンクテキストごと欠落」は `[x]`（完了）になっているが、実際には **clause
参照だけ**が直っており、それ以外の参照は 別の形で壊れている。

## 背景

ecmarkup はビルド時に
`<emu-xref href="#id"></emu-xref>`（空タグ）の中へ、参照先の
番号やラベル（「12.9.3」「Table 6」「step 5」等）を注入する。当サイトはソース
HTML を `dangerouslySetInnerHTML` で素のまま描画するため、`build-chapters.mjs`
の `applyXrefSubst` で空タグを解決して埋め込んでいる。

## 実測（es2025）

- `<emu-xref>` 総数: **991**、うち空タグ: **930**
- 空タグの参照先 prefix 別内訳:

| 参照先        | 件数 | 状態                                  |
| ------------- | ---- | ------------------------------------- |
| `sec-*`（節） | ~725 | ✅ 「12.9.3」等の節番号＋リンクに解決 |
| `table-*`     | ~180 | ❌ 生 id が本文に露出                 |
| `step-*`      | ~80  | ❌ 生 id が本文に露出                 |
| `figure-*`    | ~3   | ❌ 生 id が本文に露出                 |
| `note-*`      | ~1   | ❌ 生 id が本文に露出                 |

**生 id 露出 合計 ≈ 264 件。**

### 露出の実例（生成 JSX）

- 「The entries in **table-additional-well-known-intrinsic-objects** are added
  to **table-well-known-intrinsic-objects**」
- 「Iterator Records have the fields listed in
  **table-iterator-record-fields**」
- 「**step-json-parse-parse**」

本来は「Table 1」「Table 6」「step 5」のように表示されるべき箇所。

## 原因

`src/scripts/build-chapters.mjs` の `applyXrefSubst`:

```js
const s = idToSection.get(m[1]);
if (!s) return m[1]; // ← 解決できないと「生の id 文字列」をそのまま本文に出す
```

`idToSection` には **emu-clause / emu-annex / emu-intro の id
しか登録していない** （`registerSectionIds`）。そのため table / step / figure /
note への参照は解決できず、 ecmarkup が入れるはずの「Table N」「step N」「Figure
N」の代わりに、`table-tobigint` のような**生のアンカー id が本文に露出**する。

空タグ自体（完全欠落）は消えたが、**同種の「読めない表示」が約 264
箇所残存**しており、 「`[x]` 完了」とは言い切れない。

## 完全解決に必要なこと

- **table / figure**: ソースの `<emu-table>` / `<emu-figure>`
  に出現順で番号を振り、 id → 「Table N」/「Figure N」を
  `idToSection`（または別マップ）に登録してリンク化する。 ecmarkup
  も連番方式。難易度: 低〜中。約 183 件が一気に読めるようになる。
- **note**: 同様に節内のノート番号付け。難易度: 中。件数は少ない（~1）。
- **step**: 最難。`emu-alg` のステップ採番（`1.a.i` …）と id
  の対応が必要だが、`parseAlg` は現状ステップ id を保持していない。ステップ id →
  採番のマップ構築が要る。難易度: 高。
- 応急策: 未解決時のフォールバックを「id 文字列そのまま」にしない（少なくとも生
  id 露出を 避ける）。ただし根本解決は上記の番号登録。

## 推奨着手順

1. table / figure の番号登録（効果大・確実、~183 件）
2. note
3. step（採番マップが必要で重いので最後）
