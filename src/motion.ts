export type CardRole = "focus" | "prev" | "next" | "far-left" | "far-right";
export type StageMotion = "swipe" | "surface" | "refresh";

const CARD_ROLES: CardRole[] = ["focus", "prev", "next", "far-left", "far-right"];

export function cardRole(index: number, focusIndex: number): CardRole {
  const offset = index - focusIndex;
  if (offset === 0) return "focus";
  if (offset === -1) return "prev";
  if (offset === 1) return "next";
  return offset < -1 ? "far-left" : "far-right";
}

export function swipeCardPose(role: CardRole, progress: number) {
  const p = Math.max(-1, Math.min(1, progress));
  const q = Math.abs(p);
  if (role === "focus") {
    return {
      x: -50 - 90 * p,
      rotate: 16 * p,
      scale: 1 - 0.14 * q,
      opacity: 1 - 0.58 * q,
    };
  }
  if (p > 0 && role === "next") {
    return {
      x: 40 - 90 * p,
      rotate: -16 + 16 * p,
      scale: 0.86 + 0.14 * p,
      opacity: 0.42 + 0.58 * p,
    };
  }
  if (p < 0 && role === "prev") {
    return {
      x: -140 - 90 * p,
      rotate: 16 + 16 * p,
      scale: 0.86 - 0.14 * p,
      opacity: 0.42 - 0.58 * p,
    };
  }
  return null;
}

type ReplaceOptions = {
  kind?: StageMotion;
  direction?: 1 | -1;
};

export class SurfaceMotion {
  private stage: HTMLElement;
  private transitionToken = 0;
  private finalHTML: string | null = null;
  private trackingDeck: HTMLElement | null = null;
  private trackedCards: HTMLElement[] = [];

  constructor(stage: HTMLElement) {
    this.stage = stage;
  }

  // Fired after every DOM commit (immediate set, transition finalize, or a
  // cut-short transition). Imperative mounts like the live map re-attach here,
  // because finalize rebuilds the stage from HTML and drops appended nodes.
  private settled() {
    this.stage.dispatchEvent(new CustomEvent("stage-settled"));
  }

  replace(html: string, options: ReplaceOptions = {}) {
    this.finishTransition();
    this.clearSwipe(false);
    if (!this.stage.firstElementChild || this.reducedMotion() || typeof this.stage.animate !== "function") {
      this.stage.innerHTML = html;
      this.settled();
      return;
    }

    const oldLayer = document.createElement("div");
    const newLayer = document.createElement("div");
    oldLayer.className = "stage-motion-layer outgoing";
    newLayer.className = "stage-motion-layer incoming";
    oldLayer.setAttribute("aria-hidden", "true");
    while (this.stage.firstChild) oldLayer.appendChild(this.stage.firstChild);
    newLayer.innerHTML = html;
    this.stage.replaceChildren(oldLayer, newLayer);
    this.stage.classList.add("is-transitioning");

    const token = ++this.transitionToken;
    this.finalHTML = html;
    const direction = options.direction ?? 1;
    const kind = options.kind ?? "surface";
    const distance = kind === "swipe" ? 12 * direction : 0;
    const duration = kind === "swipe" ? 280 : kind === "refresh" ? 220 : 260;
    const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
    const oldFrames: Keyframe[] =
      kind === "swipe"
        ? [{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${-distance}%)`, opacity: 0 }]
        : [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.985)", opacity: 0 }];
    const newFrames: Keyframe[] =
      kind === "swipe"
        ? [{ transform: `translateX(${distance}%)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }]
        : [{ transform: "scale(1.015)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }];

    const oldAnimation = oldLayer.animate(oldFrames, { duration, easing, fill: "both" });
    const newAnimation = newLayer.animate(newFrames, { duration, easing, fill: "both" });
    void Promise.allSettled([oldAnimation.finished, newAnimation.finished]).then(() => {
      if (token !== this.transitionToken || this.finalHTML === null) return;
      this.stage.innerHTML = this.finalHTML;
      this.finalHTML = null;
      this.stage.classList.remove("is-transitioning");
      this.settled();
    });
  }

  syncFocus(focusIndex: number, total: number, title: string) {
    const items = this.stage.querySelectorAll<HTMLElement>("[data-motion-index]");
    for (const item of items) {
      const index = Number(item.dataset.motionIndex);
      const role = cardRole(index, focusIndex);
      if (item.classList.contains("card")) {
        item.classList.remove(...CARD_ROLES);
        item.classList.add(role);
      }
      item.classList.toggle("focus", index === focusIndex);
      item.toggleAttribute("aria-current", index === focusIndex);
    }
    for (const counter of this.stage.querySelectorAll<HTMLElement>("[data-motion-counter]")) {
      const prefix = counter.dataset.motionTitle === "1" ? `${title} · ` : "";
      counter.textContent = total ? `${prefix}${focusIndex + 1} of ${total}` : "0 items";
    }
  }

  trackSwipe(progress: number) {
    if (this.reducedMotion()) return;
    let p = Math.max(-1, Math.min(1, progress));
    if (Math.abs(p) < 0.015) {
      if (this.trackingDeck) this.settleSwipe();
      return;
    }
    const decks = [...this.stage.querySelectorAll<HTMLElement>(".deck")];
    const deck = decks.find((candidate) => candidate.getBoundingClientRect().width > 0);
    if (!deck) return;
    if (this.trackingDeck !== deck) {
      this.clearSwipe(false);
      this.trackingDeck = deck;
      this.trackedCards = [...deck.querySelectorAll<HTMLElement>(".card")];
      deck.classList.add("gesture-tracking");
    }
    const hasIncoming =
      p > 0
        ? this.trackedCards.some((card) => card.classList.contains("next"))
        : this.trackedCards.some((card) => card.classList.contains("prev"));
    if (!hasIncoming) p *= 0.22;
    for (const card of this.trackedCards) {
      const role = CARD_ROLES.find((name) => card.classList.contains(name));
      if (!role) continue;
      const pose = swipeCardPose(role, p);
      if (!pose) {
        card.style.transform = "";
        card.style.opacity = "";
        continue;
      }
      card.style.transform = `translateX(${pose.x}%) rotateY(${pose.rotate}deg) scale(${pose.scale})`;
      card.style.opacity = String(pose.opacity);
    }
  }

  settleSwipe() {
    if (!this.trackingDeck) return;
    const deck = this.trackingDeck;
    const cards = [...this.trackedCards];
    deck.classList.remove("gesture-tracking");
    void deck.offsetWidth;
    requestAnimationFrame(() => {
      for (const card of cards) {
        card.style.transform = "";
        card.style.opacity = "";
      }
    });
    this.trackingDeck = null;
    this.trackedCards = [];
  }

  private clearSwipe(animate: boolean) {
    if (animate) {
      this.settleSwipe();
      return;
    }
    this.trackingDeck?.classList.remove("gesture-tracking");
    for (const card of this.trackedCards) {
      card.style.transform = "";
      card.style.opacity = "";
    }
    this.trackingDeck = null;
    this.trackedCards = [];
  }

  private finishTransition() {
    if (this.finalHTML === null) return;
    this.transitionToken += 1;
    this.stage.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    this.stage.innerHTML = this.finalHTML;
    this.finalHTML = null;
    this.stage.classList.remove("is-transitioning");
    this.settled();
  }

  private reducedMotion() {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
}
