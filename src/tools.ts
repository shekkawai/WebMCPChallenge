import type { Store } from "./state/store";
import type { ToolDef, WebMCPAdapter } from "./webmcp/adapter";
import { speak } from "./speech";
import { safeCssColor, safeImageUrl } from "./utils";
import { formatDistance, haversineM, isValidCoord, walkingRoute } from "./geo";
import {
  decidePresentation,
  normalizeDataKind,
  normalizeInteraction,
  normalizeLayoutHint,
  normalizePurpose,
  presentationContext,
  presentationDescription,
  renderReceipt,
  resolveInteraction,
  type PresentationContext,
} from "./presentation";

const takeArray = (value: unknown, max: number) => (Array.isArray(value) ? value.slice(0, max) : null);

const factValue = (value: unknown) => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
};

export function createSurfacePresentTool(
  store: Store,
  getContext: () => PresentationContext = presentationContext,
): ToolDef {
  const contextAtRegistration = getContext();
  return {
    name: "surface_present",
    description: presentationDescription(contextAtRegistration),
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Stable surface id. Reusing it updates the same surface. Default: presentation." },
        title: { type: "string", description: "Short label for the surface and dock." },
        purpose: {
          type: "string",
          enum: ["glance", "browse", "inspect", "compare", "choose", "triage"],
          description:
            "What the user needs to do: glance = key facts in seconds; browse = explore a collection; inspect = one item in depth; compare = weigh items by shared facts; choose = pick one option; triage = prioritize, keep, dismiss, or organize many items.",
        },
        dataKind: {
          type: "string",
          enum: ["collection", "document", "schedule", "timeline", "metrics", "media", "people", "hierarchy", "location", "entity"],
          description: "Optional semantic hint about the data. Omit when uncertain; the page can infer from the items.",
        },
        interaction: {
          type: "string",
          enum: ["view", "navigate", "single-select", "multi-select", "edit", "confirm"],
          description: "Optional interaction hint. The page applies a safe purpose default when omitted.",
        },
        hint: {
          type: "object",
          description: "Optional presentation preference. The page may override it for the current device or lens.",
          properties: {
            layout: { type: "string", enum: ["cards", "grid", "list", "table"] },
          },
        },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Stable id used to select or open this item in later tool calls." },
              title: { type: "string" },
              subtitle: { type: "string" },
              summary: { type: "string", description: "Short explanation for a card, list row, or glance view." },
              badge: { type: "string", description: "Short pill highlight on the card, e.g. 'Best fit', 'New', 'Urgent'. Keep it under ~15 characters." },
              content: { type: "string", description: "Full text used when the purpose is inspect or the item is opened." },
              imageUrl: { type: "string", description: "Optional HTTPS or data:image URL." },
              lat: { type: "number", description: "WGS84 latitude. When items carry lat+lng, the page renders them as numbered pins on a live map (location shape) — no separate map tool needed." },
              lng: { type: "number", description: "WGS84 longitude — see lat." },
              facts: {
                type: "array",
                maxItems: 8,
                description:
                  "Comparable attributes in display order, e.g. Price, Capacity, Distance. For compare, use identical labels on every item so values align as table columns; the first 6 distinct labels become columns.",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    value: { type: ["string", "number", "boolean"] },
                  },
                  required: ["label", "value"],
                },
              },
            },
            required: ["title"],
          },
        },
      },
      required: ["title", "purpose", "items"],
    },
    execute: ({ id, title, purpose: requestedPurpose, dataKind, interaction, hint, items }: any) => {
      const list = takeArray(items, 100);
      if (!list || !list.length) return { error: "items must contain 1–100 entries" };
      const purpose = normalizePurpose(requestedPurpose);
      const context = getContext();
      const layoutHint = normalizeLayoutHint(hint?.layout);
      const hasGeo = list.some((item: any) => isValidCoord(item?.lat, item?.lng));
      const decision = decidePresentation(purpose, context, layoutHint, hasGeo);
      const requestedInteraction = normalizeInteraction(interaction);
      const effectiveInteraction = resolveInteraction(purpose, requestedInteraction);
      const surfaceId = typeof id === "string" && id.trim() ? id.trim().slice(0, 80) : "presentation";
      const cards = list.map((item: any, index: number) => ({
        id: typeof item?.id === "string" && item.id ? item.id : String(index + 1),
        kind: "generic" as const,
        title: String(item?.title ?? `Item ${index + 1}`),
        subtitle: typeof item?.subtitle === "string" ? item.subtitle : undefined,
        preview: typeof item?.summary === "string" ? item.summary : undefined,
        badge: typeof item?.badge === "string" ? item.badge : undefined,
        content: typeof item?.content === "string" ? item.content : undefined,
        imageUrl: safeImageUrl(item?.imageUrl),
        lat: isValidCoord(item?.lat, item?.lng) ? (item.lat as number) : undefined,
        lng: isValidCoord(item?.lat, item?.lng) ? (item.lng as number) : undefined,
        facts: takeArray(item?.facts, 8)
          ?.map((fact: any) => ({
            label: typeof fact?.label === "string" ? fact.label.slice(0, 80) : "",
            value: factValue(fact?.value),
          }))
          .filter((fact) => fact.label && fact.value !== null)
          .map((fact) => ({ label: fact.label, value: fact.value! })),
      }));
      store.showStack(surfaceId, String(title ?? "Presentation"), "generic", cards, decision.layout, {
        purpose,
        requestedPurpose: typeof requestedPurpose === "string" ? requestedPurpose : undefined,
        dataKind: normalizeDataKind(dataKind),
        interaction: effectiveInteraction,
        hint: layoutHint,
      });
      if (purpose === "inspect") store.openItem(cards[0]?.id);
      let showing = cards.length;
      if (purpose === "inspect") showing = Math.min(cards.length, 1);
      else if (purpose === "glance") showing = context === "glasses" ? Math.min(cards.length, 1) : Math.min(cards.length, 6);
      else if (context === "glasses" && ["compare", "choose", "triage"].includes(purpose)) showing = Math.min(cards.length, 1);
      return {
        receipt: renderReceipt(surfaceId, purpose, requestedPurpose, context, { ...decision, interaction: effectiveInteraction }, showing, cards.length),
      };
    },
  };
}

