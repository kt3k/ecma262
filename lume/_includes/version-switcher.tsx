import editions, { currentEditionId } from "./editions.ts";

// Static markup for the version-switcher dropdown. The actual open/close +
// outside-click + Escape behaviour is wired up in page.tsx so it runs in the
// browser; this just emits the trigger button + the (initially hidden) menu.
//
// Port of packages/shared/components/version-switcher.jsx — same DOM shape so
// the existing `.ecma-vs-*` CSS rules in styles.css carry over.
export default function VersionSwitcher(
  { basePath, deployBase }: { basePath: string; deployBase: string },
) {
  return (
    <span class="ecma-vs" id="version-switcher">
      <button
        id="version-switcher-trigger"
        type="button"
        class="ecma-vs-trigger"
        aria-label="Switch ECMAScript version"
        aria-haspopup="menu"
        aria-expanded="false"
      >
        {/* Tabler Icons "selector" (MIT) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M8 9l4 -4l4 4"></path>
          <path d="M16 15l-4 4l-4 -4"></path>
        </svg>
      </button>
      <ul
        id="version-switcher-menu"
        class="ecma-vs-menu ecma-vs-hidden"
        role="menu"
      >
        {editions.map((e) => {
          const current = e.id === currentEditionId;
          // Current edition points back at this Lume-built page; siblings
          // route to the sibling Nextra deploys under `${deployBase}${id}/`.
          const href = current ? `${basePath}/` : `${deployBase}/${e.id}/`;
          return (
            <li role="none">
              <a
                role="menuitem"
                href={href}
                aria-current={current ? "page" : undefined}
                class={current
                  ? "ecma-vs-item ecma-vs-current"
                  : "ecma-vs-item"}
              >
                {e.title}
              </a>
            </li>
          );
        })}
      </ul>
    </span>
  );
}
