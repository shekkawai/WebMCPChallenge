import type { Store } from "../state/store";

export type ControllerAction = "previous" | "next" | "select" | "down" | "up";
export type ControllerBindings = Partial<Record<ControllerAction, string>>;

type SavedController = {
  version: 1;
  enabled: boolean;
  bindings: ControllerBindings;
};

const STORAGE_KEY = "webmcp-surface-controller-v1";
// Three required buttons make any ring work; Down/Up are optional extras for
// 4-direction rings (D-pad model: Down focuses the dock, Up returns).
const ACTIONS: ControllerAction[] = ["previous", "next", "select"];
const OPTIONAL_ACTIONS: ControllerAction[] = ["down", "up"];
const SETUP_ORDER: ControllerAction[] = [...ACTIONS, ...OPTIONAL_ACTIONS];
const ACTION_LABELS: Record<ControllerAction, string> = {
  previous: "Previous",
  next: "Next",
  select: "Select",
  down: "Down",
  up: "Up",
};
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock"]);

// Scroll rings behave as a mouse wheel, so Ring Mode works with zero setup:
// flip it on and scrolling swipes the deck. Setup exists only to REMAP for
// rings that send different signals — it is not a prerequisite.
export const DEFAULT_BINDINGS: ControllerBindings = {
  previous: "wheel:y:-",
  next: "wheel:y:+",
  select: "key:Enter",
};

export function keyInputToken(key: string): string | null {
  if (!key || MODIFIER_KEYS.has(key)) return null;
  return `key:${key}`;
}

export function wheelInputToken(deltaX: number, deltaY: number): string | null {
  if (deltaX === 0 && deltaY === 0) return null;
  const axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
  const delta = axis === "x" ? deltaX : deltaY;
  return `wheel:${axis}:${delta > 0 ? "+" : "-"}`;
}

export function actionForToken(bindings: ControllerBindings, token: string | null): ControllerAction | null {
  if (!token) return null;
  return SETUP_ORDER.find((action) => bindings[action] === token) ?? null;
}

// Vertical scroll keys read the open document instead of acting on the deck,
// mirroring the wheel's "reading beats navigating" rule. Returns the scroll
// delta in px for a reader viewport of the given height, or null for other keys.
export function readerScrollStep(key: string, viewportHeight: number): number | null {
  if (key === "ArrowUp") return -90;
  if (key === "ArrowDown") return 90;
  if (key === "PageUp") return -Math.round(viewportHeight * 0.8);
  if (key === "PageDown") return Math.round(viewportHeight * 0.8);
  return null;
}

export function describeInputToken(token: string | undefined): string {
  if (!token) return "Not learned";
  const [kind, value, direction] = token.split(":");
  if (kind === "key") return value === " " ? "Space" : value;
  if (kind === "wheel") {
    if (value === "x") return direction === "+" ? "Wheel right" : "Wheel left";
    return direction === "+" ? "Wheel down" : "Wheel up";
  }
  return token;
}

export type LocalSelectResult = "opened" | "selected" | "closed" | "dismissed" | "switched" | "confirmation-required" | "none";

export function activateFocused(store: Store): LocalSelectResult {
  const state = store.state;
  // While the D-pad highlight sits on the dock, Select opens that tab.
  if (state.dockFocus !== null) {
    return store.activateDockFocus() ? "switched" : "none";
  }
  if (state.view === "done") {
    store.dismissDone();
    return "dismissed";
  }
  if (state.view === "calendar") return state.proposals.length ? "confirmation-required" : "none";
  const stack = store.activeStack();
  if (!stack || !stack.items.length) return "none";
  const item = stack.items[stack.focusIndex];
  if (!item) return "none";
  if (item.kind === "option" || item.design || stack.purpose === "choose") {
    return store.selectOption(item.id) ? "selected" : "none";
  }
  if (stack.purpose === "triage") return store.toggleItem(item.id) ? "selected" : "none";
  if (state.view === "reader") {
    store.closeItem();
    return "closed";
  }
  return store.openItem(item.id) ? "opened" : "none";
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
}

