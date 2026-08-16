import { useLayoutEffect, useRef, useState } from "react";

// Measures the real pixel gap between this element's own top edge and the
// bottom of the app shell's scrollable content area (the element marked
// `data-scroll-lock` in App.tsx, i.e. the container useScrollLock freezes)
// — exactly how tall this element can be without ever making that ambient
// container need to scroll itself.
//
// Deliberately measured via live DOM geometry rather than a `100vh`/`100dvh`
// CSS calc: `min-h-screen` (100vh) doesn't reliably equal the real visible
// viewport in every mobile WebView, and a page section that's meant to
// "fill the rest of the screen, and never scroll the page" has to be exact
// — a few px of drift either way either clips content or lets the ambient
// wrapper scroll again, which is the one thing this hook exists to prevent.
export function useFillRemainingHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Walked up from this element rather than a global querySelector — during
    // App.tsx's page-transition animation, the outgoing page's own
    // [data-scroll-lock] element can still be in the DOM (AnimatePresence
    // keeps it mounted through its exit animation), so a global lookup can
    // grab that stale, mid-animation element instead of this page's own
    // ancestor and read a bogus, transient rect from it.
    const scroller = el.closest<HTMLElement>("[data-scroll-lock]");

    function update() {
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      let bottom = window.visualViewport?.height ?? window.innerHeight;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const paddingBottom = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
        bottom = rect.bottom - paddingBottom;
      }
      const next = Math.round(bottom - top);
      // Ignore transient/bogus reads (e.g. one caught mid page-transition
      // animation) instead of ever collapsing to a near-zero height — keep
      // whatever the last good measurement was (or the CSS fallback, if
      // there isn't one yet) until a sane one comes in.
      if (next < 100) return;
      setHeight(next);
    }

    update();
    const ro = new ResizeObserver(update);
    if (scroller) ro.observe(scroller);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return { ref, height };
}
