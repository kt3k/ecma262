# lume-poc vs Nextra: モバイルサイドバー挙動の差分

対象: `≤767px` の幅で、ハンバーガーから出現する全画面オーバーレイのサイドバー。

参照コード:

- lume-poc:
  `lume-poc/_includes/{header,sidebar,page}.tsx`、`lume-poc/styles.css`
- Nextra: `packages/site-draft-nextra/node_modules/nextra-theme-docs/dist/`
  - `components/sidebar.js`
  - `components/navbar/index.client.js`
  - `stores/menu.js`
  - `style.css`

## 1. 状態管理の方式

- **Nextra**: Zustand store (`stores/menu.js:3`
  `useMenuStore({hasMenu})`)。React
  コンポーネントが購読し、`setMenu(true/false)` で開閉。
- **lume-poc**: ストアなし。`document.body.classList.toggle("menu-open")` +
  `document.documentElement.classList.toggle("menu-open")` を直接書き換える
  (`page.tsx:147-153`)。

## 2. メニューを閉じるトリガー

| トリガー                     | Nextra                                                    | lume-poc               |
| ---------------------------- | --------------------------------------------------------- | ---------------------- |
| ハンバーガー再クリック       | ○ (`navbar/index.client.js:235`)                          | ○ (`page.tsx:163-165`) |
| Esc キー                     | ×                                                         | ○ (`page.tsx:166-168`) |
| サイドバー内リンクをクリック | ○ (`sidebar.js:184` `handleClick = () => setMenu(false)`) | × (※下記)              |
| pathname / hash 変化         | ○ (`sidebar.js:343, 603` `useEffect → setMenu(false)`)    | ×                      |

lume-poc
は静的サイトでフルページ遷移なので、章リンク押下時はメニューごと次のページに置き換わって結果的に閉じる。ただし
**同章内アンカーへのジャンプではメニューが開いたまま** になる
(現状は問題顕在化せず、将来 SPA 化したら効く)。

## 3. DOM 構造

- **Nextra**: モバイル専用に **別の `<aside class="nextra-mobile-nav">`**
  をレンダー (`sidebar.js:333-442` `MobileNav`)。デスクトップの
  `<aside class="nextra-sidebar">` (`sidebar.js:447 Sidebar`) とは別
  DOM・別スクロール状態。
- **lume-poc**: **同じ `<aside class="sidebar">` を CSS だけで切り替え**
  (`styles.css:920` の `@media (max-width:767px)` 内で
  `position: fixed; inset: 0; transform: translate3d(0,-100%,0)`)。DOM は 1 つ。

含意: Nextra ではモバイル ↔
デスクトップを跨ぐとサイドバーのスクロール位置がリセットされる (別
DOM)。lume-poc は同じ要素なので保持される。

## 4. パネル内のフッター

- **Nextra MobileNav** (`sidebar.js:417-420`):
  `<ThemeSwitch className="x:grow"/>` +
  `<LocaleSwitch className="x:grow x:justify-end"/>` を `x:mt-auto`
  で下端固定。collapse トグルは出さない。
- **lume-poc**: フッター (テーマトグル + collapse) は DOM に残るが、collapse は
  `.sidebar-collapse-btn { display:none }` (`styles.css:953`)
  で消える。`.sidebar-footer` は `<aside>` の grid `auto 1fr auto` 3
  行目に残るが、**全画面の下端まで見えない**
  のでテーマトグルは実質非可視。Locale switch は元から無い。

**挙動差**: モバイルでは Nextra ならテーマと言語が切り替えられる。lume-poc
では事実上不可能。

## 5. アクティブ章を中央へスクロール

- **Nextra** (`sidebar.js:361-385`): `scroll-into-view-if-needed` パッケージで
  `block:"center", scrollMode:"always", boundary: sidebar.parentNode`。`menu`
  ステートが true になるたびに発火する `useEffect`。
- **lume-poc** (`page.tsx:158-161`): ネイティブ
  `Element.scrollIntoView({block:"center", inline:"center"})`。`scrollMode:"always"`
  相当 (既に画面内でも強制再スクロール) はブラウザ実装依存。

ほぼ同等。boundary
指定の有無で「親をはみ出るまで再帰スクロールしない」境界制御に差が出るが、現状の
DOM では問題なし。

## 6. 検索ボックス

- **Nextra** (`sidebar.js:400`): `themeConfig.search` というプロップを
  **MobileNav 側でも再レンダー**。React コンポーネントなのでナビバー側と同じ
  store / state を共有 (入力値が両者で同期)。
- **lume-poc** (`sidebar.tsx:29-40`): `<div class="site-search sidebar-search">`
  を **独立してマウント**。`search.js` が `querySelectorAll(".site-search")`
  を回して **個別に初期化**。

