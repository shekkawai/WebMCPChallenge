import type { Store } from "../state/store";
import { isOpenPalm, type Point, type Point3 } from "./pose";
import { drawHands, type OverlayHand } from "./overlay";

// Keyboard fallback mirrors the palm swipe 1:1, so every part of the app is
// testable without a camera (and in CI). The wide key map is deliberate:
// cheap BLE "scrolling rings" and presenter clickers pair as plain keyboards,
// and which arrow/page key they emit depends on the device and its mode.
const KEY_SWIPES: Record<string, 1 | -1> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: 1,
  ArrowUp: -1,
  PageDown: 1,
  PageUp: -1,
};

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock"]);

export function swipeForKey(key: string): 1 | -1 | null {
  return KEY_SWIPES[key] ?? null;
}

export function attachKeyboardSwipe(store: Store) {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const direction = swipeForKey(e.key);
    if (direction) {
      store.swipe(direction);
      return;
    }
    // Surface unmapped keys in the agent feed so a paired ring/clicker
    // self-identifies: press its button once and read what arrived.
    if (!MODIFIER_KEYS.has(e.key)) {
      document.dispatchEvent(new CustomEvent("agent-feed", { detail: `input · key "${e.key}" (unmapped)` }));
    }
  });
}

// Some rings act as a Bluetooth mouse wheel instead of arrow keys; trackpads
// and Magic Mouse sideswipes land here too. Deltas accumulate so slow scroll
// drift is ignored and one deliberate flick fires exactly one swipe.
export class WheelSwipeDetector {
  private acc = 0;
  private cooldownUntil = 0;

  push(deltaX: number, deltaY: number, at: number): 1 | -1 | null {
    if (at < this.cooldownUntil) return null;
    const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    this.acc = Math.sign(delta) === Math.sign(this.acc) ? this.acc + delta : delta;
    if (Math.abs(this.acc) < 120) return null;
    const direction: 1 | -1 = this.acc > 0 ? 1 : -1;
    this.acc = 0;
    this.cooldownUntil = at + 560;
    return direction;
  }
}

export function attachWheelSwipe(store: Store) {
  const detector = new WheelSwipeDetector();
  window.addEventListener(
    "wheel",
    (e) => {
      // In the reader the wheel means "scroll this document", never navigate.
      if (store.state.view === "reader") return;
      const direction = detector.push(e.deltaX, e.deltaY, performance.now());
      if (direction) store.swipe(direction);
    },
    { passive: true },
  );
}

export class PalmSwipeDetector {
  private samples: { at: number; x: number }[] = [];
  private palm = false;
  private cooldownUntil = 0;

  get palmActive() {
    return this.palm;
  }

  push(landmarks: Point[], at: number, world?: Point3[] | null): 1 | -1 | null {
    const palm = isOpenPalm(landmarks, world, this.palm);
    this.palm = palm;
    if (!palm) {
      this.samples = [];
      return null;
    }

    // MediaPipe reads the raw camera frame. Mirror x so gesture direction
    // matches the selfie preview and the user's physical movement.
    const x = 1 - landmarks[0].x;
    this.samples.push({ at, x });
    this.samples = this.samples.filter((sample) => at - sample.at <= 280);
    if (at < this.cooldownUntil || this.samples.length < 3) return null;

    const first = this.samples[0];
    const elapsed = at - first.at;
    const delta = x - first.x;
    if (elapsed < 80 || Math.abs(delta) < 0.15 || Math.abs(delta) / elapsed < 0.00055) return null;

    this.samples = [];
    this.cooldownUntil = at + 560;
    return delta > 0 ? 1 : -1;
  }

  reset() {
    this.samples = [];
    this.palm = false;
    this.cooldownUntil = 0;
  }
}

type Landmarker = {
  detectForVideo(video: HTMLVideoElement, at: number): {
    landmarks?: Point[][];
    worldLandmarks?: Point3[][];
  };
  close?: () => void;
};

export class CameraSwipeController {
  private store: Store;
  private button: HTMLButtonElement;
  private panel: HTMLElement;
  private video: HTMLVideoElement;
  private overlay: HTMLCanvasElement;
  private status: HTMLElement;
  private pulse: HTMLElement;
  private hint: HTMLElement | null;
  private detectors = [new PalmSwipeDetector(), new PalmSwipeDetector()];
  private stream: MediaStream | null = null;
  private landmarker: Landmarker | null = null;
  private raf = 0;
  private lastVideoTime = -1;
  private lastSwipeAt = Number.NEGATIVE_INFINITY;
  private running = false;
  private busy = false;
  private liveKey = "";
  private statusHoldUntil = 0;

  constructor(store: Store) {
    this.store = store;
    this.button = document.querySelector<HTMLButtonElement>("#camera-toggle")!;
    this.panel = document.querySelector<HTMLElement>("#camera-panel")!;
    this.video = document.querySelector<HTMLVideoElement>("#camera-video")!;
    this.overlay = document.querySelector<HTMLCanvasElement>("#camera-overlay")!;
    this.status = document.querySelector<HTMLElement>("#camera-status")!;
    this.pulse = document.querySelector<HTMLElement>("#swipe-pulse")!;
    this.hint = document.querySelector<HTMLElement>("#hint");
    this.button.addEventListener("click", () => void this.toggle());
  }

