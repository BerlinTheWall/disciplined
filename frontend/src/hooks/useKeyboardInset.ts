import { useEffect, useState } from "react";

// How much of the window's bottom edge the on-screen keyboard currently covers.
//
// iOS (Safari and the app's WKWebView) overlays the keyboard on top of the
// layout viewport instead of resizing it, so `fixed bottom-0` sheets stay
// anchored behind the keyboard. When the user taps an input iOS pans the page
// to reveal it, but a programmatic focus (useAutoFocus with preventScroll)
// opens the keyboard without any pan — the sheet stays covered. The
// visualViewport API reports the true visible area, so the overlap is
// window.innerHeight minus the visual viewport's height and pan offset.
export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // Ignore sub-keyboard-size changes (collapsing URL bar in the mobile
      // browser, rounding) so sheets only move for an actual keyboard.
      setInset(overlap > 60 ? Math.round(overlap) : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);

  return active ? inset : 0;
}