**挙動差**:
ユーザーがデスクトップ幅でナビバー検索に文字を打ち、画面を縮めてモバイルになると、サイドバー検索の
input は空。Nextra ではテキスト・結果ともに引き継がれる。

## 7. 背景スクロールロック

- **Nextra**: `<html>.x:max-md:overflow-hidden` をトグル
  (`stores/menu.js:10`)。`max-md` Tailwind ユーティリティの中で
  `overflow:hidden` を当てる (`style.css:1837`)。
- **lume-poc**: `html.menu-open { overflow: hidden }` を
  `@media (max-width:767px)` 内に置く (`styles.css:947`)。

効果は同じ。記述箇所が違うだけ。

## 8. パネルのスライドイン

両者完全一致:
`transform: translate3d(0,-100%,0) ↔ (0,0,0)`、**トランジションなし**
(スナップ)。`overscroll-behavior: contain` と `contain: layout style` も
lume-poc にコピー済み (`styles.css:933, 937`)。

バナー対応: Nextra は `.nextra-banner ~ &` セレクタで `padding-top` を
banner+navbar 高に増やすルールあり (`style.css:2482-2484`)。lume-poc
はバナーがないので未対応 (将来出すなら追加要)。

## 9. ハンバーガーアイコン

- **Nextra** (`navbar/index.client.js:186`):
  `<MenuIcon className={cn({open: menu})}>` → `.nextra-hamburger.open` で X
  に変形 (`style.css:3070-3108`)。
- **lume-poc** (`header.tsx:105-122` + `styles.css:837-887`): 同じ 3-piece SVG
  (2 つの `<g>` + 真ん中の `<path>`)、同じ cubic-bezier、同じ transition
  タイミング、同じ rotation +45/-45 deg + translate ±6px。差は
  **クラスのトリガーが `body.menu-open .menu-toggle svg` か
  `.nextra-hamburger.open svg` か** だけ。

## 10. a11y 属性

- **Nextra**: ハンバーガーは `<Button aria-label="Menu">`。`aria-expanded` /
  `aria-controls` は **付かない** (`navbar/index.client.js:186`)。
- **lume-poc** (`header.tsx:90-97`, `page.tsx:154`):
  `aria-label="Open navigation menu"` + `aria-controls="sidebar"` +
  `aria-expanded` を状態連動で更新。

lume-poc のほうが仕様準拠。

## 11. z-index

両者完全一致:

| 要素                       | 値                    |
| -------------------------- | --------------------- |
| navbar                     | 30                    |
| モバイルパネル             | 20                    |
| ハンバーガー (navbar の子) | 30 経由でパネルより上 |

## 実害が出る差 (要対応候補)

1. **検索入力が画面幅切り替えで失われる** (lume-poc) — `search.js`
   を改修してインスタンス間で値を同期させれば解消。
2. **モバイルでテーマトグルにアクセス不可** (lume-poc) —
   フッターの位置が下端のため。`.sidebar-footer` を
   `position: sticky; bottom: 0` でモバイル時のみ常時可視にすれば解決。
3. **同章内アンカークリックでメニューが閉じない** (lume-poc) —
   現在は同章リンクが基本ないので顕在化していないが、`#content`
   内のアンカークリックや prev/next ボタンなどに `setMenu(false)`
   相当を入れておくと安全。

それ以外
(パネル構造・スライドイン・スクロールロック・アクティブ章スクロール・ハンバーガーアニメ)
は実装方式が違うだけで挙動はほぼ同等。

## 追加調査で見つかった差分

### A. モバイルメニュー内にページ内 TOC が出るかどうか

- **Nextra**: `MobileNav` の `<Menu>` は `directories` (章) と `anchors` (h2
  配列) の両方を受け取り (`sidebar.js:408`)、アクティブな `File` の下に `<ul>`
  でインライン展開 (`sidebar.js:249-258`)。`useActiveAnchor()`
  で現在見出しがハイライトされ、選択すると `handleClick` (`sidebar.js:183`) が
  `setMenu(false)` を呼んで閉じる。
- **lume-poc**: モバイル時に `<aside class="toc">` は `display:none`
  (`styles.css:894` の `@media (max-width:1100px)`)。サイドバー内にも h2
  アンカーは入っていない。**モバイルでページ内ジャンプする手段が一切ない。**

### B. アクティブ見出しのハイライト (scrollspy)

- **Nextra**: `mdx-components/heading-anchor.client.js:13` で
  `IntersectionObserver` を作って各見出しを observe → `setActiveSlug(slug)`。
  Zustand store 経由で `useActiveAnchor()` を購読する MobileNav の `<a>` が
  `classes.active` を付け替える。
- **lume-poc**: IntersectionObserver なし。TOC は `_config.ts`
  のポスト処理で静的にビルドされるだけ。

