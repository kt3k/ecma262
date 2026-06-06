import VersionSwitcher from "./version-switcher.tsx";
import { specCommitUrl, titleMain, titleQual } from "./editions.ts";

// Top-of-page chrome: site title (link) + status badge (link) + version
// switcher + Pagefind search box. The header is sticky in CSS so it stays put
// while the content scrolls. `<div id="search">` is the mount point Pagefind
// UI hooks into; the index itself is generated post-build (see
// deno task pagefind / the CI step).
//
// Title shape mirrors packages/shared/components/spec-layout.jsx:
//   <b>ECMA-262, 18th, ES2027</b>  <a class="qual-link"><b>draft</b></a>
// — bold main title links home, "draft" is a dotted-underline link to the
// tc39/ecma262 commit. The version-switcher chevron sits beside the title.
export default function Header(
  { basePath, deployBase }: { basePath: string; deployBase: string },
) {
  return (
    <header class="site-header">
      {
        /* Translucent backdrop layer — matches Nextra's
          <div class="nextra-navbar-blur x:absolute x:-z-1 x:size-full
                      nextra-border x:border-b
                      x:backdrop-blur-md x:bg-nextra-bg/70">.
          Carrying the bg + border-bottom on a separate absolute element
          lets the outer <header> stay transparent so the blur can sample
          content scrolling underneath. */
      }
      <div class="site-header-blur" aria-hidden="true"></div>
      {
        /* Inner row caps content at --content-max-w (1440px) and centres
          it — Nextra's <nav class="x:mx-auto x:flex x:max-w-(--nextra-content-width)
          x:items-center x:gap-4 x:justify-end">. Children align right by
          default; .site-title-group has margin-inline-end:auto (Nextra's
          me-auto) which pushes the search/theme cluster to the far right. */
      }
      <nav class="site-header-inner">
        <span class="site-title-group">
          <a class="site-title" href={`${basePath}/`}>
            <b>{titleMain}</b>
          </a>
          {titleQual
            ? (
              <>
                {" "}
                <a
                  class="qual-link"
                  href={specCommitUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Source on GitHub"
                >
                  <b>{titleQual}</b>
                </a>
              </>
            )
            : null}
          <VersionSwitcher basePath={basePath} deployBase={deployBase} />
        </span>
        <div id="search" class="site-search" data-base={basePath}>
          {
            /* Custom search built on Pagefind core (search.js) — mirrors the
            shape of Nextra's <Search>. The <input> is our own (not mounted
            by PagefindUI); the kbd hint pins to the right edge of the
            input via CSS, hidden while the input is focused. The empty
            .search-panel below is where search.js writes the results
            dropdown when the user types. */
          }
          <input
            type="search"
            class="search-input"
            placeholder="Search documentation…"
            autocomplete="off"
            spellcheck={false}
            aria-label="Search documentation"
          />
          <kbd class="search-kbd" aria-hidden="true">
            <span class="search-kbd-mac">⌘ K</span>
            <span class="search-kbd-other">Ctrl K</span>
          </kbd>
          <div class="search-panel" role="listbox" aria-label="Search results">
          </div>
        </div>
        {
          /* Hamburger sits at the right edge of the row (after the search
            cluster) on mobile only — matches Nextra's
            <Button class="nextra-hamburger x:md:hidden"> rendered as the
            last child of ClientNavbar. Click flips body.menu-open which
            slides the sidebar in as an overlay. */
        }
        <button
          id="menu-toggle"
          class="menu-toggle"
          type="button"
          aria-label="Open navigation menu"
          aria-controls="sidebar"
          aria-expanded="false"
        >
          {
            /* Three-piece SVG (top <g>, middle <path>, bottom <g>) mirrors
              Nextra's MenuIcon (nextra/dist/client/icons/menu.js). The
              wrapping <g>s are the rotation anchors used by the
              hamburger ↔ X morph defined in styles.css under
              .menu-toggle svg / body.menu-open .menu-toggle svg. */
          }
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <g>
              <path d="M4 6h16"></path>
            </g>
            <path d="M4 12h16"></path>
            <g>
              <path d="M4 18h16"></path>
            </g>
          </svg>
        </button>
      </nav>
    </header>
  );
}
