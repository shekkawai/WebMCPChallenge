import type { Store } from "../state/store";

export type ControllerAction = "previous" | "next" | "select";
export type ControllerBindings = Partial<Record<ControllerAction, string>>;

type SavedController = {
  version: 1;
  enabled: boolean;
  bindings: ControllerBindings;
};

const STORAGE_KEY = "webmcp-surface-controller-v1";
const ACTIONS: ControllerAction[] = ["previous", "next", "select"];
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

export type LocalSelectResult = "opened" | "selected" | "closed" | "dismissed" | "confirmation-required" | "none";

export function activateFocused(store: Store): LocalSelectResult {
  const state = store.state;
  if (state.view === "done") {
    store.dismissDone();
    return "dismissed";
  }
  if (state.view === "calendar") return state.proposals.length ? "confirmation-required" : "none";
  const stack = store.activeStack();
  if (!stack || !stack.items.length) return "none";
  const item = stack.items[stack.focusIndex];
  if (!item) return "none";
  if (item.kind === "option" || item.design) {
    return store.selectOption(item.id) ? "selected" : "none";
  }
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
  for (const action of ACTIONS) {
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
  private resetButton: HTMLButtonElement;
  private modeToggle: HTMLInputElement;
  private status: HTMLElement;
  private bindings: ControllerBindings = {};
  private enabled = false;
  private learningIndex = -1;
  private captureReadyAt = 0;
  private wheel = new WheelInputDetector();

  constructor(store: Store) {
    this.store = store;
    this.button = document.querySelector<HTMLButtonElement>("#controller-toggle")!;
    this.panel = document.querySelector<HTMLElement>("#controller-panel")!;
    this.closeButton = document.querySelector<HTMLButtonElement>("#controller-close")!;
    this.startButton = document.querySelector<HTMLButtonElement>("#controller-start")!;
    this.resetButton = document.querySelector<HTMLButtonElement>("#controller-reset")!;
    this.modeToggle = document.querySelector<HTMLInputElement>("#controller-mode")!;
    this.status = document.querySelector<HTMLElement>("#controller-status")!;
    this.load();
    this.render();

    this.button.addEventListener("click", () => this.openPanel());
    this.closeButton.addEventListener("click", () => this.closePanel());
    this.startButton.addEventListener("click", () => this.beginSetup());
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
    this.learningIndex = -1;
    this.panel.hidden = true;
    this.render();
  }

  private beginSetup() {
    this.bindings = {};
    this.enabled = false;
    this.learningIndex = 0;
    this.captureReadyAt = performance.now() + 250;
    this.wheel.reset();
    this.render();
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
    const action = ACTIONS[this.learningIndex];
    if (!action) return false;
    if (Object.values(this.bindings).includes(token)) {
      this.status.textContent = `${describeInputToken(token)} is already used — press a different button`;
      return true;
    }
    this.bindings[action] = token;
    this.learningIndex += 1;
    this.captureReadyAt = performance.now() + 250;
    this.wheel.reset();
    if (this.learningIndex >= ACTIONS.length) {
      this.learningIndex = -1;
      this.enabled = true;
      this.save();
      this.feed("controller · setup complete · Ring Mode on");
    }
    this.render();
    return true;
  }

  private perform(action: ControllerAction) {
    if (action === "previous" || action === "next") {
      this.store.swipe(action === "next" ? 1 : -1);
      this.feed(`controller · ${action}`);
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
    if (event.repeat) return;
    if (this.learningIndex >= 0) {
      if (event.key === "Escape") {
        event.preventDefault();
        this.learningIndex = -1;
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
    }
  };

  private onPointerDown = (event: PointerEvent) => {
    const token = pointerInputToken(event.button);
    if (this.learningIndex >= 0) {
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

    for (const action of ACTIONS) {
      const row = this.panel.querySelector<HTMLElement>(`[data-controller-action='${action}']`)!;
      const value = row.querySelector<HTMLElement>(".controller-binding")!;
      row.classList.toggle("current", ACTIONS[this.learningIndex] === action);
      row.classList.toggle("learned", Boolean(this.bindings[action]));
      value.textContent = describeInputToken(this.bindings[action]);
    }

    const current = ACTIONS[this.learningIndex];
    if (current) this.status.textContent = `Press ${current} once on the ring`;
    else if (!this.configured) this.status.textContent = "Teach the page three ring buttons";
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