  async toggle() {
    if (this.busy) return;
    if (this.running) {
      this.stop();
      return;
    }
    try {
      await this.start();
    } catch (error) {
      this.stop(false);
      this.setStatus(error instanceof Error ? error.message : "camera unavailable", "error");
    }
  }

  async start() {
    if (this.running || this.busy) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera is not supported here");
    this.busy = true;
    this.button.disabled = true;
    this.panel.hidden = false;
    this.setStatus("requesting camera", "loading");

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: { ideal: "user" },
        },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.setStatus("loading hand model", "loading");

      const dynamicImport = new Function("url", "return import(url)") as (url: string) => Promise<any>;
      const vision = await dynamicImport("/mediapipe/vision_bundle.mjs");
      const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const options = {
        baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate: "GPU" },
        numHands: 2,
        runningMode: "VIDEO",
      };
      try {
        this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, options);
      } catch {
        this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: "CPU" },
        });
      }

      this.running = true;
      this.button.classList.add("on");
      this.button.textContent = "Camera on";
      this.setStatus("raise a hand into view", "track");
      if (this.hint) this.hint.textContent = "🖐 open palm · sweep left / right · speak to act";
      this.loop();
    } finally {
      this.busy = false;
      this.button.disabled = false;
    }
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.landmarker || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    let result: ReturnType<Landmarker["detectForVideo"]>;
    try {
      result = this.landmarker.detectForVideo(this.video, performance.now());
    } catch {
      return;
    }

    const seen = result.landmarks?.length ?? 0;
    const hands: OverlayHand[] = [];
    let fired = false;
    for (let i = 0; i < this.detectors.length; i++) {
      const landmarks = result.landmarks?.[i];
      if (!landmarks) {
        if (i >= seen) this.detectors[i].reset();
        continue;
      }
      const at = performance.now();
      const world = result.worldLandmarks?.[i];
      if (fired || at - this.lastSwipeAt < 560) {
        // A swipe was just consumed; keep the skeleton live while the
        // detector cools down, judging the palm with lenient hysteresis.
        hands.push({ landmarks, palm: isOpenPalm(landmarks, world, true) });
        continue;
      }
      const direction = this.detectors[i].push(landmarks, at, world);
      hands.push({ landmarks, palm: direction !== null || this.detectors[i].palmActive });
      if (direction) {
        this.commit(direction, at);
        fired = true;
      }
    }
    this.renderOverlay(hands);
    this.updateLiveStatus(hands);
  };

  // Public so synthetic landmark sessions (tests, judges without a webcam,
  // the deployed-site smoke check) can exercise the exact drawing path.
  renderOverlay(hands: OverlayHand[]) {
    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 360;
    if (this.overlay.width !== width) this.overlay.width = width;
    if (this.overlay.height !== height) this.overlay.height = height;
    const ctx = this.overlay.getContext("2d");
    if (ctx) drawHands(ctx, width, height, hands);
  }

  private updateLiveStatus(hands: OverlayHand[]) {
    if (performance.now() < this.statusHoldUntil) return;
    const key = hands.length === 0 ? "none" : hands.some((hand) => hand.palm) ? "palm" : "hand";
    if (key === this.liveKey) return;
    this.liveKey = key;
    if (key === "none") this.setStatus("raise a hand into view", "track");
    else if (key === "hand") this.setStatus("hand tracked — open your palm", "track");
    else this.setStatus("open palm ✓ — sweep left / right", "ready");
  }

  ingestLandmarks(landmarks: Point[], at: number, world?: Point3[] | null) {
    if (at - this.lastSwipeAt < 560) return null;
    const direction = this.detectors[0].push(landmarks, at, world);
    if (direction) this.commit(direction, at);
    return direction;
  }

  private commit(direction: 1 | -1, at: number) {
    this.lastSwipeAt = at;
    this.detectors.forEach((detector) => detector.reset());
    this.store.swipe(direction);
    this.flash(direction);
    this.setStatus(direction > 0 ? "swipe ✓ next" : "swipe ✓ previous", "ready");
    this.statusHoldUntil = at + 900;
    this.liveKey = "";
  }

  private flash(direction: 1 | -1) {
    this.pulse.textContent = direction > 0 ? "→" : "←";
    this.pulse.className = direction > 0 ? "right show" : "left show";
    window.setTimeout(() => this.pulse.classList.remove("show"), 420);
    document.dispatchEvent(new CustomEvent("agent-feed", { detail: `gesture · swipe ${direction > 0 ? "right" : "left"}` }));
  }

  private setStatus(message: string, state: "loading" | "ready" | "track" | "error" | "off") {
    this.status.textContent = message;
    this.status.dataset.state = state;
  }

  stop(hide = true) {
    this.running = false;
    this.busy = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    try {
      this.landmarker?.close?.();
    } catch {
      // The model may already have released its GPU context.
    }
    this.landmarker = null;
    this.lastSwipeAt = Number.NEGATIVE_INFINITY;
    this.detectors.forEach((detector) => detector.reset());
    this.liveKey = "";
    this.statusHoldUntil = 0;
    this.overlay.getContext("2d")?.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (this.hint) this.hint.textContent = "◀ swipe ▶ · speak to act";
    this.button.disabled = false;
    this.button.classList.remove("on");
    this.button.textContent = "Camera";
    if (hide) this.panel.hidden = true;
    this.setStatus("camera off", "off");
  }
}

export function attachCameraSwipe(store: Store) {
  return new CameraSwipeController(store);
}
