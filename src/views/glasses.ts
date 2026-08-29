// Glasses simulation — a purely presentational mode for filming the
// "smart-responsive" story. The page is unchanged underneath: every input
// channel (agent tools, palm, ring, keys) keeps working while the surface is
// projected into the right lens only, matching real monocular hardware.
const STORAGE_KEY = "webmcp-surface-glasses";

function feed(line: string) {
  document.dispatchEvent(new CustomEvent<string>("agent-feed", { detail: line }));
}

export class GlassesMode {
  private button: HTMLButtonElement;
  private overlay: HTMLElement;
  private enabled = false;

  constructor() {
    this.button = document.querySelector<HTMLButtonElement>("#glasses-toggle")!;
    this.overlay = this.buildOverlay();
    this.button.addEventListener("click", () => this.toggle());
    window.addEventListener("keydown", (event) => {
      if (event.repeat || event.key.toLowerCase() !== "g") return;
      const t = event.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable='true']")) return;
      this.toggle();
    });

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
    this.overlay.hidden = !this.enabled;
    this.button.textContent = this.enabled ? "Glasses on" : "Glasses";
    this.button.classList.toggle("on", this.enabled);
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? "1" : "0");
    } catch {
      // Session-only is fine.
    }
    if (!silent) feed(this.enabled ? "glasses · monocular simulation on (right eye)" : "glasses · simulation off");
  }

  private buildOverlay(): HTMLElement {
    const el = document.createElement("div");
    el.id = "glasses-overlay";
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <mask id="glasses-mask">
            <rect width="1600" height="900" fill="white"/>
            <ellipse cx="428" cy="462" rx="336" ry="296" fill="black"/>
            <ellipse cx="1172" cy="462" rx="336" ry="296" fill="black"/>
          </mask>
          <linearGradient id="glasses-sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="rgba(255,255,255,0.10)"/>
            <stop offset="0.4" stop-color="rgba(255,255,255,0.02)"/>
            <stop offset="1" stop-color="rgba(255,255,255,0)"/>
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="rgba(3,5,11,0.94)" mask="url(#glasses-mask)"/>
        <ellipse class="lens-rim" cx="428" cy="462" rx="336" ry="296"/>
        <ellipse class="lens-rim" cx="1172" cy="462" rx="336" ry="296"/>
        <ellipse cx="428" cy="462" rx="336" ry="296" fill="url(#glasses-sheen)"/>
        <ellipse cx="1172" cy="462" rx="336" ry="296" fill="url(#glasses-sheen)"/>
        <path class="glasses-bridge" d="M760 396 q40 -34 80 0"/>
        <path class="glasses-temple" d="M92 430 q-60 8 -90 34"/>
        <path class="glasses-temple" d="M1508 430 q60 8 90 34"/>
      </svg>
      <span class="glasses-label">GLASSES SIMULATION · monocular display · right eye</span>
      <button id="glasses-exit" type="button">Exit glasses view · G</button>`;
    el.querySelector("#glasses-exit")!.addEventListener("click", () => this.toggle(false));
    document.body.appendChild(el);
    return el;
  }
}

export function attachGlassesMode() {
  return new GlassesMode();
}
