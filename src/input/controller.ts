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

export function keyInputToken(key: string): string | null {
  if (!key || MODIFIER_KEYS.has(key)) return null;
  return `key:${key}`;
}

export function pointerInputToken(button: number): string {
  return `pointer:${button}`;
}

export function wheelInputToken(deltaX: number, deltaY: number): string | null {
  if (deltaX === 0 && deltaY === 0) return null;
  const axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
  const delta = axis === "x" ? deltaX : deltaY;
  return `wheel:${axis}:${delta > 0 ? "+" : "-"}`;
}

export function actionForToken(bindings: ControllerBindings, token: string | null): ControllerAction | null {
  if (!token) return null;
  return ACTIONS.find((action) => bindings[action] === token) ?? null;
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
  if (kind === "pointer") return value === "0" ? "Mouse click" : `Mouse button ${Number(value) + 1}`;
  if (kind === "wheel") {
    if (value === "x") return direction === "+" ? "Wheel right" : "Wheel left";
    return direction === "+" ? "Wheel down" : "Wheel up";
  }
  return token;
}

export class WheelInputDetector {
  private acc = 0;
  private token: string | null = null;
  private cooldownUntil = 0;

  push(deltaX: number, deltaY: number, at: number): string | null {
    if (at < this.cooldownUntil) return null;
    const token = wheelInputToken(deltaX, deltaY);
    if (!token) return null;
    const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    if (token !== this.token) {
      this.token = token;
      this.acc = delta;
    } else {
      this.acc += delta;
    }
    if (Math.abs(this.acc) < 120) return null;
    this.acc = 0;
    this.token = null;
    this.cooldownUntil = at + 560;
    return token;
  }

  reset() {
    this.acc = 0;
    this.token = null;
    this.cooldownUntil = 0;
  }
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

function validBindings(value: unknown): ControllerBindings {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const bindings: ControllerBindings = {};
  for (const action of SETUP_ORDER) {
    if (typeof source[action] === "string" && source[action]) bindings[action] = source[action] as string;
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
  private wheel = new WheelInputDetector();
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
    window.addEventListener("pointerdown", this.onPointerDown, true);
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

  private load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as SavedController | null;
      if (parsed?.version === 1) {
        this.bindings = validBindings(parsed.bindings);
        this.enabled = parsed.enabled === true && ACTIONS.every((action) => Boolean(this.bindings[action]));
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

  private openPanel() {
    this.panel.hidden = false;
    if (!this.configured) this.beginSetup();
    else this.render();
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
    this.wheel.reset();
    this.render();
  }

  // Abandoning setup must not destroy a working configuration: restore
  // whatever was learned before "Relearn controls" was pressed.
  private cancelSetup() {
    if (this.learningIndex < 0) return;
    this.learningIndex = -1;
    if (this.setupBackup) {
      this.bindings = { ...this.setupBackup.bindings };
      this.enabled = this.setupBackup.enabled && this.configured;
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
    this.enabled = enabled && this.configured;
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
    this.captureReadyAt = performance.now() + 250;
    this.wheel.reset();
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
      const action = actionForToken(this.bindings, keyInputToken(event.key));
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

  private onPointerDown = (event: PointerEvent) => {
    const token = pointerInputToken(event.button);
    if (this.learningIndex >= 0) {
      // A ring click anywhere is learnable, but clicking the panel's own
      // controls is clearly intent to press them (e.g. Close to cancel).
      const target = event.target as Element | null;
      if (target?.closest?.("[data-controller-ui] button, [data-controller-ui] input, [data-controller-ui] label")) return;
      if (this.capture(token)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (isInteractiveTarget(event.target) || (event.target as Element | null)?.closest?.("[data-controller-ui]")) return;
    if (!this.enabled) return;
    const action = actionForToken(this.bindings, token);
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.perform(action);
  };

  private onWheel = (event: WheelEvent) => {
    const immediateToken = wheelInputToken(event.deltaX, event.deltaY);
    if (this.learningIndex >= 0) {
      const token = this.wheel.push(event.deltaX, event.deltaY, performance.now());
      if (token && this.capture(token)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (!this.enabled) return;
    // Reading beats navigating: wheel over an open document always scrolls it,
    // even when a wheel direction is a learned ring binding.
    if ((event.target as Element | null)?.closest?.(".reader")) {
      this.wheel.reset();
      return;
    }
    const immediateAction = actionForToken(this.bindings, immediateToken);
    if (immediateAction) event.preventDefault();
    const token = this.wheel.push(event.deltaX, event.deltaY, performance.now());
    const action = actionForToken(this.bindings, token);
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.perform(action);
  };

  private render() {
    this.button.textContent = this.enabled ? "Ring on" : "Controller";
    this.button.classList.toggle("on", this.enabled);
    this.modeToggle.checked = this.enabled;
    this.modeToggle.disabled = !this.configured;
    this.startButton.textContent = this.configured ? "Relearn controls" : "Start setup";
    this.resetButton.hidden = !this.configured;

    for (const action of SETUP_ORDER) {
      const row = this.panel.querySelector<HTMLElement>(`[data-controller-action='${action}']`)!;
      const value = row.querySelector<HTMLElement>(".controller-binding")!;
      row.classList.toggle("current", SETUP_ORDER[this.learningIndex] === action);
      row.classList.toggle("learned", Boolean(this.bindings[action]));
      value.textContent = describeInputToken(this.bindings[action]);
    }
    this.skipButton.hidden = !(this.learningIndex >= ACTIONS.length && this.learningIndex < SETUP_ORDER.length);

    const current = SETUP_ORDER[this.learningIndex];
    if (current && OPTIONAL_ACTIONS.includes(current))
      this.status.textContent = `Optional: press ${ACTION_LABELS[current]} on the ring — or Skip to use 3 buttons`;
    else if (current) this.status.textContent = `Press ${ACTION_LABELS[current]} once on the ring`;
    else if (!this.configured) this.status.textContent = "Teach the page three ring buttons — Down/Up are optional";
    else if (this.enabled) this.status.textContent = "Ring Mode is on · learned controls only";
    else this.status.textContent = "Ready · enable Ring Mode when using the ring";
  }

  private feed(message: string) {
    document.dispatchEvent(new CustomEvent("agent-feed", { detail: message }));
  }
}

export function attachControllerInput(store: Store) {
  return new ControllerInput(store);
}
