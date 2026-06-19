// Heading anchor links (N1). The "#" permalinks themselves are static (injected
// into each clause heading in _config.ts) — clicking one jumps to the section
// and updates the URL hash via normal anchor behaviour, which respects the
// header scroll-padding. This script is a progressive enhancement: it also
// copies the shareable absolute URL to the clipboard on click and flashes a
// brief "Copied" confirmation. Without JS the links still work as plain
// in-page anchors.
(function () {
  const main = document.getElementById("content");
  if (!main || !navigator.clipboard) return;

  let timer = null;
  main.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest(".heading-anchor");
    if (!a) return;
    // Don't preventDefault — let the browser do the hash jump (with scroll
    // padding); just copy the link alongside.
    const href = a.getAttribute("href");
    const url = location.origin + location.pathname + href;
    navigator.clipboard.writeText(url).then(() => {
      if (timer) {
        clearTimeout(timer);
        document.querySelectorAll(".heading-anchor.copied").forEach((el) =>
          el.classList.remove("copied")
        );
      }
      a.classList.add("copied");
      timer = setTimeout(() => a.classList.remove("copied"), 1200);
    }).catch(() => {});
  });
})();
