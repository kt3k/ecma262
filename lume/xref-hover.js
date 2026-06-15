// xref hover-card. On first hover of any in-page/cross-page link whose
// "#fragment" resolves in the edition's xref index, fetch the index once
// (lazy — zero cost until the reader hovers a link) and show a definition
// card: section number + title + first-sentence summary, or a term card.
//
// The card is appended to <body> and positioned absolutely, so nothing is
// inserted into the spec prose. Index URL comes from this script tag's
// data-index attribute (set in page.tsx).
(function () {
  const script = document.querySelector("script[data-xref-index]");
  const indexUrl = script?.dataset.xrefIndex;
  if (!indexUrl) return;

  let index = null; // null = not loaded, {} = loaded
  let loading = null;
  const load = () => {
    if (loading) return loading;
    loading = fetch(indexUrl)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => (index = data))
      .catch(() => (index = {}));
    return loading;
  };

  const card = document.createElement("div");
  card.className = "xref-card";
  card.setAttribute("role", "tooltip");
  let appended = false;

  let hideTimer = null;
  let anchor = null;

  const fragOf = (a) => {
    const h = a.getAttribute("href") || "";
    const i = h.indexOf("#");
    return i >= 0 ? decodeURIComponent(h.slice(i + 1)) : null;
  };

  const place = (a) => {
    const r = a.getBoundingClientRect();
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const docW = document.documentElement.clientWidth;
    let left = window.scrollX + Math.min(r.left, docW - cw - 12);
    left = Math.max(window.scrollX + 8, left);
    let top = window.scrollY + r.top - ch - 8;
    if (r.top - ch - 8 < 4) top = window.scrollY + r.bottom + 8; // flip below
    card.style.left = left + "px";
    card.style.top = top + "px";
  };

  const render = (data) => {
    card.textContent = "";
    const head = document.createElement("div");
    head.className = "xc-head";
    if (data.num) {
      const n = document.createElement("span");
      n.className = "xc-num";
      n.textContent = data.num;
      head.appendChild(n);
    }
    const t = document.createElement("span");
    t.className = "xc-title";
    t.textContent = data.title;
    head.appendChild(t);
    if (data.kind === "term") {
      const k = document.createElement("span");
      k.className = "xc-kind";
      k.textContent = "term";
      head.appendChild(k);
    }
    card.appendChild(head);
    if (data.summary) {
      const s = document.createElement("div");
      s.className = "xc-summary";
      s.textContent = data.summary;
      card.appendChild(s);
    }
  };

  const show = (a, data) => {
    anchor = a;
    if (!appended) {
      document.body.appendChild(card);
      appended = true;
    }
    render(data);
    card.classList.add("show");
    place(a);
  };
  const hide = () => {
    card.classList.remove("show");
    anchor = null;
  };

  const onOver = async (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a === card || card.contains(a)) return;
    const frag = fragOf(a);
    if (!frag) return;
    if (index === null) await load();
    const data = index[frag];
    if (!data) return;
    if (hideTimer) clearTimeout(hideTimer);
    if (anchor !== a) show(a, data);
  };
  const onOut = (e) => {
    const to = e.relatedTarget;
    if (to && (card.contains(to) || (anchor && anchor.contains(to)))) return;
    hideTimer = setTimeout(hide, 220);
  };

  document.body.addEventListener("mouseover", onOver);
  document.body.addEventListener("mouseout", onOut);
  card.addEventListener("mouseenter", () => {
    if (hideTimer) clearTimeout(hideTimer);
  });
  card.addEventListener("mouseleave", () => {
    hideTimer = setTimeout(hide, 220);
  });
  // Esc dismisses (keyboard parity).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
})();
