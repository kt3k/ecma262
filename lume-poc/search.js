// Custom search UI built on Pagefind core (pagefind.js) — replaces the
// pre-built PagefindUI bundle so the dropdown can match the look of
// Nextra's <Search> (custom Combobox over pagefind core in
// nextra/dist/client/components/search.js).
//
// Pagefind indexes the built HTML (run via `deno task pagefind` which
// emits `_site/pagefind/`) and exposes a JS API for queries:
//   debouncedSearch(query) → { results: [{ data() → { url, meta, sub_results } }] }
// We render those grouped by page (one section header per page, then
// each sub_result as a clickable card) with keyboard navigation and a
// backdrop-blur dropdown panel.
//
// Two .site-search instances live in the DOM at once: one in the navbar
// (hidden ≤767px via CSS) and one at the top of the off-canvas sidebar
// (hidden ≥768px). Each gets its own state; the pagefind module itself
// is loaded once and shared. Mirrors Nextra's pattern of rendering
// `themeConfig.search` in both the navbar and the mobile MobileNav
// (sidebar.js:400) and letting CSS pick the visible one.

// Lazy-load pagefind once on first interaction from any instance.
let pagefindPromise = null;
function loadPagefind(basePath) {
  if (pagefindPromise) return pagefindPromise;
  pagefindPromise = (async () => {
    const pf = await import(`${basePath}/pagefind/pagefind.js`);
    await pf.options({
      bundlePath: `${basePath}/pagefind/`,
      baseUrl: `${basePath}/`,
    });
    return pf;
  })();
  return pagefindPromise;
}

const instances = [];

function setupInstance(root) {
  const input = root.querySelector(".search-input");
  const panel = root.querySelector(".search-panel");
  if (!input || !panel) return;
  const basePath = root.dataset.base ?? "";

  // Per-instance state: results-list cursor (-1 = none) and the most
  // recent query, used to discard stale fetches.
  let activeIdx = -1;
  let lastQuery = "";

  function setOpen(open) {
    panel.classList.toggle("open", open);
  }

  async function doSearch(q) {
    lastQuery = q;
    if (!q.trim()) {
      panel.innerHTML = "";
      setOpen(false);
      return;
    }
    setOpen(true);
    // tabler loader-2 (3/4 arc) — CSS spins it via @keyframes spin.
    panel.innerHTML = `<div class="search-status">
      <svg class="search-spinner" viewBox="0 0 24 24" width="18" height="18"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9"></path>
      </svg>
      <span>Searching…</span>
    </div>`;
    let pf;
    try {
      pf = await loadPagefind(basePath);
    } catch (_err) {
      panel.innerHTML =
        `<div class="search-status search-error">Failed to load search index</div>`;
      return;
    }
    const res = await pf.debouncedSearch(q);
    // debouncedSearch returns null if a newer search superseded this one.
    if (res === null) return;
    // Also bail if the user has typed more characters since we kicked off.
    if (q !== lastQuery) return;
    const data = await Promise.all(
      res.results.slice(0, 8).map((r) => r.data()),
    );
    if (!data.length) {
      panel.innerHTML = `<div class="search-status">No results for &ldquo;${
        escapeHtml(q)
      }&rdquo;</div>`;
      return;
    }
    panel.innerHTML = renderResults(data);
    activeIdx = -1;
  }

  input.addEventListener("input", (e) => doSearch(e.target.value));
  input.addEventListener("focus", () => {
    if (input.value.trim() && panel.innerHTML) setOpen(true);
  });

  instances.push({
    root,
    input,
    panel,
    setOpen,
    getActiveIdx: () => activeIdx,
    setActiveIdx: (i) => {
      activeIdx = i;
    },
  });
}

function renderResults(data) {
  return data.map((d) => {
    const pageTitle = d.meta?.title ?? d.url;
    const subs = d.sub_results.slice(0, 5).map((s) => `
      <a class="search-result" href="${cleanUrl(s.url)}">
        <div class="search-result-title">${escapeHtml(s.title ?? "")}</div>
        <div class="search-result-excerpt">${s.excerpt}</div>
      </a>
    `).join("");
    return `
      <div class="search-page">
        <div class="search-page-title">${escapeHtml(pageTitle)}</div>
        ${subs}
      </div>
    `;
  }).join("");
}

// Pagefind result URLs come with .html (e.g. /foo.html or /foo.html#bar)
// but our pages are served from directory-index URLs without the suffix.
// Strip it the same way Nextra does in _temp2.
function cleanUrl(url) {
  return url.replace(/\.html$/, "").replace(/\.html#/, "#");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A search instance is "visible" when its layout box is laid out
// (offsetParent ≠ null). We use this to pick the right input for
// Cmd/Ctrl+K — the navbar one on desktop, the sidebar one on mobile.
function visibleInstance() {
  return instances.find((i) => i.input.offsetParent !== null);
}

function openInstance() {
  return instances.find((i) => i.panel.classList.contains("open"));
}

document.querySelectorAll(".site-search").forEach(setupInstance);

document.addEventListener("keydown", (e) => {
  // Cmd/Ctrl+K from anywhere focuses the first visible search input —
  // matches Nextra's global shortcut. Avoid hijacking if the user is
  // already typing in another text field — unless that field is one of
  // our own search inputs (then just re-select to clear).
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    const focused = document.activeElement;
    const focusedInst = instances.find((i) => i.input === focused);
    if (focusedInst) {
      e.preventDefault();
      focusedInst.input.select();
      return;
    }
    if (
      !["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(focused?.tagName)
    ) {
      e.preventDefault();
      const inst = visibleInstance();
      if (inst) {
        inst.input.focus();
        inst.input.select();
      }
      return;
    }
  }

  const inst = openInstance();
  if (!inst) return;

  if (e.key === "Escape") {
    inst.setOpen(false);
    inst.input.blur();
    return;
  }
  const items = inst.panel.querySelectorAll(".search-result");
  if (!items.length) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = (inst.getActiveIdx() + 1) % items.length;
    inst.setActiveIdx(next);
    setActive(items, next);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = (inst.getActiveIdx() - 1 + items.length) % items.length;
    inst.setActiveIdx(prev);
    setActive(items, prev);
  } else if (e.key === "Enter" && inst.getActiveIdx() >= 0) {
    e.preventDefault();
    items[inst.getActiveIdx()].click();
  }
});

function setActive(items, activeIdx) {
  items.forEach((item, i) => {
    item.classList.toggle("active", i === activeIdx);
    if (i === activeIdx) item.scrollIntoView({ block: "nearest" });
  });
}

// Click outside ANY .site-search closes every open panel.
document.addEventListener("mousedown", (e) => {
  if (!e.target.closest(".site-search")) {
    instances.forEach((inst) => inst.setOpen(false));
  }
});

// Clicking a search result inside the mobile sidebar must close the
// menu — otherwise html.menu-open's overflow:hidden blocks the native
// hash scroll and the panel keeps covering the target. Nextra parity:
// handleSelect (nextra/dist/client/components/search.js:222-235) sets
// location.href = "#hash" which fires pathname/hash watchers in
// MobileNav (sidebar.js:343, 603) and calls setMenu(false). On
// cross-page results, the full page reload will land on a fresh DOM
// without the menu-open class, so the same handler is a no-op there.
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-result")) return;
  document.body.classList.remove("menu-open");
  document.documentElement.classList.remove("menu-open");
  const btn = document.getElementById("menu-toggle");
  if (btn) btn.setAttribute("aria-expanded", "false");
});
