// Glossary A–Z bar: when it sticks to the header, flatten its top (the CSS
// .stuck rule drops the top border + top corners) so it reads as attached
// chrome instead of a rounded box scrolling under the header.
//
// Pure CSS sticky can't tell when it's pinned, so an IntersectionObserver
// whose root is the viewport inset by the header height fires the moment the
// bar reaches that line: fully visible (ratio 1) = floating, clipped = stuck.
(function () {
  const bar = document.querySelector(".gl-az");
  if (!bar) return;
  const header = document.querySelector(".site-header");
  const headerH = () =>
    Math.round(header ? header.getBoundingClientRect().height : 64);

  let obs = null;
  const wire = () => {
    if (obs) obs.disconnect();
    obs = new IntersectionObserver(
      ([e]) => bar.classList.toggle("stuck", e.intersectionRatio < 1),
      { threshold: [1], rootMargin: `-${headerH() + 1}px 0px 0px 0px` },
    );
    obs.observe(bar);
  };
  wire();
  // Header height is responsive; re-arm the observer on resize.
  addEventListener("resize", wire);
})();
