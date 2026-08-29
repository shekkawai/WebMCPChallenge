import type { CardItem, InviteDesign, Stack, State, Store } from "../state/store";
import { localDateISO, safeCssColor, safeImageUrl } from "../utils";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const ICONS: Record<string, string> = {
  email:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/></svg>',
  event:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  file:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M13 2v6h6"/></svg>',
  folder:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  doc:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M8.5 12h7M8.5 15.5h7M8.5 8.5H11"/></svg>',
  person:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.5 3.8-5 7-5s5.8 1.5 7 5"/></svg>',
  option:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="12" height="16" rx="2"/><path d="M18 6h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6"/></svg>',
  generic:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>',
};

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>';

const icon = (kind?: string) => `<span class="ic">${ICONS[kind ?? "generic"] ?? ICONS.generic}</span>`;

function weekDays(anchor: string): string[] {
  const d = new Date(anchor + "T00:00:00");
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return localDateISO(x);
  });
}

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmtDay = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return { wd: WD[(d.getDay() + 6) % 7], n: d.getDate(), month: d.toLocaleString("en", { month: "short" }) };
};

function calNote(s: State): string {
  if (!s.proposals.length) return "";
  return `<span class="calnote">${s.proposals.length} proposed slot${s.proposals.length > 1 ? "s" : ""} — say a number</span>`;
}

