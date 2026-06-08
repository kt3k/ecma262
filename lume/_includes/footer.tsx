import editions from "./editions.ts";

// Page footer — three columns side-by-side: About / copyright
// (left), then the full edition list split across two columns (newest half
// then older half) so the long list doesn't run as one tall column. Matches
// what the former Nextra spec-layout footer rendered: no background,
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
  // Split the edition list into two roughly-equal columns, newest half first.
  const half = Math.ceil(editions.length / 2);
  const editionCols = [editions.slice(0, half), editions.slice(half)];
  return (
    <div class="site-footer-wrap">
      <hr class="site-footer-divider" />
      <footer class="site-footer">
        <div class="footer-cols">
          <div class="footer-col">
            <a href={`${deployBase}/about/`}>About</a>
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
          {editionCols.map((col) => (
            <div class="footer-col">
              {col.map((e) => <a href={`${deployBase}/${e.id}/`}>{e.title}</a>)}
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
