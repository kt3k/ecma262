// "Back to top" control (N3): a subtle pill that fades in at the bottom-right
// of the reading column once the reader has scrolled down a screenful; clicking
// scrolls back to the top. Positioned against the content column (not the
// viewport corner) so it stays clear of the right-rail TOC and its feedback
// link. Respects prefers-reduced-motion for the scroll.
(function () {
  const main = document.getElementById("content");

  const btn = document.createElement("button");
  btn.id = "to-top";
  btn.type = "button";
  btn.setAttribute("aria-label", "Back to top");
  btn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 19V5M5 12l7-7 7 7"/></svg><span>Top</span>';
  document.body.appendChild(btn);

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  btn.addEventListener("click", () => {
    scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });

  // Sit at the content column's right edge (slightly inset), clear of the rail.
  const place = () => {
    if (!main) return;
    const r = main.getBoundingClientRect();
    btn.style.right = Math.max(12, innerWidth - r.right + 8) + "px";
  };
  place();

  let raf = null;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      btn.classList.toggle("show", scrollY > innerHeight);
    });
  };
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", place);
  // Re-align when the layout shifts (e.g. the sidebar collapses), like the
  // breadcrumb — window "resize" doesn't fire for that.
  if (main && typeof ResizeObserver === "function") {
    new ResizeObserver(place).observe(main);
  }
})();
