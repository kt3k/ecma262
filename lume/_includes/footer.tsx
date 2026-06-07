import editions from "./editions.ts";

// Page footer — two columns side-by-side: About / Pipeline / copyright
// (left) and full edition list (right). Matches what
// `packages/shared/components/spec-layout.jsx` renders today: no background,
// no border, just centred grey text with `gap: 4rem` between columns and
// `gap: 0.4rem` between rows inside each column. The deploy root
// (`/ecma262/`) is used for the cross-edition links since they currently
// only exist on the Nextra-rendered sites.
//
// The block lives inside `.site-footer-wrap`, mirroring Nextra's <Footer>:
//   <div bg=gray-100 pb=safe-area-inset>
//     <Switchers/>   // null unless `hideSidebar`
//     <hr/>
//     <footer>{children}</footer>
//   </div>
// Nextra renders the <Switchers> row (LocaleSwitch + ThemeSwitch) ONLY when the
// sidebar is hidden (footer/switchers.js: `if (hideSidebar && …) …; return
// null`); with a sidebar present the theme toggle lives in the sidebar footer
// instead (sidebar.tsx). We have a sidebar, so we match that and omit the row —
// only the <hr> Nextra always emits above the footer stays.
const deployBase = "/ecma262";

export default function Footer() {
  return (
    <div class="site-footer-wrap">
      <hr class="site-footer-divider" />
      <footer class="site-footer">
        <div class="footer-cols">
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
          <div class="footer-col">
            {editions.map((e) => (
              <a href={`${deployBase}/${e.id}/`}>{e.title}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
