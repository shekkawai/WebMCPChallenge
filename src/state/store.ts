import { localDateISO } from "../utils";
import type { DataKind, PresentationInteraction, PresentationMeta, PresentationPurpose, StackLayout } from "../presentation";

export type CardKind = "email" | "event" | "file" | "folder" | "doc" | "person" | "option" | "generic";

export interface InviteDesign {
  template: "aurora" | "mono" | "neon";
  eventTitle: string;
  dateLine: string;
  venue?: string;
  tagline?: string;
  accent?: string;
  logoText?: string;
  imageUrl?: string;
}

export interface CardItem {
  id: string;
  kind?: CardKind;
  title: string;
  subtitle?: string;
  preview?: string;
  content?: string;
  badge?: string;
  design?: InviteDesign;
  selected?: boolean;
  imageUrl?: string;
  facts?: { label: string; value: string }[];
}

export interface Stack {
  id: string;
  title: string;
  kind: CardKind;
  items: CardItem[];
  focusIndex: number;
  layout?: StackLayout;
  purpose?: PresentationPurpose;
  dataKind?: DataKind;
  interaction?: PresentationInteraction;
  requestedPurpose?: string;
}

export interface CalendarEvent {
  date: string;
  time?: string;
  title: string;
}

export interface SlotProposal {
  n: number;
  date: string;
  time: string;
  end?: string;
  label?: string;
}

export type ViewName = "idle" | "calendar" | "stack" | "reader" | "done";
export type CalendarView = "week" | "month";

export interface State {
  view: ViewName;
  activeStackId: string | null;
  stacks: Stack[];
  calendarView: CalendarView;
  anchor: string;
  events: CalendarEvent[];
  hasCalendar: boolean;
  proposals: SlotProposal[];
  done: { message: string; detail?: string; returnTo: ViewName } | null;
}

type Listener = (s: State) => void;

export class Store {
  state: State = {
    view: "idle",
    activeStackId: null,
    stacks: [],
    calendarView: "week",
    anchor: localDateISO(),
    events: [],
    hasCalendar: false,
    proposals: [],
    done: null,
  };

  private listeners: Listener[] = [];

