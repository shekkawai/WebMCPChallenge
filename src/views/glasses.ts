// Glasses simulation — a purely presentational mode for filming the
// "smart-responsive" story. A real POV photo (looking through one lens at the
// world) covers the viewport, and the live surface is projected inside the
// lens like an AR display. The page is unchanged underneath: every input
// channel (agent tools, palm, ring, keys) keeps working.
const STORAGE_KEY = "webmcp-surface-glasses";

// Power-on boot: total length of the CSS sequence (keep in sync with the
// `boot-*` keyframes in style.css, which are all authored on this duration).
const BOOT_MS = 3400;

// Where the lens sits inside the photo, as fractions of the image, and the
// display box carved into it. Tuned by eye against public/glasses-pov.jpg —
// adjust here if the photo changes. `aspect` is the glasses breakpoint: the
// app is given a real near-square viewport of this shape (not scaled down),
// so the layout genuinely reflows to fit the lens.
const IMAGE_ASPECT = 1920 / 1334;
const LENS = { cx: 0.54, cy: 0.548, width: 0.44, aspect: 1.18 };

// The glasses frame is the subject, not the photo. FRAME_SPAN is how much of
// the image's height the frame occupies; the photo is scaled so the frame
// fills between FILL_MIN and FILL_MAX of the viewport height, and the lens
// centre is pinned to the viewport centre. On a wide screen the photo bleeds
// off the sides (mostly the left, where the second lens is) instead of the
// frame being cropped — so a wider window shows MORE frame, not less.
const FRAME_SPAN = 0.72;
const FILL_MIN = 0.94;
const FILL_MAX = 1.0;
// Portrait guard: the lens display box may never outgrow the viewport width.
// On a phone the fill-the-height rule would carve a lens wider than the
// screen, so the frame shrinks instead — it floats centred with the blurred
// ambient photo filling the gaps above and below.
const LENS_MAX_W = 0.94;
// Keeping the lens centred means the photo must overhang by these factors to
// leave no gap: 1 / (2 * min(cx, 1 - cx)) horizontally, same with cy down.
const COVER_W = 1.09;
const COVER_H = 1.11;

// Pure geometry so it can be tested without a DOM: given a viewport, where
// does the photo go and how big is the lens display box carved into it.
export function glassesGeometry(vw: number, vh: number) {
  const cover = Math.max(COVER_H * vh, (COVER_W * vw) / IMAGE_ASPECT);
  const widthCap = (vw * LENS_MAX_W) / (LENS.width * IMAGE_ASPECT);
  const dispH = Math.min(Math.max(cover, (vh * FILL_MIN) / FRAME_SPAN), (vh * FILL_MAX) / FRAME_SPAN, widthCap);
  const dispW = dispH * IMAGE_ASPECT;
  const boxW = LENS.width * dispW;
  const boxH = boxW / LENS.aspect;
  return {
    dispW,
    dispH,
    photoLeft: vw / 2 - LENS.cx * dispW,
    photoTop: vh / 2 - LENS.cy * dispH,
    boxLeft: vw / 2 - boxW / 2,
    boxTop: vh / 2 - boxH / 2,
    boxW,
    boxH,
    frameHeight: FRAME_SPAN * dispH,
  };
}

function feed(line: string) {
  document.dispatchEvent(new CustomEvent<string>("agent-feed", { detail: line }));
}

export class GlassesMode {
  private button: HTMLButtonElement;
  private backdrop: HTMLElement;
  private photo!: HTMLImageElement;
  private chrome: HTMLElement;
  private app: HTMLElement;
  private enabled = false;
  private hintEl: HTMLElement | null = null;
  private bootEl: HTMLElement;
  private bootTimer: number | null = null;