### C. 検索結果クリック時のメニュー自動クローズ

- **Nextra** (`nextra/dist/client/components/search.js:222-235`):
  - 同一ページ → `location.href = "#hash"` → `useHash()` 更新 → MobileNav の
    `useEffect([pathname, hash])` (`sidebar.js:343, 603`) が `setMenu(false)`
  - 別ページ → `router.push()` → 同じく pathname watcher が閉じる
- **lume-poc**: 検索結果は素の `<a href="…">` (`search.js:115-119`)。
  - 別ページ → フル HTML 遷移でメニューごと吹き飛ぶ (OK)
  - **同一ページの `#hash` → メニューが開いたまま**

### D. Esc キー処理の衝突

- **Nextra**: モバイルメニュー側に Esc ハンドラなし。検索 Combobox (Headless UI)
  が Esc を自分で食って閉じる。
- **lume-poc**: `document` レベルに 2 つの keydown リスナーが並存:
  - `search.js:187-191` — 検索パネルを閉じる
  - `page.tsx:166-168` — モバイルメニューを閉じる
  - 検索パネルがメニュー内で開いた状態で Esc → **両方同時に閉じる**

### E. プリントスタイル

- **Nextra**: navbar / sidebar に `x:print:hidden` (`sidebar.js:519`,
  `navbar/index.js:36`)。
- **lume-poc**: `@media print` ルールがゼロ。**印刷時に紙面にヘッダーと
  サイドバーが出る。**

### F. dvh vs vh

- **Nextra デスクトップサイドバー**: `100dvh - navbar` (`style.css:516-517`)。
- **lume-poc**: `100vh - --header-h` (`styles.css:391`)。
- モバイル全画面パネルは両者 `inset:0` 系で影響なし。リサイズ過渡や iOS Safari
  URL バー伸縮で僅差。

### G. role / aria-modal

両者ともモバイルメニューを `<aside>` でレンダー、`role="dialog"` や
`aria-modal="true"` は付けない。フォーカストラップなし。同等。

### H. リサイズ時の挙動

- **Nextra**: メニューストアはリサイズに反応しない。デスクトップ幅にすると
  `x:md:hidden` で見えなくなるが store の `hasMenu` は `true` のまま。
- **lume-poc**: `body.menu-open` も保持される。**ハンバーガーの
  `aria-expanded="true"` がリサイズ後も残る** (`page.tsx:154`) — a11y
  ツリーで「開いている」扱いの不整合。

### I. バナー対応

- **Nextra**: `.nextra-banner ~ &` セレクタで MobileNav の `padding-top` を
  `banner + navbar` 高に拡張 (`sidebar.js:392`)。
- **lume-poc**: バナー機能なし。将来追加時に padding 調整が必要。

### J. アクティブ章スクロールの境界制御

- **Nextra**: `scroll-into-view-if-needed` で `boundary: sidebar.parentNode`
  指定 (`sidebar.js:373`)。
- **lume-poc**: ネイティブ `Element.scrollIntoView()`。boundary なし。

## TODO

実害ベースで降順:

- [x] **#1** A: モバイル時にページ内 TOC が出ない (主要ナビ機能の欠落) —
      `_config.ts` で `.current` `<li>` の下に anchor 一覧を
      inject、`styles.css` で `@media (max-width:1100px)` のとき表示
- [x] **#2** B: scrollspy なし — `IntersectionObserver` で active anchor を
      追跡し、サイドバー TOC とアサイド TOC 両方の `<a>` に `.active` を付与
- [x] **#3** C: 検索の同一ページハッシュでメニューが閉じない — `search.js`
      の結果 `<a>` クリックで `document.body.classList.remove("menu-open")`
      相当を発火
- [x] **#4** D: Esc ハンドラの 2 重発火 — `search.js` 側で `e.stopPropagation()`
      するか、`page.tsx` 側で `openInstance()` がある場合は早期 return
- [x] **#5** E: 印刷スタイル無し —
      `@media print { aside.sidebar, .site-header, aside.toc { display:none } }`
- [ ] **#6** H: aria-expanded がリサイズで残る —
      `matchMedia("(max-width:767px)")` の `change` リスナーで mobile を抜けたら
      `setMenu(false)` 相当
- [ ] **#7** F: dvh 未使用 — `100vh` → `100dvh` (フォールバック付き)
- [ ] **#8** I: バナー対応 — 該当機能が出来てから対応

前回ドキュメントに無かった項目: **A・B・D・E・H**。

### 既出 (上の「実害が出る差」より)

- [ ] **#9** 検索入力が画面幅切り替えで失われる
- [ ] **#10** モバイルでテーマトグルにアクセス不可
- [ ] **#11** 同章内アンカークリックでメニューが閉じない (#3 と類似)