// Mouse clicks are no longer learnable (a saved pointer binding hijacked
// every ordinary click), so stale pointer tokens are purged on load.
export function validBindings(value: unknown): ControllerBindings {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const bindings: ControllerBindings = {};
  for (const action of SETUP_ORDER) {
    const token = source[action];
    if (typeof token === "string" && token && !token.startsWith("pointer:")) bindings[action] = token;
  }
  return bindings;
}

export class ControllerInput {
  private store: Store;
  private button: HTMLButtonElement;
  private panel: HTMLElement;
  private closeButton: HTMLButtonElement;
  private startButton: HTMLButtonElement;
  private skipButton: HTMLButtonElement;
  private resetButton: HTMLButtonElement;
  private modeToggle: HTMLInputElement;
  private status: HTMLElement;
  private bindings: ControllerBindings = {};
  private enabled = false;
  private learningIndex = -1;
  private captureReadyAt = 0;
  private wheelCooldownUntil = 0;
  private setupBackup: { enabled: boolean; bindings: ControllerBindings } | null = null;

  constructor(store: Store) {
    this.store = store;
    this.button = document.querySelector<HTMLButtonElement>("#controller-toggle")!;
    this.panel = document.querySelector<HTMLElement>("#controller-panel")!;
    this.closeButton = document.querySelector<HTMLButtonElement>("#controller-close")!;
    this.startButton = document.querySelector<HTMLButtonElement>("#controller-start")!;
    this.skipButton = document.querySelector<HTMLButtonElement>("#controller-skip")!;
    this.resetButton = document.querySelector<HTMLButtonElement>("#controller-reset")!;
    this.modeToggle = document.querySelector<HTMLInputElement>("#controller-mode")!;
    this.status = document.querySelector<HTMLElement>("#controller-status")!;
    this.load();
    this.render();

    this.button.addEventListener("click", () => this.openPanel());
    this.closeButton.addEventListener("click", () => this.closePanel());
    this.startButton.addEventListener("click", () => this.beginSetup());
    this.skipButton.addEventListener("click", () => this.finishSetup());
    this.resetButton.addEventListener("click", () => this.reset());
    this.modeToggle.addEventListener("change", () => this.setEnabled(this.modeToggle.checked));
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
  }

  get active() {
    return this.enabled;
  }

  get configured() {
    return ACTIONS.every((action) => Boolean(this.bindings[action]));
  }

  get learnedBindings(): ControllerBindings {
    return { ...this.bindings };
  }

  // A complete learned set replaces the defaults outright — mixing the two
  // would double-bind the wheel. No learned set means the scroll-ring defaults.
  private get activeBindings(): ControllerBindings {
    return this.configured ? this.bindings : DEFAULT_BINDINGS;
  }