export function wireTools(
  store: Store,
  mcp: WebMCPAdapter,
  getContext: () => PresentationContext = presentationContext,
) {
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
            maxItems: 500,
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
        const list = takeArray(events, 500);
        if (!list) return { error: "events must be an array" };
        store.showCalendar(list, view, anchor);
        return { rendered: list.length, view };
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
            maxItems: 50,
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
        const list = takeArray(emails, 50);
        if (!list) return { error: "emails must be an array" };
        store.showStack(
          "mail",
          "Mail",
          "email",
          list.map((e: any, i: number) => ({
            id: e.id ?? String(i),
            kind: "email",
            title: e.subject,
            subtitle: e.from,
            preview: e.preview,
            content: e.body,
            badge: e.time,
          })),
        );
        return { rendered: list.length };
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
            maxItems: 100,
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
                imageUrl: { type: "string", description: "optional HTTPS or data:image thumbnail" },
              },
              required: ["name"],
            },
          },
        },
        required: ["files"],
      },
      execute: ({ title, files }: any) => {
        const list = takeArray(files, 100);
        if (!list) return { error: "files must be an array" };
        store.showStack(
          "drive",
          title ?? "Drive",
          "file",
          list.map((f: any, i: number) => ({
            id: f.id ?? String(i),
            kind: f.type === "folder" ? "folder" : f.type === "doc" || f.type === "sheet" || f.type === "slide" ? "doc" : "file",
            title: f.name,
            subtitle: [f.owner, f.modified].filter(Boolean).join(" · "),
            preview: f.preview,
            content: f.content,
            badge: f.type ? String(f.type).toUpperCase() : undefined,
            imageUrl: safeImageUrl(f.imageUrl),
          })),
        );
        return { rendered: list.length };
      },
    },
    {
      name: "surface_show_items",
      description:
        "Legacy universal renderer: display any collection as swipeable cards. Prefer surface_present when the user's purpose (compare, choose, triage, inspect, browse, or glance) is known, because it adapts the UI to desktop or glasses.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "surface id, e.g. 'news'. Default 'items'" },
          title: { type: "string", description: "dock label, e.g. 'AI News'" },
          items: {
            type: "array",
            maxItems: 100,
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                subtitle: { type: "string" },
                preview: { type: "string" },
                badge: { type: "string", description: "short pill highlight on the card, e.g. 'New'" },
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
        const list = takeArray(items, 100);
        if (!list) return { error: "items must be an array" };
        store.showStack(
          id ?? "items",
          title,
          "generic",
          list.map((it: any, i: number) => ({
            id: it.id ?? String(i),
            kind: "generic",
            title: it.title,
            subtitle: it.subtitle,
            preview: it.preview,
            badge: it.badge,
            content: it.content,
            imageUrl: safeImageUrl(it.imageUrl),
          })),
        );
        return { rendered: list.length };
      },
    },
    {
      name: "surface_show_options",
      description:
        "Present 2–4 visual design options as rendered cards for the user to choose between. Supply structured copy and styling, plus optional generated or Drive artwork as an HTTPS or data:image URL. The page keeps the text separate from the artwork. The user can swipe, enlarge, and pick by number or name.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "dock label, e.g. 'Invitation designs'" },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 4,
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
        const list = takeArray(options, 4);
        if (!list || list.length < 2) return { error: "options must contain 2–4 designs" };
        store.showStack(
          "options",
          title ?? "Designs",
          "option",
          list.map((o: any, i: number) => ({
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
              accent: safeCssColor(o.accent),
              logoText: o.logoText,
              imageUrl: safeImageUrl(o.imageUrl),
            },
          })),
        );
        return { rendered: list.length, hint: "user picks by swiping + saying a number, or you call option_select" };
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
            maxItems: 100,
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
        const list = takeArray(people, 100);
        if (!list) return { error: "people must be an array" };
        store.showStack(
          "people",
          title ?? "People",
          "person",
          list.map((p: any, i: number) => ({
            id: String(i),
            kind: "person",
            title: p.name,
            subtitle: p.detail,
            badge: p.tag,
          })),
          "grid",
        );
        return { rendered: list.length };
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
          title: {
            type: "string",
            description:
              "short caption, e.g. the filename. Give each image a DISTINCT caption — surface_get_view_state reports it back as the focused item's title, which is how you know which image the user swiped to.",
          },
        },
        required: ["url"],
      },
      execute: ({ url, title }: any) => {
        const imageUrl = safeImageUrl(url);
        if (!imageUrl) return { error: "url must be a valid HTTPS or supported data:image URL no larger than 12 MiB" };
        const existing = store.state.stacks.find((s) => s.id === "images");
        const id = globalThis.crypto?.randomUUID?.() ?? `image-${Date.now()}`;
        const shownTitle = title ?? "Image";
        const items = [
          ...(existing?.items.slice(-9) ?? []),
          { id, kind: "generic" as const, title: shownTitle, imageUrl },
        ];
        store.showStack("images", "Images", "generic", items);
        store.openItem(items[items.length - 1].id);
        return { shown: true, id, title: shownTitle, position: items.length, images: items.length };
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
        return store.switchTo(target) ? store.getViewState() : { error: `surface '${String(target)}' does not exist` };
      },
    },
    {
      name: "surface_get_view_state",
      description:
        "Read what the user is currently looking at: active view, which week/month the calendar sits on, which card is focused after the user's palm swipes, and what surfaces exist. Always call this to resolve references like 'this one', 'this week' or 'that email'.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => store.getViewState(),
    },
    {
      name: "surface_speak",
      description: "Speak a short line out loud through the surface's own speaker.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", maxLength: 500 } },
        required: ["text"],
      },
      execute: ({ text }: any) => {
        const line = String(text ?? "").slice(0, 500);
        speak(line);
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
            minItems: 1,
            maxItems: 6,
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
        const list = takeArray(slots, 6);
        if (!list || !list.length) return { error: "slots must contain 1–6 proposals" };
        const proposals = store.proposeSlots(list, view);
        return { proposals: proposals.map((p) => ({ slot: p.n, date: p.date, time: p.time })) };
      },
    },
  ];

  const confirmSlotTool: ToolDef = {
    name: "calendar_confirm_slot",
    description:
      "Confirm one of the currently proposed slots by its number. First create the event through the user's calendar connector after receiving confirmation, then call this tool with created=true. If the connector is unavailable or fails, call with created=false so the surface says 'Slot selected' instead of falsely claiming it was added.",
    inputSchema: {
      type: "object",
      properties: {
        slot: { type: "integer", minimum: 1, maximum: 6, description: "the proposal number, 1-based" },
        title: { type: "string", description: "event title" },
        created: { type: "boolean", description: "true only when the real calendar connector confirmed creation" },
      },
      required: ["slot", "title", "created"],
    },
    execute: ({ slot, title, created }: any) => {
      const event = store.confirmSlot(slot, title, created === true);
      if (!event) return { error: "no such proposed slot" };
      return created === true ? { added: event } : { selected: event, needsCalendarWrite: true };
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

  const selectPresentedItemTool: ToolDef = {
    name: "surface_select_item",
    description:
      "Select one item from the current purpose='choose' presentation by 1-based number, id, or exact title. Omit item to select what the user focused with a swipe. This changes only the page selection; external actions still require their own confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        item: { type: "string", description: "1-based number, item id, or exact title; omit for the focused item" },
      },
    },
    execute: ({ item }: any) => {
      const chosen = store.selectOption(item);
      return chosen ? { selected: { id: chosen.id, title: chosen.title } } : { error: "no matching choice on screen" };
    },
  };

  const triageItemTool: ToolDef = {
    name: "surface_toggle_item",
    description:
      "Mark or unmark an item in the current purpose='triage' presentation by 1-based number, id, or exact title. Omit item to use what the user focused with a swipe. This changes only page-local review state.",
    inputSchema: {
      type: "object",
      properties: {
        item: { type: "string", description: "1-based number, item id, or exact title; omit for the focused item" },
        selected: { type: "boolean", description: "true to mark, false to unmark; omit to toggle" },
      },
    },
    execute: ({ item, selected }: any) => {
      const changed = store.toggleItem(item, typeof selected === "boolean" ? selected : undefined);
      return changed ? { item: { id: changed.id, title: changed.title, selected: Boolean(changed.selected) } } : { error: "no matching triage item on screen" };
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
      const item = store.openItem(id, content);
      return item ? store.getViewState() : { error: id ? `item '${id}' does not exist` : "nothing to open" };
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

  const setLocationTool: ToolDef = {
    name: "map_set_location",
    description:
      "Set the user's position — the map's blue you-are-here dot. The user TELLS you where they are (real or simulated, e.g. 'assume I'm at Wan Chai MTR'); the page never reads device GPS. Distances to map pins are computed from this point.",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number" },
        lng: { type: "number" },
        label: { type: "string", description: "Short place name shown next to the dot, e.g. 'Wan Chai MTR'." },
      },
      required: ["lat", "lng"],
    },
    execute: ({ lat, lng, label }: any) => {
      if (!isValidCoord(lat, lng)) return { error: "lat/lng must be valid WGS84 coordinates" };
      store.setUserLocation(lat, lng, typeof label === "string" ? label.slice(0, 60) : undefined);
      return { set: true, lat, lng, label };
    },
  };

  const routeTool: ToolDef = {
    name: "map_show_route",
    description:
      "Draw the walking route from the user's position to a map pin (1-based number, id, or exact title; omit for the focused pin). The page fetches the street route and animates it; the result returns distance, minutes, and street names so you can speak the directions. Requires map_set_location first.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "1-based pin number, item id, or exact title; omit for the user's focused pin" },
      },
    },
    execute: async ({ to }: any) => {
      const s = store.state;
      if (!s.userLocation) return { error: "no user position — call map_set_location first" };
      const stack = store.activeStack();
      if (!stack) return { error: "no map surface on screen" };
      let idx = stack.focusIndex;
      const asNum = typeof to === "string" && /^\d+$/.test(to) ? Number(to) : typeof to === "number" ? to : null;
      if (asNum !== null) idx = asNum - 1;
      else if (typeof to === "string" && to) {
        const q = to.toLowerCase();
        idx = stack.items.findIndex((it) => it.id === to || it.title.toLowerCase() === q);
      }
      const target = stack.items[idx];
      if (!target || !isValidCoord(target.lat, target.lng)) {
        return { error: to ? `no map pin matches '${String(to)}'` : "the focused item has no coordinates" };
      }
      const route = await walkingRoute(s.userLocation, { lat: target.lat!, lng: target.lng! });
      store.focusItem(target.id);
      store.setRoute({ toId: target.id, ...route });
      return {
        to: { id: target.id, title: target.title },
        distance: formatDistance(route.distanceM),
        durationMin: route.durationMin,
        streets: route.streets,
        ...(route.fallback ? { fallback: "routing service unavailable — straight-line estimate shown" } : {}),
      };
    },
  };

  const dismissTool: ToolDef = {
    name: "surface_dismiss",
    description:
      "Remove a rendered surface from the dock entirely: 'calendar' or a stack id (e.g. 'mail', 'options'). Use when the user asks to close or dismiss a panel/tab they are done with. To close the full-screen reader instead, use surface_close_item. Dismissal is page-local and reversible — re-rendering the surface brings it back.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "'calendar' or a stack id — surface_get_view_state lists what exists" },
      },
      required: ["id"],
    },
    execute: ({ id }: any) => {
      return store.dismissSurface(String(id)) ? store.getViewState() : { error: `surface '${String(id)}' does not exist` };
    },
  };

  let presentTool = createSurfacePresentTool(store, getContext);
  let lastSig = "";
  const syncTools = (s: Store["state"]) => {
    const stack = store.activeStack();
    const stackOn = s.view === "stack" || s.view === "reader";
    const optionsOn = stackOn && stack?.kind === "option";
    const chooseOn = stackOn && stack?.purpose === "choose";
    const triageOn = stackOn && stack?.purpose === "triage";
    const hasSurfaces = s.hasCalendar || s.stacks.length > 0;
    const mapOn = stackOn && stack?.layout === "map";
    const sig = [s.view, s.proposals.length > 0, optionsOn, chooseOn, triageOn, hasSurfaces, mapOn, getContext()].join("|");
    if (sig === lastSig) return;
    lastSig = sig;
    const tools = [presentTool, ...base, setLocationTool];
    if (hasSurfaces) tools.push(dismissTool);
    if (mapOn) tools.push(routeTool);
    if (s.view === "calendar") {
      tools.push(...calendarTools);
      if (s.proposals.length) tools.push(confirmSlotTool);
    } else if (stackOn) {
      tools.push(openTool);
      if (s.view === "reader") tools.push(closeTool);
      if (optionsOn) tools.push(selectOptionTool);
      if (chooseOn) tools.push(selectPresentedItemTool);
      if (triageOn) tools.push(triageItemTool);
    }
    mcp.setTools(tools);
  };
  store.subscribe(syncTools);

  if (typeof document !== "undefined") {
    document.addEventListener("surface-contextchange", () => {
      presentTool = createSurfacePresentTool(store, getContext);
      lastSig = "";
      syncTools(store.state);
    });
  }
}
