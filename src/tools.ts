import type { Store } from "./state/store";
import type { ToolDef, WebMCPAdapter } from "./webmcp/adapter";
import { speak } from "./speech";

export function wireTools(store: Store, mcp: WebMCPAdapter) {
  const base: ToolDef[] = [
    {
      name: "briefing_show_calendar",
      description:
        "Render the user's calendar on the briefing surface. Fetch the events yourself (e.g. from the Google Calendar connector), then pass them here with a view ('week' or 'month') and an ISO anchor date inside the period to show.",
      inputSchema: {
        type: "object",
        properties: {
          view: { type: "string", enum: ["week", "month"] },
          anchor: { type: "string", description: "ISO date, e.g. 2026-09-14" },
          events: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", description: "ISO date" },
                time: { type: "string", description: "e.g. 15:00" },
                title: { type: "string" },
              },
              required: ["date", "title"],
            },
          },
        },
        required: ["view", "events"],
      },
      execute: ({ view, events, anchor }: any) => {
        store.showCalendar(events, view, anchor);
        return { rendered: events.length, view };
      },
    },
    {
      name: "briefing_show_emails",
      description:
        "Render emails as swipeable cards on the briefing surface. Fetch them yourself (e.g. from the Gmail connector), then pass from, subject and a short preview for each.",
      inputSchema: {
        type: "object",
        properties: {
          emails: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                from: { type: "string" },
                subject: { type: "string" },
                preview: { type: "string" },
              },
              required: ["from", "subject"],
            },
          },
        },
        required: ["emails"],
      },
      execute: ({ emails }: any) => {
        store.showEmails(emails.map((e: any, i: number) => ({ id: e.id ?? String(i), ...e })));
        return { rendered: emails.length };
      },
    },
    {
      name: "briefing_get_view_state",
      description:
        "Read what the user is currently looking at: the active view, which week/month the calendar sits on, and which email card is focused after the user's palm swipes. Always call this to resolve references like 'this one', 'this week' or 'that email'.",
      inputSchema: { type: "object", properties: {} },
      execute: () => store.getViewState(),
    },
    {
      name: "briefing_speak",
      description: "Speak a short line out loud through the briefing surface's own speaker.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      execute: ({ text }: any) => {
        speak(text);
        return { spoke: true };
      },
    },
  ];

  // Only exists while the calendar is on screen — dynamic registration is the
  // point, not an optimization: the tool list mirrors what the surface can do
  // right now, and the browser fires toolchange when it shifts.
  const calendarTools: ToolDef[] = [
    {
      name: "briefing_set_calendar_view",
      description: "Switch the on-screen calendar between 'week' and 'month' view.",
      inputSchema: {
        type: "object",
        properties: { view: { type: "string", enum: ["week", "month"] } },
        required: ["view"],
      },
      execute: ({ view }: any) => {
        store.setCalendarView(view);
        return { view };
      },
    },
  ];

  let lastView = "";
  store.subscribe((s) => {
    if (s.view === lastView) return;
    lastView = s.view;
    mcp.setTools(s.view === "calendar" ? [...base, ...calendarTools] : base);
  });
}
