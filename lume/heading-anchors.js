// Heading anchor links (N1). The "#" permalinks are static (injected into each
// clause heading in _config.ts). This progressive enhancement makes a click
// COPY the shareable absolute URL to the clipboard (with a brief "Copied"
// confirmation) instead of jumping: the reader is already at the heading, so
// scrolling to it is just noise. The URL hash is still updated (via
// replaceState, no scroll, no history entry) so the address bar reflects the
// permalink. Without JS the links degrade to plain in-page anchors.
(function () {
  const main = document.getElementById("content");
  if (!main || !navigator.clipboard) return;

  let timer = null;
  main.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest(".heading-anchor");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href");
    try {
      history.replaceState(null, "", href);
    } catch (_) { /* file:// etc. — skip the URL update */ }
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
