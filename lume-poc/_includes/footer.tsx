import editions from "./editions.ts";

// Page footer — two columns side-by-side: full edition list (left) and
// About / Pipeline / copyright (right). Matches what
// `packages/shared/components/spec-layout.jsx` renders today: no background,
// no border, just centred grey text with `gap: 4rem` between columns and
// `gap: 0.4rem` between rows inside each column. The deploy root
// (`/ecma262/`) is used for the cross-edition links since they currently
// only exist on the Nextra-rendered sites.
//
// The whole block lives inside a `.site-footer-wrap`, which mirrors
// Nextra's <Footer> output:
//   <div bg=gray-100 pb=safe-area-inset>
//     <Switchers>...LocaleSwitch + ThemeSwitch...</Switchers>
//     <hr/>
//     <footer>{children}</footer>
//   </div>
// — so the page bottom always shows a Change-theme trigger, even on
// mobile where the sidebar (and its own theme toggle) is hidden behind
// the hamburger. lume-poc has no locale switcher, so the Switchers row
// just renders the theme button.
const deployBase = "/ecma262";

export default function Footer() {
  return (
    <div class="site-footer-wrap">
      <div class="site-switchers">
        {
          /* Same .theme-toggle markup the sidebar footer uses (sidebar.tsx);
            page.tsx wires up every `.theme-toggle` instance via
            querySelectorAll so both buttons share one click handler and the
            CSS-driven label/icon swap. No id here — that one stays on the
            sidebar copy so we don't ship a duplicate ID. */
        }
        <button
          class="theme-toggle"
          type="button"
          aria-label="Toggle dark mode"
        >
          <svg
            class="icon-sun"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41">
            </path>
          </svg>
          <svg
            class="icon-moon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
          <span class="theme-toggle-label">
            <span class="label-light">Light</span>
            <span class="label-dark">Dark</span>
          </span>
        </button>
      </div>
      <hr class="site-footer-divider" />
      <footer class="site-footer">
        <div class="footer-cols">
          <div class="footer-col">
            {editions.map((e) => (
              <a href={`${deployBase}/${e.id}/`}>{e.title}</a>
            ))}
          </div>
          <div class="footer-col">
            <a href={`${deployBase}/about/`}>About</a>
            <a href={`${deployBase}/pipeline/`}>How it's built</a>
            <span class="copyright">
              {new Date().getFullYear()} ©{" "}
              <a
                href="https://github.com/kt3k/ecma262"
                target="_blank"
                rel="noreferrer"
              >
                ECMA-262 Restyled
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
