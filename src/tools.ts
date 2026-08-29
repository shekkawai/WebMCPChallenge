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
                imageUrl: { type: "string", description: "optional image (HTTPS URL or data: URL) shown on the card and in the reader" },
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
      name: "surface_show_options",
      description:
        "Present 2–4 visual design options as real rendered cards for the user to choose between — e.g. event invitation card designs. The surface draws each poster itself from your copy and styling (no image generation, text stays editable). The user can swipe between options, enlarge one, and pick by number or name.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "dock label, e.g. 'Invitation designs'" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "short option name, e.g. 'Aurora'" },
                template: { type: "string", enum: ["aurora", "mono", "neon"], description: "poster style: aurora = vivid gradient, mono = minimal light, neon = dark with glow" },
                eventTitle: { type: "string" },
                dateLine: { type: "string", description: "e.g. 'Fri 25 Sep · 7:00 PM'" },
                venue: { type: "string" },
                tagline: { type: "string" },
                accent: { type: "string", description: "CSS color for the accent, e.g. '#8b5cf6'" },
                logoText: { type: "string", description: "short logo mark, e.g. 'OMP'" },
                imageUrl: {
                  type: "string",
                  description:
                    "optional poster background artwork: an HTTPS image URL (e.g. a Drive thumbnail) or a data: URL of an image you generated. Text renders on top and stays editable.",
                },
              },
              required: ["name", "template", "eventTitle", "dateLine"],
            },
          },
        },
        required: ["options"],
      },
      execute: ({ title, options }: any) => {
        store.showStack(
          "options",
          title ?? "Designs",
          "option",
          options.map((o: any, i: number) => ({
            id: String(i + 1),
            kind: "option",
            title: o.name,
            badge: `Option ${i + 1}`,
            design: {
              template: o.template,
              eventTitle: o.eventTitle,
              dateLine: o.dateLine,
              venue: o.venue,
              tagline: o.tagline,
              accent: o.accent,
              logoText: o.logoText,
              imageUrl: o.imageUrl,
            },
          })),
        );
        return { rendered: options.length, hint: "user picks by swiping + saying a number, or you call option_select" };
      },
    },
    {
      name: "surface_show_people",
      description:
        "Render people — invite recipients, contacts, a CRM segment — as a grid of name chips so the user can review a send list at a glance. Fetch them yourself (contacts connector, CRM, spreadsheet) and pass name plus optional detail.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "dock label, e.g. 'Recipients'. Default 'People'" },
          people: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                detail: { type: "string", description: "e.g. email or company" },
                tag: { type: "string", description: "short badge, e.g. 'VIP'" },
              },
              required: ["name"],
            },
          },
        },
        required: ["people"],
      },
      execute: ({ title, people }: any) => {
        store.showStack(
          "people",
          title ?? "People",
          "person",
          people.map((p: any, i: number) => ({
            id: String(i),
            kind: "person",
            title: p.name,
            subtitle: p.detail,
            badge: p.tag,
          })),
          "grid",
        );
        return { rendered: people.length };
      },
    },
    {
      name: "surface_open_image",
      description:
        "Display an image full-screen on the surface. Accepts an HTTPS image URL (e.g. a Drive thumbnail or photo link) or a data: URL of an image you generated or were given. The image joins the 'Images' stack, so several opened images become swipeable.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS image URL or data:image/... URL" },
          title: { type: "string", description: "short caption, e.g. the filename" },
        },
        required: ["url"],
      },
      execute: ({ url, title }: any) => {
        if (!/^(https:|data:image\/)/.test(url)) return { error: "url must be https: or data:image/" };
        const existing = store.state.stacks.find((s) => s.id === "images");
        const items = [
          ...(existing?.items ?? []),
          { id: String((existing?.items.length ?? 0) + 1), kind: "generic" as const, title: title ?? "Image", imageUrl: url },
        ];
        store.showStack("images", "Images", "generic", items);
        store.openItem(items[items.length - 1].id);
        return { shown: true, images: items.length };
      },
    },
    {
      name: "surface_confirm_done",
      description:
        "Show a full-screen confirmation — a big check with a message — after you completed an action (event created, invitations sent, reply drafted). Use `detail` for the specifics. The user swipes to dismiss it.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "e.g. 'Invitations sent'" },
          detail: { type: "string", description: "e.g. '12 people · Card One · via Gmail'" },
        },
        required: ["message"],
      },
      execute: ({ message, detail }: any) => {
        store.showDone(message, detail);
        return { shown: true };
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
    {
      name: "calendar_propose_slots",
      description:
        "Highlight numbered proposed time slots on the on-screen calendar (max 6) so the user can compare and pick one by number. Check the user's real availability via your calendar connector first, then propose. The calendar jumps to the first slot; the user can still swipe to other weeks/months and the highlights stay on their dates.",
      inputSchema: {
        type: "object",
        properties: {
          view: { type: "string", enum: ["week", "month"], description: "optional view to show the proposals in" },
          slots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", description: "ISO date" },
                time: { type: "string", description: "e.g. 19:00" },
                end: { type: "string", description: "e.g. 22:00" },
                label: { type: "string", description: "short reason, e.g. 'evening fully free'" },
              },
              required: ["date", "time"],
            },
          },
        },
        required: ["slots"],
      },
      execute: ({ slots, view }: any) => {
        const proposals = store.proposeSlots(slots, view);
        return { proposals: proposals.map((p) => ({ slot: p.n, date: p.date, time: p.time })) };
      },
    },
  ];

  const confirmSlotTool: ToolDef = {
    name: "calendar_confirm_slot",
    description:
      "Confirm one of the currently proposed slots by its number and add the event to the on-screen calendar. Also create the event in the user's real calendar via your connector when you can. Shows an 'Event added' confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        slot: { type: "number", description: "the proposal number, 1-based" },
        title: { type: "string", description: "event title" },
      },
      required: ["slot", "title"],
    },
    execute: ({ slot, title }: any) => {
      const event = store.confirmSlot(slot, title);
      return event ? { added: event } : { error: "no such proposed slot" };
    },
  };

  const selectOptionTool: ToolDef = {
    name: "option_select",
    description:
      "Mark one of the displayed options as the user's choice — by number ('1'), id, or name ('Aurora'). Omit the argument to choose the currently focused option (what the user swiped to). Returns the chosen option.",
    inputSchema: {
      type: "object",
      properties: {
        option: { type: "string", description: "option number, id, or name; omit for the focused one" },
      },
    },
    execute: ({ option }: any) => {
      const chosen = store.selectOption(option);
      return chosen ? { chosen: { id: chosen.id, name: chosen.title } } : { error: "no options on screen" };
    },
  };

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

  let lastSig = "";
  store.subscribe((s) => {
    const stack = store.activeStack();
    const stackOn = s.view === "stack" || s.view === "reader";
    const optionsOn = stackOn && stack?.kind === "option";
    const sig = [s.view, s.proposals.length > 0, optionsOn].join("|");
    if (sig === lastSig) return;
    lastSig = sig;
    const tools = [...base];
    if (s.view === "calendar") {
      tools.push(...calendarTools);
      if (s.proposals.length) tools.push(confirmSlotTool);
    } else if (stackOn) {
      tools.push(openTool);
      if (s.view === "reader") tools.push(closeTool);
      if (optionsOn) tools.push(selectOptionTool);
    }
    mcp.setTools(tools);
  });
}
