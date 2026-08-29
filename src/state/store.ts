export interface CalendarEvent {
  date: string;
  time?: string;
  title: string;
}

export interface Email {
  id: string;
  from: string;
  subject: string;
  preview?: string;
}

export type ViewName = "idle" | "calendar" | "mail";
export type CalendarView = "week" | "month";

export interface State {
  view: ViewName;
  calendarView: CalendarView;
  anchor: string;
  events: CalendarEvent[];
  emails: Email[];
  focusIndex: number;
}

type Listener = (s: State) => void;

const todayISO = () => new Date().toISOString().slice(0, 10);

export class Store {
  state: State = {
    view: "idle",
    calendarView: "week",
    anchor: todayISO(),
    events: [],
    emails: [],
    focusIndex: 0,
  };

  private listeners: Listener[] = [];

  subscribe(fn: Listener) {
    this.listeners.push(fn);
    fn(this.state);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  showCalendar(events: CalendarEvent[], view: CalendarView, anchor?: string) {
    this.state = { ...this.state, view: "calendar", calendarView: view, events, anchor: anchor ?? this.state.anchor };
    this.emit();
  }

  showEmails(emails: Email[]) {
    this.state = { ...this.state, view: "mail", emails, focusIndex: 0 };
    this.emit();
  }

  setCalendarView(view: CalendarView) {
    this.state = { ...this.state, calendarView: view };
    this.emit();
  }

  // One verb for the palm swipe, whatever is on screen:
  // mail -> next/previous card, calendar -> next/previous week or month.
  swipe(dir: 1 | -1) {
    const s = this.state;
    if (s.view === "mail" && s.emails.length) {
      const focusIndex = Math.min(Math.max(s.focusIndex + dir, 0), s.emails.length - 1);
      this.state = { ...s, focusIndex };
    } else if (s.view === "calendar") {
      const d = new Date(s.anchor + "T00:00:00");
      if (s.calendarView === "week") d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      this.state = { ...s, anchor: d.toISOString().slice(0, 10) };
    }
    this.emit();
  }

  // What the user is looking at, for the agent. This is the deixis contract:
  // the swipe sets context, the agent reads it back to resolve "this one".
  getViewState() {
    const s = this.state;
    return {
      view: s.view,
      calendarView: s.view === "calendar" ? s.calendarView : undefined,
      anchor: s.view === "calendar" ? s.anchor : undefined,
      focusedEmail: s.view === "mail" ? s.emails[s.focusIndex] ?? null : undefined,
      emailPosition: s.view === "mail" ? `${s.focusIndex + 1} of ${s.emails.length}` : undefined,
    };
  }
}
