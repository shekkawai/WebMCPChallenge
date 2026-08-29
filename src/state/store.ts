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
}

export interface Stack {
  id: string;
  title: string;
  kind: CardKind;
  items: CardItem[];
  focusIndex: number;
  layout?: "deck" | "grid";
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

const todayISO = () => new Date().toISOString().slice(0, 10);

export class Store {
  state: State = {
    view: "idle",
    activeStackId: null,
    stacks: [],
    calendarView: "week",
    anchor: todayISO(),
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

  confirmSlot(n: number, title: string): CalendarEvent | null {
    const p = this.state.proposals.find((x) => x.n === n) ?? this.state.proposals[0];
    if (!p) return null;
    const event: CalendarEvent = { date: p.date, time: p.time, title };
    this.state = {
      ...this.state,
      events: [...this.state.events, event],
      proposals: [],
      anchor: p.date,
      view: "done",
      done: { message: "Event added", detail: `${title} · ${p.date} ${p.time}`, returnTo: "calendar" },
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
  showStack(id: string, title: string, kind: CardKind, items: CardItem[], layout?: "deck" | "grid") {
    const existing = this.state.stacks.find((s) => s.id === id);
    const focusIndex = existing ? Math.min(existing.focusIndex, Math.max(items.length - 1, 0)) : 0;
    const stack: Stack = { id, title, kind, items, focusIndex, layout: layout ?? existing?.layout ?? "deck" };
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
      if (i >= 0) idx = i;
    }
    if (!stack.items[idx]) return null;
    const items = stack.items.map((it, i) => ({ ...it, selected: i === idx }));
    const stacks = this.state.stacks.map((s) => (s.id === stack.id ? { ...s, items, focusIndex: idx } : s));
    this.state = { ...this.state, stacks, view: "stack" };
    this.emit();
    return items[idx];
  }

  switchTo(target: string) {
    if (target === "calendar") {
      if (!this.state.hasCalendar) return;
      this.state = { ...this.state, view: "calendar" };
    } else {
      const stack = this.state.stacks.find((s) => s.id === target);
      if (!stack) return;
      this.state = { ...this.state, activeStackId: target, view: "stack" };
    }
    this.emit();
  }

  setCalendarView(view: CalendarView) {
    this.state = { ...this.state, calendarView: view };
    this.emit();
  }

  openItem(id?: string, content?: string) {
    const stack = this.activeStack();
    if (!stack || !stack.items.length) return;
    let focusIndex = stack.focusIndex;
    if (id) {
      const idx = stack.items.findIndex((it) => it.id === id);
      if (idx >= 0) focusIndex = idx;
    }
    const items = content
      ? stack.items.map((it, i) => (i === focusIndex ? { ...it, content } : it))
      : stack.items;
    const stacks = this.state.stacks.map((s) => (s.id === stack.id ? { ...s, items, focusIndex } : s));
    this.state = { ...this.state, stacks, view: "reader" };
    this.emit();
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
    } else if (s.view === "stack" || s.view === "reader") {
      const stack = this.activeStack();
      if (!stack || !stack.items.length) return;
      const focusIndex = Math.min(Math.max(stack.focusIndex + dir, 0), stack.items.length - 1);
      const stacks = s.stacks.map((st) => (st.id === stack.id ? { ...st, focusIndex } : st));
      this.state = { ...s, stacks };
      this.emit();
    } else if (s.view === "calendar") {
      const d = new Date(s.anchor + "T00:00:00");
      if (s.calendarView === "week") d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      this.state = { ...s, anchor: d.toISOString().slice(0, 10) };
      this.emit();
    }
  }

  // What the user is looking at, for the agent. This is the deixis contract:
  // the swipe sets context, the agent reads it back to resolve "this one".
  getViewState() {
    const s = this.state;
    const stack = this.activeStack();
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
              position: `${stack.focusIndex + 1} of ${stack.items.length}`,
              focusedItem: stack.items[stack.focusIndex] ?? null,
              selectedItem: stack.items.find((it) => it.selected) ?? null,
            }
          : undefined,
      readerOpen: s.view === "reader",
      confirmation: s.view === "done" ? s.done?.message : undefined,
    };
  }
}
