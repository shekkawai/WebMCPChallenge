import type { Store } from "../state/store";

// Keyboard fallback mirrors the palm swipe 1:1, so every part of the app is
// testable without a camera (and in CI).
export function attachKeyboardSwipe(store: Store) {
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") store.swipe(1);
    if (e.key === "ArrowLeft") store.swipe(-1);
  });
}

// TODO: camera swipe — port the MediaPipe hand-landmark pipeline from
// https://github.com/shekkawai/dsh-jarvis-hud (MIT, assets vendored, offline).
// Detector plan: open palm + wrist x-velocity over ~6 frames, edge-triggered,
// ~500 ms refractory period, works on either hand (no handedness split — the
// handedness label is not trustworthy on an unmirrored frame).
export function startCameraSwipe(_store: Store): Promise<void> {
  return Promise.reject(new Error("camera swipe not implemented yet"));
}