  subscribe(fn: Listener) {
    this.listeners.push(fn);
    fn(this.state);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  activeStack(): Stack | null {
    return this.state.stacks.find((s) => s.id === this.state.activeStackId) ?? null;
  }

  showCalendar(events: CalendarEvent[], view: CalendarView, anchor?: string) {
    this.state = {
      ...this.state,
      view: "calendar",
      calendarView: view,
      events,
      anchor: anchor ?? this.state.anchor,
      hasCalendar: true,
    };
    this.emit();
  }

  // Numbered slot proposals painted onto the calendar. The calendar jumps to
  // the first slot so the highlights are on screen; swiping away and back is
  // fine because proposals live on dates, not on the viewport.
  proposeSlots(slots: Omit<SlotProposal, "n">[], view?: CalendarView) {
    const proposals = slots.slice(0, 6).map((s, i) => ({ ...s, n: i + 1 }));
    this.state = {
      ...this.state,
      proposals,
      view: "calendar",
      hasCalendar: true,
      calendarView: view ?? this.state.calendarView,
      anchor: proposals[0]?.date ?? this.state.anchor,
    };
    this.emit();
    return proposals;
  }

  confirmSlot(n: number, title: string, created = false): CalendarEvent | null {
    const p = this.state.proposals.find((x) => x.n === n);
    if (!p) return null;
    const event: CalendarEvent = { date: p.date, time: p.time, title };
    this.state = {
      ...this.state,
      events: [...this.state.events, event],
      proposals: [],
      anchor: p.date,
      view: "done",
      done: { message: created ? "Event added" : "Slot selected", detail: `${title} · ${p.date} ${p.time}`, returnTo: "calendar" },
    };
    this.emit();
    return event;
  }

  showDone(message: string, detail?: string) {
    const returnTo = this.state.view === "done" ? (this.state.done?.returnTo ?? "idle") : this.state.view;
    this.state = { ...this.state, view: "done", done: { message, detail, returnTo } };
    this.emit();
  }

  dismissDone() {
    if (this.state.view !== "done") return;
    this.state = { ...this.state, view: this.state.done?.returnTo ?? "idle", done: null };
    this.emit();
  }

  // Universal entry point: mail, drive files, or anything the agent wants shown
  // become one shape — a stack of cards. Same id upserts (keeps focus position).
  showStack(id: string, title: string, kind: CardKind, items: CardItem[], layout?: StackLayout, presentation?: PresentationMeta) {
    const existing = this.state.stacks.find((s) => s.id === id);
    const focusIndex = existing ? Math.min(existing.focusIndex, Math.max(items.length - 1, 0)) : 0;
    const stack: Stack = {
      id,
      title,
      kind,
      items,
      focusIndex,
      layout: layout ?? existing?.layout ?? "deck",
      purpose: presentation?.purpose ?? existing?.purpose,
      dataKind: presentation?.dataKind ?? existing?.dataKind,
      interaction: presentation?.interaction ?? existing?.interaction,
      requestedPurpose: presentation?.requestedPurpose ?? existing?.requestedPurpose,
    };
    const stacks = existing
      ? this.state.stacks.map((s) => (s.id === id ? stack : s))
      : [...this.state.stacks, stack];
    this.state = { ...this.state, stacks, activeStackId: id, view: "stack" };
    this.emit();
  }

  selectOption(ref?: string | number): CardItem | null {
    const stack = this.activeStack();
    if (!stack || !stack.items.length) return null;
    let idx = stack.focusIndex;
    const asNum = typeof ref === "number" ? ref : ref && /^\d+$/.test(ref) ? Number(ref) : null;
    if (asNum !== null) idx = asNum - 1;
    else if (typeof ref === "string" && ref) {
      const q = ref.toLowerCase();
      const i = stack.items.findIndex((it) => it.id === ref || it.title.toLowerCase() === q);
      if (i < 0) return null;
      idx = i;
    }
    if (!stack.items[idx]) return null;
    const items = stack.items.map((it, i) => ({ ...it, selected: i === idx }));
    const stacks = this.state.stacks.map((s) => (s.id === stack.id ? { ...s, items, focusIndex: idx } : s));
    this.state = { ...this.state, stacks, view: "stack" };
    this.emit();
    return items[idx];
  }

  toggleItem(ref?: string | number, selected?: boolean): CardItem | null {
    const stack = this.activeStack();
    if (!stack || !stack.items.length) return null;
    let idx = stack.focusIndex;
    const asNum = typeof ref === "number" ? ref : ref && /^\d+$/.test(ref) ? Number(ref) : null;
    if (asNum !== null) idx = asNum - 1;
    else if (typeof ref === "string" && ref) {
      const q = ref.toLowerCase();
      const found = stack.items.findIndex((item) => item.id === ref || item.title.toLowerCase() === q);
      if (found < 0) return null;
      idx = found;
    }
    if (!stack.items[idx]) return null;
    const items = stack.items.map((item, i) =>
      i === idx ? { ...item, selected: selected ?? !item.selected } : item,
    );
    const stacks = this.state.stacks.map((entry) =>
      entry.id === stack.id ? { ...entry, items, focusIndex: idx } : entry,
    );
    this.state = { ...this.state, stacks, view: "stack" };
    this.emit();
    return items[idx];
  }

  switchTo(target: string): boolean {
    if (target === "calendar") {
      if (!this.state.hasCalendar) return false;
      this.state = { ...this.state, view: "calendar" };
    } else {
      const stack = this.state.stacks.find((s) => s.id === target);
      if (!stack) return false;
      this.state = { ...this.state, activeStackId: target, view: "stack" };
    }
    this.emit();
    return true;
  }

  setCalendarView(view: CalendarView) {
    this.state = { ...this.state, calendarView: view };
    this.emit();
  }

  openItem(id?: string, content?: string): CardItem | null {
    const stack = this.activeStack();
    if (!stack || !stack.items.length) return null;
    let focusIndex = stack.focusIndex;
    if (id) {
      const idx = stack.items.findIndex((it) => it.id === id);
      if (idx < 0) return null;
      focusIndex = idx;
    }
    const items = content !== undefined
      ? stack.items.map((it, i) => (i === focusIndex ? { ...it, content } : it))
      : stack.items;
    const stacks = this.state.stacks.map((s) => (s.id === stack.id ? { ...s, items, focusIndex } : s));
    this.state = { ...this.state, stacks, view: "reader" };
    this.emit();
    return items[focusIndex] ?? null;
  }

  closeItem() {
    if (this.state.view !== "reader") return;
    this.state = { ...this.state, view: "stack" };
    this.emit();
  }

  // One verb for the palm swipe, whatever is on screen:
  // stack/reader -> next/previous card, calendar -> next/previous week or month,
  // done -> dismiss the confirmation.
  swipe(dir: 1 | -1) {
    const s = this.state;
    if (s.view === "done") {
      this.dismissDone();
      return true;
    } else if (s.view === "stack" || s.view === "reader") {
      const stack = this.activeStack();
      if (!stack || !stack.items.length) return false;
      // glance renders at most 6 cards, so focus must not wander past what is visible
      const maxIndex = (stack.purpose === "glance" ? Math.min(stack.items.length, 6) : stack.items.length) - 1;
      const focusIndex = Math.min(Math.max(stack.focusIndex + dir, 0), maxIndex);
      if (focusIndex === stack.focusIndex) return false;
      const stacks = s.stacks.map((st) => (st.id === stack.id ? { ...st, focusIndex } : st));
      this.state = { ...s, stacks };
      this.emit();
      return true;
    } else if (s.view === "calendar") {
      const d = new Date(s.anchor + "T00:00:00");
      if (s.calendarView === "week") d.setDate(d.getDate() + dir * 7);
      else {
        d.setDate(1);
        d.setMonth(d.getMonth() + dir);
      }
      this.state = { ...s, anchor: localDateISO(d) };
      this.emit();
      return true;
    }
    return false;
  }

  // What the user is looking at, for the agent. This is the deixis contract:
  // the swipe sets context, the agent reads it back to resolve "this one".
  getViewState() {
    const s = this.state;
    const stack = this.activeStack();
    const describeItem = (item: CardItem | undefined) =>
      item
        ? {
            id: item.id,
            kind: item.kind ?? stack?.kind ?? "generic",
            title: item.title,
            subtitle: item.subtitle,
            badge: item.badge,
            selected: Boolean(item.selected),
            hasContent: Boolean(item.content),
              hasImage: Boolean(item.imageUrl ?? item.design?.imageUrl),
              facts: item.facts,
            design: item.design
              ? {
                  template: item.design.template,
                  eventTitle: item.design.eventTitle,
                  dateLine: item.design.dateLine,
                  venue: item.design.venue,
                }
              : undefined,
          }
        : null;
    return {
      view: s.view,
      surfaces: [
        ...(s.hasCalendar ? [{ id: "calendar", title: "Calendar" }] : []),
        ...s.stacks.map((st) => ({ id: st.id, title: st.title, items: st.items.length })),
      ],
      calendar: s.view === "calendar" ? { calendarView: s.calendarView, anchor: s.anchor } : undefined,
      proposals: s.proposals.length
        ? s.proposals.map((p) => ({ slot: p.n, date: p.date, time: p.time, label: p.label }))
        : undefined,
      stack:
        stack && (s.view === "stack" || s.view === "reader")
          ? {
              id: stack.id,
              title: stack.title,
              layout: stack.layout ?? "deck",
              purpose: stack.purpose,
              dataKind: stack.dataKind,
              interaction: stack.interaction,
              position: stack.items.length ? `${stack.focusIndex + 1} of ${stack.items.length}` : "0 of 0",
              focusedItem: describeItem(stack.items[stack.focusIndex]),
              selectedItem: describeItem(stack.items.find((it) => it.selected)),
            }
          : undefined,
      readerOpen: s.view === "reader",
      confirmation: s.view === "done" ? s.done?.message : undefined,
    };
  }
}