function weekHTML(s: State): string {
  const days = weekDays(s.anchor);
  const a = fmtDay(days[0]);
  const b = fmtDay(days[6]);
  return `
    <div class="calwrap">
      <div class="calhead">${a.month} ${a.n} — ${b.month} ${b.n}${calNote(s)}</div>
      <div class="week">
        ${days
          .map((date) => {
            const f = fmtDay(date);
            const events = s.events.filter((e) => e.date === date);
            const props = s.proposals.filter((p) => p.date === date);
            return `<div class="day glass${date === localDateISO() ? " today" : ""}${props.length ? " hasprop" : ""}">
              <div class="dh"><span class="wd">${f.wd}</span><span class="dn">${f.n}</span></div>
              ${events.map((e) => `<div class="ev">${e.time ? `<b>${esc(e.time)}</b>` : ""}${esc(e.title)}</div>`).join("")}
              ${props
                .map(
                  (p) => `<div class="slot"><span class="n">${p.n}</span><b>${esc(p.time)}${p.end ? `–${esc(p.end)}` : ""}</b>${
                    p.label ? `<span>${esc(p.label)}</span>` : ""
                  }</div>`,
                )
                .join("")}
            </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function monthHTML(s: State): string {
  const [y, m] = s.anchor.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const pad = (first.getDay() + 6) % 7;
  const dim = new Date(y, m, 0).getDate();
  const monthName = first.toLocaleString("en", { month: "long", year: "numeric" });
  const cells: string[] = [];
  for (let i = 0; i < pad; i++) cells.push('<div class="mcell empty"></div>');
  for (let day = 1; day <= dim; day++) {
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const events = s.events.filter((e) => e.date === iso);
    const props = s.proposals.filter((p) => p.date === iso);
    cells.push(`<div class="mcell glass${iso === localDateISO() ? " today" : ""}${props.length ? " hasprop" : ""}">
      <span class="dn">${day}</span>
      ${props.length ? `<div class="mprop">${props.map((p) => `<span class="n">${p.n}</span>`).join("")}</div>` : ""}
      ${
        events.length
          ? `<div class="mdots">${events
              .slice(0, 4)
              .map(() => '<span class="dot"></span>')
              .join("")}${events.length > 4 ? `<span class="more">+${events.length - 4}</span>` : ""}</div>`
          : ""
      }
    </div>`);
  }
  return `
    <div class="calwrap">
      <div class="calhead">${monthName}${calNote(s)}</div>
      <div class="mhead">${WD.map((w) => `<span>${w}</span>`).join("")}</div>
      <div class="month">${cells.join("")}</div>
    </div>`;
}

function posterHTML(d: InviteDesign, large: boolean): string {
  const accent = safeCssColor(d.accent) ?? "#8b5cf6";
  const imageUrl = safeImageUrl(d.imageUrl);
  return `<div class="poster ${d.template}${large ? " lg" : ""}${imageUrl ? " has-img" : ""}" style="--accent:${esc(accent)}">
      ${imageUrl ? `<img class="pimg" src="${esc(imageUrl)}" alt="" referrerpolicy="no-referrer" /><div class="pscrim"></div>` : ""}
      ${d.logoText ? `<span class="plogo">${esc(d.logoText)}</span>` : ""}
      <div class="pmid">
        <div class="ptitle">${esc(d.eventTitle)}</div>
        <div class="pdate">${esc(d.dateLine)}</div>
        ${d.venue ? `<div class="pvenue">${esc(d.venue)}</div>` : ""}
      </div>
      ${d.tagline ? `<div class="ptag">${esc(d.tagline)}</div>` : ""}
    </div>`;
}

function cardInner(item: CardItem, fallbackKind: string): string {
  if (item.design) {
    return `
      <div class="k">${icon("option")}<span>${esc(item.badge ?? "option")}</span>${
        item.selected ? `<span class="chosen">${CHECK} chosen</span>` : ""
      }</div>
      ${posterHTML(item.design, false)}
      <div class="oname">${esc(item.title)}</div>`;
  }
  const kind = item.kind ?? fallbackKind;
  const imageUrl = safeImageUrl(item.imageUrl);
  return `
    <div class="k">${icon(kind)}<span>${esc(kind)}</span>${item.badge ? `<span class="badge">${esc(item.badge)}</span>` : ""}</div>
    ${imageUrl ? `<img class="thumb" src="${esc(imageUrl)}" alt="${esc(item.title)}" referrerpolicy="no-referrer" />` : ""}
    <h2>${esc(item.title)}</h2>
    ${item.subtitle ? `<div class="sub">${esc(item.subtitle)}</div>` : ""}
    ${item.preview ? `<p class="prevw">${esc(item.preview)}</p>` : ""}`;
}

function deckHTML(stack: Stack): string {
  if (!stack.items.length) {
    return `<div class="hello glass"><h1>${esc(stack.title)}</h1><p>No items to show.</p></div><div class="counter">0 items</div>`;
  }
  const cards = stack.items
    .map((item, i) => {
      const off = i - stack.focusIndex;
      const cls =
        off === 0 ? "focus" : off === -1 ? "prev" : off === 1 ? "next" : off < -1 ? "far-left" : "far-right";
      return `<article class="card glass ${cls}${item.design ? " opt" : ""}${item.selected ? " sel" : ""}">${cardInner(item, stack.kind)}</article>`;
    })
    .join("");
  return `<div class="deck">${cards}</div>
    <div class="counter">${esc(stack.title)} · ${stack.focusIndex + 1} of ${stack.items.length}</div>`;
}

function gridHTML(stack: Stack): string {
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase();
  return `<div class="gridwrap">
      <div class="calhead">${esc(stack.title)}<span class="calnote">${stack.items.length} people</span></div>
      <div class="pgrid">
        ${stack.items
          .map(
            (it, i) => `<div class="pchip glass${i === stack.focusIndex ? " focus" : ""}">
              <span class="av">${esc(initials(it.title))}</span>
              <div class="pinfo"><b>${esc(it.title)}</b>${it.subtitle ? `<span>${esc(it.subtitle)}</span>` : ""}</div>
              ${it.badge ? `<span class="badge">${esc(it.badge)}</span>` : ""}
            </div>`,
          )
          .join("")}
      </div>
    </div>`;
}

function doneHTML(s: State): string {
  return `<section class="done">
      <div class="ring">${CHECK}</div>
      <h1>${esc(s.done?.message ?? "Done")}</h1>
      ${s.done?.detail ? `<p>${esc(s.done.detail)}</p>` : ""}
      <div class="rhint">swipe to continue</div>
    </section>`;
}

function readerHTML(stack: Stack): string {
  const item = stack.items[stack.focusIndex];
  if (!item) return "";
  if (item.design) {
    return `<section class="reader glass optreader">
        <div class="k">${icon("option")}<span>${esc(item.badge ?? "option")}</span>${
          item.selected ? `<span class="chosen">${CHECK} chosen</span>` : ""
        }</div>
        ${posterHTML(item.design, true)}
        <div class="rhint">say "this one" · swipe for next · "close"</div>
      </section>`;
  }
  const kind = item.kind ?? stack.kind;
  const imageUrl = safeImageUrl(item.imageUrl);
  return `<section class="reader glass">
      <div class="k">${icon(kind)}<span>${esc(kind)}</span>${item.badge ? `<span class="badge">${esc(item.badge)}</span>` : ""}</div>
      <h1>${esc(item.title)}</h1>
      ${item.subtitle ? `<div class="sub">${esc(item.subtitle)}</div>` : ""}
      ${imageUrl ? `<img class="rimg" src="${esc(imageUrl)}" alt="${esc(item.title)}" referrerpolicy="no-referrer" />` : ""}
      <div class="body">${esc(item.content ?? item.preview ?? "")}</div>
      <div class="rhint">say "close" · swipe for next</div>
    </section>`;
}

function dockHTML(s: State): string {
  const entries: { id: string; title: string; kind: string; on: boolean }[] = [];
  if (s.hasCalendar)
    entries.push({ id: "calendar", title: "Calendar", kind: "event", on: s.view === "calendar" });
  for (const st of s.stacks)
    entries.push({
      id: st.id,
      title: st.title,
      kind: st.kind,
      on: (s.view === "stack" || s.view === "reader") && s.activeStackId === st.id,
    });
  if (!entries.length) return "";
  return entries
    .map(
      (e) =>
        `<button class="dock-item${e.on ? " on" : ""}" data-target="${esc(e.id)}">${icon(e.kind)}<span>${esc(e.title)}</span></button>`,
    )
    .join("");
}

export function renderApp(root: HTMLElement, store: Store, mcpAvailable: boolean) {
  root.innerHTML = `
    <div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
    <div id="chip" class="glass">
      <span id="chip-date"></span>
      <span class="sep">·</span>
      <span class="listen">Listening</span>
      <span class="sep">·</span>
      <span class="mcp">${mcpAvailable ? "WebMCP ✓" : "keys ← →"}</span>
    </div>
    <main id="stage"></main>
    <nav id="dock" class="glass"></nav>
    <div id="hint">◀ swipe ▶ · speak to act</div>
    <ul id="feed"></ul>`;

  const stage = root.querySelector<HTMLElement>("#stage")!;
  const dock = root.querySelector<HTMLElement>("#dock")!;
  const feed = root.querySelector<HTMLElement>("#feed")!;
  const chipDate = root.querySelector<HTMLElement>("#chip-date")!;

  const setDate = () => {
    chipDate.textContent = new Date().toLocaleString("en", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };
  setDate();
  setInterval(setDate, 30_000);

  dock.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-target]");
    if (el?.dataset.target) store.switchTo(el.dataset.target);
  });

  document.addEventListener("agent-feed", (e) => {
    const li = document.createElement("li");
    li.textContent = (e as CustomEvent<string>).detail;
    feed.prepend(li);
    while (feed.children.length > 6) feed.lastChild?.remove();
  });

  store.subscribe((s) => {
    const dockContent = dockHTML(s);
    dock.innerHTML = dockContent;
    dock.style.display = dockContent ? "flex" : "none";
    const stack = store.activeStack();
    if (s.view === "done") stage.innerHTML = doneHTML(s);
    else if (s.view === "calendar") stage.innerHTML = s.calendarView === "week" ? weekHTML(s) : monthHTML(s);
    else if (s.view === "stack" && stack) stage.innerHTML = stack.layout === "grid" ? gridHTML(stack) : deckHTML(stack);
    else if (s.view === "reader" && stack) stage.innerHTML = readerHTML(stack);
    else
      stage.innerHTML = `<div class="hello glass">
        <h1>Surface</h1>
        <p>Ask your agent to put something here —<br/>your mail, your week, a Drive folder, anything.</p>
      </div>`;
  });
}
