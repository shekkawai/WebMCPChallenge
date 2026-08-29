// Glasses simulation — a purely presentational mode for filming the
// "smart-responsive" story. A real POV photo (looking through one lens at the
// world) covers the viewport, and the live surface is projected inside the
// lens like an AR display. The page is unchanged underneath: every input
// channel (agent tools, palm, ring, keys) keeps working.
const STORAGE_KEY = "webmcp-surface-glasses";

// Where the lens sits inside the photo, as fractions of the image, and the
// display box carved into it. Tuned by eye against public/glasses-pov.jpg —
// adjust here if the photo changes. `aspect` is the glasses breakpoint: the
// app is given a real near-square viewport of this shape (not scaled down),
// so the layout genuinely reflows to fit the lens.
const IMAGE_ASPECT = 1920 / 1334;
const LENS = { cx: 0.523, cy: 0.54, width: 0.44, aspect: 1.18 };

function feed(line: string) {
  document.dispatchEvent(new CustomEvent<string>("agent-feed", { detail: line }));
}

export class GlassesMode {
  private button: HTMLButtonElement;
  private backdrop: HTMLElement;
  private chrome: HTMLElement;
  private app: HTMLElement;
  private enabled = false;

  constructor() {
    this.button = document.querySelector<HTMLButtonElement>("#glasses-toggle")!;
    this.app = document.querySelector<HTMLElement>("#app")!;
    this.backdrop = this.buildBackdrop();
    this.chrome = this.buildChrome();
    this.button.addEventListener("click", () => this.toggle());
    window.addEventListener("keydown", (event) => {
      if (event.repeat || event.key.toLowerCase() !== "g") return;
      const t = event.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable='true']")) return;
      this.toggle();
    });
    window.addEventListener("resize", () => this.reposition());

    const param = new URLSearchParams(location.search).get("glasses");
    let saved = false;
    try {
      saved = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // Storage can be disabled in restricted in-app browsers.
    }
    if (param === "1" || (param === null && saved)) this.toggle(true, true);
  }

  get active() {
    return this.enabled;
  }

  toggle(force?: boolean, silent = false) {
    this.enabled = force ?? !this.enabled;
    document.body.classList.toggle("glasses-on", this.enabled);
    this.backdrop.hidden = !this.enabled;
    this.chrome.hidden = !this.enabled;
    this.button.textContent = this.enabled ? "Glasses on" : "Glasses";
    this.button.classList.toggle("on", this.enabled);
    if (this.enabled) {
      this.reposition();
    } else {
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

  // The photo covers the viewport (object-fit: cover). Recompute where the
  // lens landed on screen and give the app a real box of that size — resize,
  // not scale, so the UI reflows to the lens shape and text stays readable.
  private reposition() {
    if (!this.enabled) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dispH = Math.max(vh, vw / IMAGE_ASPECT);
    const dispW = dispH * IMAGE_ASPECT;
    const offsetX = (vw - dispW) / 2;
    const offsetY = (vh - dispH) / 2;
    const cx = offsetX + LENS.cx * dispW;
    const cy = offsetY + LENS.cy * dispH;
    const w = LENS.width * dispW;
    const h = w / LENS.aspect;
    Object.assign(this.app.style, {
      position: "fixed",
      left: `${(cx - w / 2).toFixed(1)}px`,
      top: `${(cy - h / 2).toFixed(1)}px`,
      width: `${w.toFixed(1)}px`,
      height: `${h.toFixed(1)}px`,
    });
  }

  private buildBackdrop(): HTMLElement {
    const el = document.createElement("div");
    el.id = "glasses-backdrop";
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<img src="/glasses-pov.jpg" alt="" draggable="false" />`;
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
