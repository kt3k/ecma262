// Reading progress within a chapter, in the chrome only (nothing inserted
// into the spec prose):
//   - mobile / narrow (TOC hidden ≤1100px): a thin bar under the sticky
//     header fills with the chapter scroll fraction;
//   - desktop (TOC visible ≥1101px): a "section N / M" counter in the
//     "On This Page" heading, and the entries already scrolled past are
//     dimmed — the bright/dim boundary moving down the list is the progress.
// CSS decides which is shown per breakpoint; both are computed (cheap).
(function () {
  const main = document.getElementById("content");
  if (!main) return;

  const bar = document.createElement("div");
  bar.id = "reading-bar";
  document.body.appendChild(bar);

  const tocLinks = Array.from(document.querySelectorAll("aside.toc > ol a"));
  const aside = document.querySelector("aside.toc");
  const h2 = document.querySelector("aside.toc h2");
  let count = null;
  let rail = null;
  if (aside && tocLinks.length) {
    // section counter in the "On This Page" heading
    if (h2) {
      count = document.createElement("span");
      count.className = "rp-count";
      h2.appendChild(count);
    }
    // a continuous fill on the aside's (non-scrolling) left edge — always
    // visible regardless of the TOC list's own internal scroll
    const track = document.createElement("div");
    track.id = "reading-rail";
    rail = document.createElement("i");
    rail.id = "reading-rail-fill";
    track.appendChild(rail);
    aside.appendChild(track);
  }

  // Whole-spec position strip (idea F; skeleton in page.tsx, per-page data +
  // chapter segments injected in _config.ts). The dot sits at `before +
  // chapterFraction * span` of the entire spec; advance it as this chapter is
  // read.
  const sp = document.getElementById("spec-pos");
  const spDone = sp && sp.querySelector(".sp-done");
  const spDot = sp && sp.querySelector(".sp-dot");
  const spLabel = sp && sp.querySelector(".sp-label");
  const spBefore = sp ? parseFloat(sp.dataset.before) : NaN;
  const spSpan = sp ? parseFloat(sp.dataset.span) : NaN;

  // Hover a chapter segment → CSS highlights its span; show its name in the
  // shared popover, clamped to the track so long titles don't run off the rail.
  const spTrack = sp && sp.querySelector(".sp-track");
  const spPop = sp && sp.querySelector(".sp-pop");
  if (sp && spTrack && spPop) {
    for (const seg of sp.querySelectorAll(".sp-seg")) {
      seg.addEventListener("mouseenter", () => {
        spPop.textContent = seg.dataset.name || "";
        spPop.classList.add("show");
        const tw = spTrack.clientWidth;
        const left = parseFloat(seg.style.left) / 100 * tw;
        const w = parseFloat(seg.style.width) / 100 * tw;
        const pw = spPop.offsetWidth;
        const cx = Math.max(pw / 2, Math.min(tw - pw / 2, left + w / 2));
        spPop.style.left = cx + "px";
      });
      seg.addEventListener("mouseleave", () => spPop.classList.remove("show"));
    }
  }

  const frac = () => {
    const top = window.scrollY + main.getBoundingClientRect().top;
    const span = main.offsetHeight - window.innerHeight;
    return span <= 0
      ? 1
      : Math.min(1, Math.max(0, (window.scrollY - top) / span));
  };

  const update = () => {
    const f = frac();
    document.documentElement.style.setProperty("--rp", f.toFixed(4));
    if (sp && !isNaN(spBefore) && !isNaN(spSpan)) {
      const p = Math.min(1, spBefore + f * spSpan);
      const pc = (p * 100).toFixed(2) + "%";
      if (spDone) spDone.style.width = pc;
      if (spDot) spDot.style.left = pc;
      if (spLabel) {
        spLabel.textContent = "~" + Math.round(p * 100) + "% through";
      }
    }
    if (!count) return;
    let active = -1;
    for (let i = 0; i < tocLinks.length; i++) {
      if (tocLinks[i].classList.contains("active")) active = i;
    }
    const cur = active < 0 ? 0 : active + 1;
    count.textContent = cur + " / " + tocLinks.length;
  };

  update();
  let raf = null;
  addEventListener("scroll", () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      update();
    });
  }, { passive: true });
  addEventListener("resize", update);

  // The page's own scroll-spy flips `.active` via IntersectionObserver
  // (async, after scroll settles); mirror those changes into the counter.
  const ol = document.querySelector("aside.toc > ol");
  if (ol) {
    new MutationObserver(update).observe(ol, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }
})();
