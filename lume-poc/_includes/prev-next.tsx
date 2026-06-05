import chapters from "./chapters.ts";

// "Previous chapter" / "Next chapter" links rendered at the bottom of each
// spec page. Visual match for what nextra-theme-docs renders: a thin
// top-border separator above, then each link is plain text with a chevron
// — no card, no "Previous"/"Next" label, the chapter title carries the
// meaning. Next link sits right-aligned via margin-start: auto.
//
// Lookup is by slug position in the chapters array; every chapter is now
// Lume-rendered (scripts/build-pages.ts), so links point at the local pages.
export default function PrevNext(
  { basePath, currentSlug, fallbackBase: _fallbackBase }: {
    basePath: string;
    currentSlug: string;
    fallbackBase: string;
  },
) {
  const idx = chapters.findIndex((c) => c.slug === currentSlug);
  if (idx === -1) return null;

  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx + 1 < chapters.length ? chapters[idx + 1] : null;
  if (!prev && !next) return null;

  const hrefFor = (slug: string) =>
    slug === "index" ? `${basePath}/` : `${basePath}/${slug}/`;

  // Chevron-right SVG; the prev variant gets `class="flip"` so CSS rotates
  // it 180° (matches Nextra's `x:ltr:rotate-180` on the prev arrow).
  const Chevron = ({ flip }: { flip?: boolean }) => (
    <svg
      class={flip ? "prev-next-arrow flip" : "prev-next-arrow"}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      stroke="currentColor"
      fill="none"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7"></path>
    </svg>
  );

  return (
    <nav class="prev-next" aria-label="Chapter pagination">
      {prev
        ? (
          <a
            class="prev-next-link prev-link"
            href={hrefFor(prev.slug)}
            title={prev.title}
          >
            <Chevron flip />
            <span class="prev-next-title">{prev.title}</span>
          </a>
        )
        : null}
      {next
        ? (
          <a
            class="prev-next-link next-link"
            href={hrefFor(next.slug)}
            title={next.title}
          >
            <span class="prev-next-title">{next.title}</span>
            <Chevron />
          </a>
        )
        : null}
    </nav>
  );
}
