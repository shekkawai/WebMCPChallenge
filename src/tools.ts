import type { Store } from "./state/store";
import type { ToolDef, WebMCPAdapter } from "./webmcp/adapter";
import { speak } from "./speech";

export function wireTools(store: Store, mcp: WebMCPAdapter) {
  const base: ToolDef[] = [
    {
      name: "surface_show_calendar",
      description:
        "Render the user's calendar on the surface. Fetch the events yourself (e.g. from the Google Calendar connector), then pass them with a view ('week' or 'month') and an ISO anchor date inside the period to show.",
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
      name: "surface_show_emails",
      description:
        "Render emails as swipeable cards. Fetch them yourself (e.g. from the Gmail connector). Include `body` (full text) when you have it, so the user can open a single email full-screen without another fetch.",
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
                time: { type: "string", description: "e.g. 09:41" },
                body: { type: "string", description: "full plain-text body, optional" },
              },
              required: ["from", "subject"],
            },
          },
        },
        required: ["emails"],
      },
      execute: ({ emails }: any) => {
        store.showStack(
          "mail",
          "Mail",
          "email",
          emails.map((e: any, i: number) => ({
            id: e.id ?? String(i),
            kind: "email",
            title: e.subject,
            subtitle: e.from,
            preview: e.preview,
            content: e.body,
            badge: e.time,
          })),
        );
        return { rendered: emails.length };
      },
    },
    {
      name: "surface_show_files",
      description:
        "Render files and folders as swipeable cards (e.g. a Google Drive folder listing you fetched). Include `content` for text documents when you have it, so a doc can be opened full-screen.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "surface label, e.g. the folder name. Default 'Drive'" },
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                type: { type: "string", description: "folder | doc | sheet | slide | pdf | image | file" },
                owner: { type: "string" },
                modified: { type: "string", description: "e.g. 'Aug 27'" },
                preview: { type: "string", description: "short description or first lines" },
                content: { type: "string", description: "full text content, optional" },
              },
              required: ["name"],
            },
          },
        },
        required: ["files"],
      },
      execute: ({ title, files }: any) => {
        store.showStack(
          "drive",
          title ?? "Drive",
          "file",
          files.map((f: any, i: number) => ({
            id: f.id ?? String(i),
            kind: f.type === "folder" ? "folder" : f.type === "doc" || f.type === "sheet" || f.type === "slide" ? "doc" : "file",
            title: f.name,
            subtitle: [f.owner, f.modified].filter(Boolean).join(" · "),
            preview: f.preview,
            content: f.content,
            badge: f.type ? String(f.type).toUpperCase() : undefined,
          })),
        );
        return { rendered: files.length };
      },
    },
    {
      name: "surface_show_items",
      description:
        "Universal renderer: display ANY collection as swipeable cards — search results, tasks, news, notes, contacts, anything. Use this when no specialized tool (calendar/emails/files) fits. Give the surface an id (reusing an id updates that surface) and a title for the dock.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "surface id, e.g. 'news'. Default 'items'" },
          title: { type: "string", description: "dock label, e.g. 'AI News'" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                subtitle: { type: "string" },
                preview: { type: "string" },
                badge: { type: "string" },
                content: { type: "string", description: "full text for the reader, optional" },
              },
              required: ["title"],
            },
          },
        },
        required: ["title", "items"],
      },
      execute: ({ id, title, items }: any) => {
        store.showStack(
          id ?? "items",
          title,
          "generic",
          items.map((it: any, i: number) => ({ id: it.id ?? String(i), kind: "generic", ...it })),
        );
        return { rendered: items.length };
      },
    },
    {
      name: "surface_switch",
      description:
        "Bring an already-rendered surface to the front: 'calendar' or a stack id (e.g. 'mail', 'drive'). Call surface_get_view_state first to see what surfaces exist.",
      inputSchema: {
        type: "object",
        properties: { target: { type: "string" } },
        required: ["target"],
      },
      execute: ({ target }: any) => {
        store.switchTo(target);
        return store.getViewState();
      },
    },
    {
      name: "surface_get_view_state",
      description:
        "Read what the user is currently looking at: active view, which week/month the calendar sits on, which card is focused after the user's palm swipes, and what surfaces exist. Always call this to resolve references like 'this one', 'this week' or 'that email'.",
      inputSchema: { type: "object", properties: {} },
      execute: () => store.getViewState(),
    },
    {
      name: "surface_speak",
      description: "Speak a short line out loud through the surface's own speaker.",
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

  // View-scoped tools — dynamic registration is the point, not an optimization:
  // the tool list mirrors what the surface can do right now, and the browser
  // fires toolchange when it shifts.
  const calendarTools: ToolDef[] = [
    {
      name: "surface_set_calendar_view",
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

  const openTool: ToolDef = {
    name: "surface_open_item",
    description:
      "Expand the focused card (or the card with the given id) into a full-screen reader. Optionally pass `content` — the full text you fetched (email body, doc contents) — to fill the reader.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        content: { type: "string" },
      },
    },
    execute: ({ id, content }: any) => {
      store.openItem(id, content);
      return store.getViewState();
    },
  };

  const closeTool: ToolDef = {
    name: "surface_close_item",
    description: "Close the full-screen reader and return to the card deck.",
    inputSchema: { type: "object", properties: {} },
    execute: () => {
      store.closeItem();
      return store.getViewState();
    },
  };

  let lastView = "";
  store.subscribe((s) => {
    if (s.view === lastView) return;
    lastView = s.view;
    if (s.view === "calendar") mcp.setTools([...base, ...calendarTools]);
    else if (s.view === "stack") mcp.setTools([...base, openTool]);
    else if (s.view === "reader") mcp.setTools([...base, openTool, closeTool]);
    else mcp.setTools(base);
  });
}
