// xref hover-card. On first hover of any in-page/cross-page link whose
// "#fragment" resolves in the edition's xref index, fetch the index once
// (lazy — zero cost until the reader hovers a link) and show a definition
// card: section number + title + first-sentence summary, or a term card.
//
// The card is appended to <body> and positioned absolutely, so nothing is
// inserted into the spec prose. Index URL comes from this script tag's
// data-index attribute (set in page.tsx).
(function () {
  // The glossary page already spells out every term's definition inline, so a
  // hover card there is redundant — skip wiring it up entirely.
  if (document.querySelector("main.glossary")) return;

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

  // Anchor to the line fragment under the pointer, not the whole link. A
  // wrapped link's getBoundingClientRect() is the union box of both lines, so
  // positioning off it floats the card above line 1 even when the pointer is
  // on line 2 (disconnected, and beyond the hover bridge). getClientRects()
  // gives a rect per line; pick the one the pointer is on.
  const lineRect = (a, y) => {
    const rects = a.getClientRects();
    if (rects.length <= 1) return rects[0] || a.getBoundingClientRect();
    let best = rects[0], bestD = Infinity;
    for (const r of rects) {
      if (y >= r.top && y <= r.bottom) return r;
      const d = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom));
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  };

  const place = (a, y) => {
    const r = lineRect(a, y);
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
    // Grammar/equation titles are code-like (nonterminal names, abstract-op
    // ids); render them in the mono face so they read as the spec does.
    if (data.kind === "grammar" || data.kind === "equation") {
      t.classList.add("xc-mono");
    }
    t.textContent = data.title;
    head.appendChild(t);
    // Kind chip: label the non-clause entries so the reader knows whether the
    // card describes a term, a grammar production, an equation or a table.
    const KIND = {
      term: "term",
      grammar: "grammar",
      equation: "notation",
      table: "table",
      step: "step",
    };
    if (KIND[data.kind]) {
      const k = document.createElement("span");
      k.className = "xc-kind";
      k.textContent = KIND[data.kind];
      head.appendChild(k);
    }
    card.appendChild(head);
    if (data.summary) {
      const s = document.createElement("div");
      s.className = "xc-summary";
      if (data.kind === "grammar" || data.kind === "equation") {
        s.classList.add("xc-mono");
      }
      s.textContent = data.summary;
      card.appendChild(s);
    }
  };

  const show = (a, data, y) => {
    anchor = a;
    if (!appended) {
      document.body.appendChild(card);
      appended = true;
    }
    render(data);
    card.classList.add("show");
    place(a, y);
  };
  const hide = () => {
    card.classList.remove("show");
    anchor = null;
  };

  const onOver = async (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a === card || card.contains(a)) return;
    // Only the spec prose gets cards. The right-rail TOC, breadcrumb and
    // sidebar links also point at "#sec-…" fragments, but a card there is just
    // noise — those lists already show the section title.
    if (!a.closest("#content")) return;
    const frag = fragOf(a);
    if (!frag) return;
    const y = e.clientY; // pointer line, for wrapped-link placement
    if (index === null) await load();
    // own-property check: JSON.parse gives a plain object, so a bare
    // index[frag] for a fragment that collides with an Object.prototype name
    // ("toString", "constructor", …) would return the inherited member and
    // render an empty card.
    const data = Object.prototype.hasOwnProperty.call(index, frag)
      ? index[frag]
      : null;
    if (!data) return;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (anchor !== a) show(a, data, y);
  };

  // Whether the pointer is over the anchor or the card. The anchor check uses
  // getClientRects() (one box per line) so a WRAPPED link counts as hovered on
  // either line — keeping the card open while the pointer is anywhere on the
  // link, instead of the old relatedTarget test that misfired between lines.
  const PAD = 3;
  const overAnchor = (x, y) => {
    if (!anchor) return false;
    const rects = anchor.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (
        x >= r.left - PAD && x <= r.right + PAD &&
        y >= r.top - PAD && y <= r.bottom + PAD
      ) return true;
    }
    return false;
  };
  const overCard = (x, y) => {
    if (!appended || !card.classList.contains("show")) return false;
    const r = card.getBoundingClientRect();
    // wider vertical pad bridges the link↔card gap
    return x >= r.left - 4 && x <= r.right + 4 &&
      y >= r.top - 12 && y <= r.bottom + 12;
  };

  // Hide decisions are driven by pointer geometry, not mouseout/relatedTarget:
  // keep the card while the pointer is on the link (any line) or the card,
  // start a short grace timer otherwise.
  let moveRaf = null;
  const onMove = (e) => {
    if (!anchor || moveRaf) return;
    const x = e.clientX, y = e.clientY;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = null;
      if (overAnchor(x, y) || overCard(x, y)) {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
      } else if (!hideTimer) {
        hideTimer = setTimeout(hide, 220);
      }
    });
  };

  document.body.addEventListener("mouseover", onOver);
  document.addEventListener("mousemove", onMove, { passive: true });
  // Pointer left the document entirely — dismiss.
  document.addEventListener("mouseleave", () => {
    if (anchor && !hideTimer) hideTimer = setTimeout(hide, 220);
  });
  // Esc dismisses (keyboard parity).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
})();
