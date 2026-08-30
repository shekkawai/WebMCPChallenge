// Touch swipe — the phone's palm gesture. A horizontal drag on the stage maps
// to the same one-verb swipe as palm, ring, and arrow keys. Vertical-dominant
// drags are left alone (the reader scrolls natively), and drags that start on
// the map, in the reader, on the scrollable calendar, or on a control are
// ignored — panning, scrolling, and taps win there.
const THRESHOLD = 52;
const IGNORE = ".map-canvas, .reader, .calwrap, button, a, input, textarea, select";

// Pure decision so it can be tested without a DOM: given the drag delta,
// swipe direction or null. Dragging left pulls the next item in, like a
// phone carousel, so dx < 0 means forward.
export function touchSwipeDirection(dx: number, dy: number): 1 | -1 | null {
  if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy) * 2) return null;
  return dx < 0 ? 1 : -1;
}

export function attachTouchSwipe(stage: HTMLElement, swipe: (dir: 1 | -1) => void) {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  stage.addEventListener(
    "touchstart",
    (event) => {
      tracking = false;
      if (event.touches.length !== 1) return;
      const t = event.target;
      if (t instanceof Element && t.closest(IGNORE)) return;
      tracking = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    },
    { passive: true },
  );
  stage.addEventListener(
    "touchend",
    (event) => {
      if (!tracking) return;
      tracking = false;
      const dir = touchSwipeDirection(event.changedTouches[0].clientX - startX, event.changedTouches[0].clientY - startY);
      if (dir !== null) swipe(dir);
    },
    { passive: true },
  );
}
