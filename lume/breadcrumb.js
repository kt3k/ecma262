// Context breadcrumb: a sticky bar under the header showing the ancestor
// clause chain of the section currently being read (e.g. "22 Text Processing
// › 22.2 RegExp Objects › 22.2.6 RegExp Prototype › 22.2.6.8 …"). Orientation
// for deeply nested clauses. Hidden when ≤2 levels deep — shallow sections
// don't need it. Chrome only; the bar is aligned to the content column and
// nothing is inserted into the prose.
(function () {
  const main = document.getElementById("content");
  if (!main) return;
  const clauses = Array.from(main.querySelectorAll("emu-clause[id]"));
  if (!clauses.length) return;

  const header = document.querySelector(".site-header");
  const headerH = () => (header ? header.getBoundingClientRect().height : 64);

  const bar = document.createElement("nav");
  bar.id = "crumb-bar";
  bar.setAttribute("aria-label", "Breadcrumb");
  document.body.appendChild(bar);

  const headOf = (c) => {
    for (const x of c.children) if (/^h[1-6]$/i.test(x.tagName)) return x;
    return null;
  };
  const parse = (c) => {
    const h = headOf(c);
    if (!h) return { num: "", title: c.id };
    const n = h.querySelector(".secnum");
    const num = n ? n.textContent.trim() : "";
    const title = h.textContent.replace(num, "").replace(/\s+/g, " ").trim();
    return { num, title };
  };

  const chainOf = () => {
    // deepest clause whose heading has scrolled to/under the header = the one
    // being read; its emu-clause ancestors are the breadcrumb
    const top = headerH() + 8;
    let cur = null;
    for (const c of clauses) {
      if (c.getBoundingClientRect().top <= top) cur = c;
      else break;
    }
    if (!cur) return [];
    const chain = [];
    for (let n = cur; n; n = n.parentElement) {
      if (n.tagName && n.tagName.toLowerCase() === "emu-clause" && n.id) {
        chain.unshift(n);
      }
    }
    return chain;
  };

  const render = () => {
    // Mobile: crumbs squeeze to meaningless 2-char ellipses on a phone-width
    // bar; the sidebar TOC is the right tool there. Hide entirely.
    if (innerWidth <= 767) {
      bar.classList.remove("show");
      return;
    }
    const chain = chainOf();
    if (chain.length <= 2) {
      bar.classList.remove("show");
      return;
    }
    const r = main.getBoundingClientRect();
    bar.style.left = r.left + "px";
    bar.style.width = r.width + "px";
    bar.style.top = headerH() + "px";
    // Line the crumb text up with the prose, which sits inside main's
    // inline padding (3rem on desktop) — otherwise the bar hangs out to the
    // left of the body text.
    bar.style.paddingLeft = (parseFloat(getComputedStyle(main).paddingLeft) ||
      0) + "px";
    bar.textContent = "";
    // Each crumb keeps its full text (no uniform flex-shrink that would chop
    // every level to "22 Te…"); items[i].sep is the separator *before* crumb i
    // (null for the first), so collapsing from the left can hide a crumb and
    // its leading separator together.
    const items = [];
    chain.forEach((c, i) => {
      let sep = null;
      if (i) {
        sep = document.createElement("span");
        sep.className = "sep";
        sep.textContent = "›";
        bar.appendChild(sep);
      }
      const { num, title } = parse(c);
      const a = document.createElement("a");
      a.className = "cb";
      a.href = "#" + c.id;
      if (num) {
        const ns = document.createElement("span");
        ns.className = "cb-num";
        ns.textContent = num;
        a.appendChild(ns);
      }
      a.appendChild(document.createTextNode(title));
      bar.appendChild(a);
      items.push({ a, sep });
    });
    bar.classList.add("show");

    // If the full chain overflows the content column, collapse the oldest
    // ancestors into a leading "…" so the current section and its nearest
    // parents stay fully readable (the right end is what matters most).
    let lead = null;
    let drop = 0;
    while (
      bar.scrollWidth > bar.clientWidth + 1 && drop < items.length - 2
    ) {
      if (!lead) {
        lead = document.createElement("span");
        lead.className = "cb-ellip";
        lead.textContent = "…";
        bar.insertBefore(lead, bar.firstChild);
      }
      items[drop].a.style.display = "none";
      if (items[drop].sep) items[drop].sep.style.display = "none";
      drop++;
    }
  };

  render();
  let raf = null;
  addEventListener("scroll", () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      render();
    });
  }, { passive: true });
  addEventListener("resize", render);
})();