  constructor() {
    this.button = document.querySelector<HTMLButtonElement>("#glasses-toggle")!;
    this.app = document.querySelector<HTMLElement>("#app")!;
    this.backdrop = this.buildBackdrop();
    this.chrome = this.buildChrome();
    this.bootEl = this.buildBoot();
    this.button.addEventListener("click", () => this.toggle());
    window.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key !== "g" && key !== "b") return;
      const t = event.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable='true']")) return;
      if (key === "g") {
        this.toggle();
      } else if (this.enabled) {
        feed("glasses · boot replay (B)");
        this.boot();
      }
    });
    window.addEventListener("resize", () => this.reposition());

    const param = new URLSearchParams(location.search).get("glasses");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be disabled in restricted in-app browsers.
    }
    if (param === "1" || (param === null && saved === "1")) this.toggle(true, true);
    else if (param === null && saved === null) this.showHint();
  }

  get active() {
    return this.enabled;
  }

  // First-visit nudge: the lens is the pitch but the desktop is the working
  // baseline, so the chip advertises the glasses view once instead of the app
  // opening in it. Any toggle writes STORAGE_KEY, so the hint never returns.
  private showHint() {
    this.button.classList.add("hint");
    this.hintEl = document.createElement("span");
    this.hintEl.id = "glasses-hint";
    this.hintEl.textContent = "see it in a lens · G";
    this.button.appendChild(this.hintEl);
  }

  private hideHint() {
    if (!this.hintEl) return;
    this.button.classList.remove("hint");
    this.hintEl.remove();
    this.hintEl = null;
  }

  toggle(force?: boolean, silent = false) {
    this.hideHint();
    this.enabled = force ?? !this.enabled;
    document.body.classList.toggle("glasses-on", this.enabled);
    document.dispatchEvent(new CustomEvent("surface-contextchange", { detail: { context: this.enabled ? "glasses" : "desktop" } }));
    this.backdrop.hidden = !this.enabled;
    this.chrome.hidden = !this.enabled;
    this.button.textContent = this.enabled ? "Glasses on" : "Glasses";
    this.button.classList.toggle("on", this.enabled);
    if (this.enabled) {
      this.reposition();
      this.boot();
    } else {
      this.cancelBoot();
      for (const prop of ["position", "left", "top", "width", "height", "transform"] as const) {
        this.app.style[prop] = "";
      }
    }
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? "1" : "0");
    } catch {
      // Session-only is fine.
    }
    if (!silent) feed(this.enabled ? "glasses · monocular simulation on" : "glasses · simulation off");
  }

  // Power-on sequence for filming: the frame holds with a dark, empty lens,
  // a light strip ignites across it, the WEBHUD wordmark flares, a scanline
  // sweeps, and the live UI materializes. Every phase is CSS keyframes driven
  // by `body.glasses-booting`; this just restarts and later clears the class.
  // Plays on every glasses entry; press B (in glasses mode) to replay it.
  boot() {
    if (!this.enabled) return;
    this.cancelBoot();
    this.bootEl.hidden = false;
    void this.bootEl.offsetWidth;
    document.body.classList.add("glasses-booting");
    this.bootTimer = window.setTimeout(() => this.cancelBoot(), BOOT_MS);
  }

  private cancelBoot() {
    if (this.bootTimer !== null) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
    document.body.classList.remove("glasses-booting");
    this.bootEl.hidden = true;
  }

  // Scale the photo so the frame fills the viewport height (never cropped),
  // pin the lens centre to the viewport centre, and grow the photo beyond
  // that only as far as it takes to cover a wide window. The app gets a real
  // box of the lens's size — resize, not scale, so the UI reflows to it.
  private reposition() {
    if (!this.enabled) return;
    const g = glassesGeometry(window.innerWidth, window.innerHeight);
    Object.assign(this.photo.style, {
      left: `${g.photoLeft.toFixed(1)}px`,
      top: `${g.photoTop.toFixed(1)}px`,
      width: `${g.dispW.toFixed(1)}px`,
      height: `${g.dispH.toFixed(1)}px`,
    });
    Object.assign(this.app.style, {
      position: "fixed",
      left: `${g.boxLeft.toFixed(1)}px`,
      top: `${g.boxTop.toFixed(1)}px`,
      width: `${g.boxW.toFixed(1)}px`,
      height: `${g.boxH.toFixed(1)}px`,
    });
    Object.assign(this.bootEl.style, {
      left: `${g.boxLeft.toFixed(1)}px`,
      top: `${g.boxTop.toFixed(1)}px`,
      width: `${g.boxW.toFixed(1)}px`,
      height: `${g.boxH.toFixed(1)}px`,
    });
  }

  private buildBackdrop(): HTMLElement {
    const el = document.createElement("div");
    el.id = "glasses-backdrop";
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <img class="ambient" src="/glasses-pov.jpg" alt="" draggable="false" />
      <img class="pov" src="/glasses-pov.jpg" alt="" draggable="false" />`;
    document.body.appendChild(el);
    this.photo = el.querySelector<HTMLImageElement>(".pov")!;
    return el;
  }

  private buildBoot(): HTMLElement {
    const el = document.createElement("div");
    el.id = "glasses-boot";
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="boot-strip"></div>
      <div class="boot-mark">
        <span class="boot-name">WEBHUD</span>
        <span class="boot-tag">a web page · your agent · any glass</span>
      </div>
      <div class="boot-scan"></div>`;
    document.body.appendChild(el);
    return el;
  }

  private buildChrome(): HTMLElement {
    const el = document.createElement("div");
    el.id = "glasses-chrome";
    el.hidden = true;
    el.innerHTML = `
      <span class="glasses-label">GLASSES SIMULATION · monocular display</span>
      <button id="glasses-exit" type="button">Exit glasses view · G</button>`;
    el.querySelector("#glasses-exit")!.addEventListener("click", () => this.toggle(false));
    document.body.appendChild(el);
    return el;
  }
}

export function attachGlassesMode() {
  return new GlassesMode();
}
