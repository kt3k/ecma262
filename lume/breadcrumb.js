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
    const chain = chainOf();
    if (chain.length <= 2) {
      bar.classList.remove("show");
      return;
    }
    const r = main.getBoundingClientRect();
    bar.style.left = r.left + "px";
    bar.style.width = r.width + "px";
    bar.style.top = headerH() + "px";
    bar.textContent = "";
    chain.forEach((c, i) => {
      if (i) {
        const s = document.createElement("span");
        s.className = "sep";
        s.textContent = "›";
        bar.appendChild(s);
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
    });
    bar.classList.add("show");
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