  private load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as SavedController | null;
      if (parsed?.version === 1) {
        this.bindings = validBindings(parsed.bindings);
        this.enabled = parsed.enabled === true;
      }
    } catch {
      this.bindings = {};
      this.enabled = false;
    }
  }

  private save() {
    try {
      const value: SavedController = { version: 1, enabled: this.enabled, bindings: this.bindings };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Restricted in-app browsers can disable storage; the session still works.
    }
  }

  // Opening the panel never auto-starts the learn flow — defaults mean there
  // is nothing a scroll ring needs to learn. Setup is reached by its button.
  private openPanel() {
    this.panel.hidden = false;
    this.render();
  }

  private closePanel() {
    this.cancelSetup();
    this.panel.hidden = true;
    this.render();
  }

  private beginSetup() {
    this.setupBackup = { enabled: this.enabled, bindings: { ...this.bindings } };
    this.bindings = {};
    this.enabled = false;
    this.learningIndex = 0;
    this.captureReadyAt = performance.now() + 250;
    this.render();
  }

  // Abandoning setup must not destroy a working configuration: restore
  // whatever was learned before "Relearn controls" was pressed.
  private cancelSetup() {
    if (this.learningIndex < 0) return;
    this.learningIndex = -1;
    if (this.setupBackup) {
      this.bindings = { ...this.setupBackup.bindings };
      this.enabled = this.setupBackup.enabled;
      this.setupBackup = null;
    }
  }

  private reset() {
    this.bindings = {};
    this.enabled = false;
    this.learningIndex = -1;
    this.save();
    this.render();
  }

  private setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.learningIndex = -1;
    this.save();
    this.render();
    this.feed(this.enabled ? "controller · Ring Mode on" : "controller · Ring Mode off");
  }

  private capture(token: string) {
    if (this.learningIndex < 0 || performance.now() < this.captureReadyAt) return false;
    const action = SETUP_ORDER[this.learningIndex];
    if (!action) return false;
    if (Object.values(this.bindings).includes(token)) {
      this.status.textContent = `${describeInputToken(token)} is already used — press a different button`;
      return true;
    }
    this.bindings[action] = token;
    this.learningIndex += 1;
    // One ring press can arrive as a burst of wheel events; a longer gap
    // between steps stops the tail of one press learning the next button.
    this.captureReadyAt = performance.now() + 600;
    if (this.learningIndex >= SETUP_ORDER.length) this.finishSetup();
    else this.render();
    return true;
  }

  // Ends setup with whatever is learned so far — reached automatically after
  // all five steps, or via Skip once the three required buttons are in.
  private finishSetup() {
    if (this.learningIndex < 0 || !this.configured) return;
    this.learningIndex = -1;
    this.setupBackup = null;
    this.enabled = true;
    this.save();
    this.feed("controller · setup complete · Ring Mode on");
    this.render();
  }

  private perform(action: ControllerAction) {
    if (action === "previous" || action === "next") {
      this.store.swipe(action === "next" ? 1 : -1);
      this.feed(`controller · ${action}`);
      return;
    }
    if (action === "down" || action === "up") {
      // Reading beats navigating: in an open document, vertical ring buttons scroll it.
      if (this.store.state.view === "reader") {
        document.querySelector(".reader")?.scrollBy({ top: action === "down" ? 90 : -90, behavior: "smooth" });
        return;
      }
      if (action === "down") {
        if (this.store.focusDock()) this.feed("controller · dock focus");
      } else if (this.store.blurDock()) {
        this.feed("controller · back to cards");
      }
      return;
    }
    const result = activateFocused(this.store);
    if (result === "confirmation-required") {
      this.feed("controller · selection highlighted · confirm the calendar action by voice");
    } else if (result !== "none") {
      this.feed(`controller · ${result}`);
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    // Reading beats navigating, for keys as for the wheel: while a document is
    // open, vertical scroll keys scroll it — even when learned as ring
    // bindings, and with key repeat allowed so a held key keeps scrolling.
    if (this.learningIndex < 0 && !isInteractiveTarget(event.target) && this.store.state.view === "reader") {
      const step = readerScrollStep(event.key, document.querySelector(".reader")?.clientHeight ?? 0);
      if (step !== null) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.querySelector(".reader")?.scrollBy({ top: step, behavior: "smooth" });
        return;
      }
    }
    if (event.repeat) return;
    if (this.learningIndex >= 0) {
      if (event.key === "Escape") {
        event.preventDefault();
        this.cancelSetup();
        this.render();
        return;
      }
      const token = keyInputToken(event.key);
      if (token && this.capture(token)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (isInteractiveTarget(event.target)) return;
    if (this.enabled) {
      const action = actionForToken(this.activeBindings, keyInputToken(event.key));
      if (action) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.perform(action);
        return;
      }
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      this.store.swipe(event.key === "ArrowRight" ? 1 : -1);
      return;
    }
    // D-pad baseline, mirrored 1:1 by rings that emit real arrow keys:
    // Down drops focus onto the dock, Up (or Escape) returns to the stage.
    // The reader is untouched — its scroll handling ran above.
    if (event.key === "ArrowDown") {
      if (this.store.focusDock()) {
        event.preventDefault();
        this.feed("controller · dock focus");
      }
      return;
    }
    if (event.key === "ArrowUp" || event.key === "Escape") {
      if (this.store.blurDock()) event.preventDefault();
      return;
    }
    // Enter = the D-pad's A button: opens the highlighted dock tab or the
    // focused card. Local-only — calendar writes and sending still need voice.
    if (event.key === "Enter") {
      const result = activateFocused(this.store);
      if (result === "none") return;
      event.preventDefault();
      this.feed(
        result === "confirmation-required"
          ? "controller · confirm the calendar action by voice"
          : `controller · ${result}`,
      );
    }
  };

  // Ring presses arrive as single wheel events (often tiny line-unit deltas),
  // so both setup and Ring Mode act on the FIRST event of a press — no pixel
  // accumulator, which a ring could never satisfy. A cooldown turns the burst
  // a single press can emit into one action.
  private onWheel = (event: WheelEvent) => {
    const token = wheelInputToken(event.deltaX, event.deltaY);
    if (this.learningIndex >= 0) {
      if (!token) return;
      // Setup owns the wheel completely — the page must not scroll while a
      // press is being learned, including the cooldown tail of the last one.
      event.preventDefault();
      event.stopImmediatePropagation();
      this.capture(token);
      return;
    }
    if (!this.enabled) return;
    // Reading beats navigating: wheel over an open document always scrolls it,
    // even though the wheel directions are (default or learned) bindings.
    if ((event.target as Element | null)?.closest?.(".reader")) return;
    const action = actionForToken(this.activeBindings, token);
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = performance.now();
    if (now < this.wheelCooldownUntil) return;
    this.wheelCooldownUntil = now + 420;
    this.perform(action);
  };

  private render() {
    this.button.textContent = this.enabled ? "Ring on" : "Controller";
    this.button.classList.toggle("on", this.enabled);
    this.modeToggle.checked = this.enabled;
    this.startButton.textContent = this.configured ? "Relearn controls" : "Remap buttons";
    this.resetButton.hidden = !this.configured;

    const learning = this.learningIndex >= 0;
    for (const action of SETUP_ORDER) {
      const row = this.panel.querySelector<HTMLElement>(`[data-controller-action='${action}']`)!;
      const value = row.querySelector<HTMLElement>(".controller-binding")!;
      const shown = learning ? this.bindings[action] : this.activeBindings[action];
      row.classList.toggle("current", SETUP_ORDER[this.learningIndex] === action);
      row.classList.toggle("learned", Boolean(shown));
      value.textContent = learning || this.configured ? describeInputToken(shown) : shown ? `${describeInputToken(shown)} · default` : "—";
    }
    this.skipButton.hidden = !(this.learningIndex >= ACTIONS.length && this.learningIndex < SETUP_ORDER.length);

    const current = SETUP_ORDER[this.learningIndex];
    if (current && OPTIONAL_ACTIONS.includes(current))
      this.status.textContent = `Optional: press ${ACTION_LABELS[current]} on the ring — or Skip to use 3 buttons`;
    else if (current) this.status.textContent = `Press ${ACTION_LABELS[current]} once on the ring`;
    else if (this.enabled && !this.configured) this.status.textContent = "Ring Mode on · scroll = Previous / Next, Enter = Select";
    else if (this.enabled) this.status.textContent = "Ring Mode is on · learned controls only";
    else if (!this.configured) this.status.textContent = "Scroll rings work out of the box — just turn Ring Mode on";
    else this.status.textContent = "Ready · enable Ring Mode when using the ring";
  }

  private feed(message: string) {
    document.dispatchEvent(new CustomEvent("agent-feed", { detail: message }));
  }
}

export function attachControllerInput(store: Store) {
  return new ControllerInput(store);
}
