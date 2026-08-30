import type { CardItem, InviteDesign, Stack, State, Store } from "../state/store";
import { dockTargets } from "../state/store";
import { formatDistance, haversineM, isValidCoord } from "../geo";
import { localDateISO, safeCssColor, safeImageUrl } from "../utils";
import { SurfaceMotion, cardRole } from "../motion";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Whether a WebMCP host is attached — set once by renderApp, read by the
// bare-URL welcome state so its first step reflects reality.
let mcpOn = false;

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

const kindLabel = (kind: string) => (kind === "generic" ? "" : `<span>${esc(kind)}</span>`);

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
  const facts = item.facts?.length
    ? `<dl class="card-facts">${item.facts
        .slice(0, 6)
        .map((fact) => `<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}</dd></div>`)
        .join("")}</dl>`
    : "";
  return `
    <div class="k">${icon(kind)}${kindLabel(kind)}${item.badge ? `<span class="badge">${esc(item.badge)}</span>` : ""}</div>
    ${imageUrl ? `<img class="thumb" src="${esc(imageUrl)}" alt="${esc(item.title)}" referrerpolicy="no-referrer" />` : ""}
    <h2>${esc(item.title)}</h2>
    ${item.subtitle ? `<div class="sub">${esc(item.subtitle)}</div>` : ""}
    ${item.preview ? `<p class="prevw">${esc(item.preview)}</p>` : ""}
    ${facts}`;
}

function deckHTML(stack: Stack): string {
  if (!stack.items.length) {
    return `<div class="hello glass"><h1>${esc(stack.title)}</h1><p>No items to show.</p></div><div class="counter">0 items</div>`;
  }
  const cards = stack.items
    .map((item, i) => {
      const cls = cardRole(i, stack.focusIndex);
      return `<article class="card glass ${cls}${item.design ? " opt" : ""}${item.selected ? " sel" : ""}" data-motion-index="${i}">${cardInner(item, stack.kind)}</article>`;
    })
    .join("");
  return `<div class="deck">${cards}</div>
    <div class="counter" data-motion-counter data-motion-title="1">${esc(stack.title)} · ${stack.focusIndex + 1} of ${stack.items.length}</div>`;
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
            (it, i) => `<div class="pchip glass${i === stack.focusIndex ? " focus" : ""}" data-motion-index="${i}">
              <span class="av">${esc(initials(it.title))}</span>
              <div class="pinfo"><b>${esc(it.title)}</b>${it.subtitle ? `<span>${esc(it.subtitle)}</span>` : ""}</div>
              ${it.badge ? `<span class="badge">${esc(it.badge)}</span>` : ""}
            </div>`,
          )
          .join("")}
      </div>
    </div>`;
}

function presentationHead(stack: Stack, note: string): string {
  return `<div class="present-head"><div><span class="purpose">${esc(stack.purpose ?? "browse")}</span><h1>${esc(stack.title)}</h1></div><span class="present-note">${esc(note)}</span></div>`;
}

function comparisonHTML(stack: Stack): string {
  const labels = [...new Set(stack.items.flatMap((item) => item.facts?.map((fact) => fact.label) ?? []))].slice(0, 6);
  const valueFor = (item: CardItem, label: string) => item.facts?.find((fact) => fact.label === label)?.value ?? "—";
  const table = `<div class="compare-table glass"><table><thead><tr><th>Option</th>${labels
    .map((label) => `<th>${esc(label)}</th>`)
    .join("")}</tr></thead><tbody>${stack.items
    .map(
      (item, index) => `<tr class="${index === stack.focusIndex ? "focus" : ""}" data-motion-index="${index}"><th><b>${esc(item.title)}</b>${
        item.subtitle ? `<span>${esc(item.subtitle)}</span>` : ""
      }</th>${labels.map((label) => `<td>${esc(valueFor(item, label))}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;
  return `<section class="present comparison">
    ${presentationHead(stack, `${stack.items.length} options · same data, context-fit UI`)}
    ${table}
    <div class="compare-cards">${deckHTML(stack)}</div>
  </section>`;
}

function listHTML(stack: Stack): string {
  return `<section class="present present-list">
    ${presentationHead(stack, `${stack.items.length} items · swipe to move focus`)}
    <div class="list-rows">${stack.items
      .map(
        (item, index) => `<article class="list-row glass${index === stack.focusIndex ? " focus" : ""}${item.selected ? " selected" : ""}" data-motion-index="${index}">
          <span class="list-index">${String(index + 1).padStart(2, "0")}</span>
          <div class="list-copy"><h2>${esc(item.title)}</h2>${item.subtitle ? `<span>${esc(item.subtitle)}</span>` : ""}${
            item.preview ? `<p>${esc(item.preview)}</p>` : ""
          }</div>
          ${item.selected ? `<span class="triage-state">${CHECK} marked</span>` : item.badge ? `<span class="badge">${esc(item.badge)}</span>` : ""}
        </article>`,
      )
      .join("")}</div>
    <div class="counter" data-motion-counter>${stack.focusIndex + 1} of ${stack.items.length}</div>
  </section>`;
}

function summaryHTML(stack: Stack): string {
  const shown = stack.purpose === "glance" ? stack.items.slice(0, 6) : stack.items;
  const note =
    shown.length < stack.items.length
      ? `showing ${shown.length} of ${stack.items.length}`
      : `${stack.items.length} concise ${stack.items.length === 1 ? "summary" : "summaries"}`;
  return `<section class="present summary-view">
    ${presentationHead(stack, note)}
    <div class="summary-grid">${shown
      .map(
        (item, index) => `<article class="summary-card glass${index === stack.focusIndex ? " focus" : ""}" data-motion-index="${index}">${cardInner(
          item,
          stack.kind,
        )}</article>`,
      )
      .join("")}</div>
    <div class="counter" data-motion-counter>${stack.focusIndex + 1} of ${stack.items.length}</div>
  </section>`;
}

function mapHTML(stack: Stack, s: State): string {
  const focused = stack.items[stack.focusIndex];
  const hasFocusCoord = focused && isValidCoord(focused.lat, focused.lng);
  const routed = s.route && focused && s.route.toId === focused.id ? s.route : null;
  const walkChip = routed
    ? `<span class="route-chip${routed.fallback ? " approx" : ""}">🚶 ${formatDistance(routed.distanceM)} · ${routed.durationMin} min${routed.fallback ? " · straight line" : ""}</span>`
    : s.userLocation && hasFocusCoord
      ? `<span class="route-chip dim">${formatDistance(haversineM(s.userLocation, { lat: focused!.lat!, lng: focused!.lng! }))} away</span>`
      : "";
  const facts = focused?.facts
    ?.slice(0, 3)
    .map((fact) => `<span class="map-fact"><b>${esc(fact.label)}</b> ${esc(fact.value)}</span>`)
    .join("") ?? "";
  const overlay = focused
    ? `<div class="map-overlay glass" data-motion-index="${stack.focusIndex}">
        <div class="k">${icon(focused.kind ?? stack.kind)}<span class="map-n">${stack.focusIndex + 1}</span>${
          focused.badge ? `<span class="badge">${esc(focused.badge)}</span>` : ""
        }${focused.selected ? `<span class="chosen">${CHECK} chosen</span>` : ""}</div>
        <h2>${esc(focused.title)}</h2>
        ${focused.subtitle ? `<div class="sub">${esc(focused.subtitle)}</div>` : ""}
        ${focused.preview ? `<p class="prevw">${esc(focused.preview)}</p>` : ""}
        <div class="map-meta">${walkChip}${facts}</div>
      </div>`
    : "";
  return `<section class="mapstage">
      <div class="map-canvas" data-map-canvas></div>
      ${overlay}
      <div class="counter" data-motion-counter>${esc(stack.title)} · ${stack.focusIndex + 1} of ${stack.items.length}</div>
    </section>`;
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
      <div class="k">${icon(kind)}${kindLabel(kind)}${item.badge ? `<span class="badge">${esc(item.badge)}</span>` : ""}</div>
      <h1>${esc(item.title)}</h1>
      ${item.subtitle ? `<div class="sub">${esc(item.subtitle)}</div>` : ""}
      ${imageUrl ? `<img class="rimg" src="${esc(imageUrl)}" alt="${esc(item.title)}" referrerpolicy="no-referrer" />` : ""}
      <div class="body">${esc(item.content ?? item.preview ?? "")}</div>
      <div class="rhint">say "close" · swipe for next</div>
    </section>`;
}

function dockHTML(s: State): string {
  const entries = dockTargets(s);
  if (!entries.length) return "";
  const activeId =
    s.view === "calendar" ? "calendar" : s.view === "stack" || s.view === "reader" ? s.activeStackId : null;
  const hint =
    s.dockFocus !== null ? '<span class="dock-hint">◀ ▶ choose · select opens · ▲ back</span>' : "";
  return (
    hint +
    entries
      .map(
        (e, i) =>
          `<button class="dock-item${e.id === activeId ? " on" : ""}${s.dockFocus === i ? " pick" : ""}" data-target="${esc(e.id)}">${icon(e.kind)}<span>${esc(e.title)}</span></button>`,
      )
      .join("")
  );
}

function stageHTML(s: State, stack: Stack | null): string {
  if (s.view === "done") return doneHTML(s);
  if (s.view === "calendar") return s.calendarView === "week" ? weekHTML(s) : monthHTML(s);
  if (s.view === "stack" && stack) {
    if (stack.layout === "map") return mapHTML(stack, s);
    if (stack.layout === "grid") return gridHTML(stack);
    if (stack.layout === "comparison") return comparisonHTML(stack);
    if (stack.layout === "list") return listHTML(stack);
    if (stack.layout === "summary") return summaryHTML(stack);
    return deckHTML(stack);
  }
  if (s.view === "reader" && stack) return readerHTML(stack);
  // The bare-URL landing doubles as the 30-second pitch: what this page is,
  // how the agent connects, and where the glasses view lives. It is the empty
  // state, so the first agent render replaces it naturally.
  return `<div class="hello glass welcome">
    <h1>WebHUD</h1>
    <p class="tagline">Smart glasses without the vendor OS — a web page, your agent, any glass.</p>
    <ol class="steps">
      <li><span class="k">1 · Connect</span><span>${
        mcpOn
          ? `Your agent is connected — WebMCP is live on this page ✓`
          : `Open this page inside <b>ChatGPT's browser</b> — WebMCP works out of the box`
      }</span></li>
      <li><span class="k">2 · Talk</span><span>Use <b>ChatGPT Voice</b>: “show my emails” · “find three venues and compare” · “find a cafe near me”</span></li>
      <li><span class="k">3 · Project</span><span>Press <b>G</b> for the smart-glasses lens — swipe with palm, ring, or ← →</span></li>
    </ol>
    <p class="fallback">No agent handy? Add <code>?demo=calendar</code> to the URL, or just press ← →.</p>
  </div>`;
}

export function renderApp(root: HTMLElement, store: Store, mcpAvailable: boolean) {
  mcpOn = mcpAvailable;
  root.innerHTML = `
    <div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
    <div id="chip" class="glass">
      <span id="chip-date"></span>
      <span class="sep">·</span>
      <span class="listen">Listening</span>
      <span class="sep">·</span>
      <span class="mcp">${mcpAvailable ? "WebMCP ✓" : "keys ← →"}</span>
      <span class="sep">·</span>
      <button id="camera-toggle" type="button">Camera</button>
      <span class="sep">·</span>
      <button id="controller-toggle" type="button" data-controller-ui>Controller</button>
      <span class="sep">·</span>
      <button id="glasses-toggle" type="button">Glasses</button>
    </div>
    <main id="stage"></main>
    <nav id="dock" class="glass"></nav>
    <div id="hint">◀ swipe ▶ · speak to act</div>
    <ul id="feed"></ul>
    <aside id="camera-panel" class="glass" hidden>
      <div id="camera-frame">
        <video id="camera-video" autoplay muted playsinline></video>
        <canvas id="camera-overlay" aria-hidden="true"></canvas>
      </div>
      <span id="camera-status" data-state="off">camera off</span>
      <ul id="gesture-hints">
        <li><b>🖐</b> open palm — turns <i>green</i></li>
        <li><b>⇄</b> sweep — prev / next</li>
        <li><b>⌨</b> arrow keys work too</li>
      </ul>
    </aside>
    <aside id="controller-panel" class="glass" data-controller-ui hidden>
      <div class="controller-head">
        <div><span>INPUT</span><h2>Controller Setup</h2></div>
        <button id="controller-close" type="button" aria-label="Close controller setup">×</button>
      </div>
      <p id="controller-status">Teach the page three ring buttons</p>
      <ol class="controller-steps">
        <li data-controller-action="previous"><span class="step-number">1</span><b>Previous</b><span class="controller-binding">Not learned</span></li>
        <li data-controller-action="next"><span class="step-number">2</span><b>Next</b><span class="controller-binding">Not learned</span></li>
        <li data-controller-action="select"><span class="step-number">3</span><b>Select</b><span class="controller-binding">Not learned</span></li>
        <li data-controller-action="down" class="optional"><span class="step-number">4</span><b>Down · dock <small>optional</small></b><span class="controller-binding">Not learned</span></li>
        <li data-controller-action="up" class="optional"><span class="step-number">5</span><b>Up · back <small>optional</small></b><span class="controller-binding">Not learned</span></li>
      </ol>
      <label class="controller-mode"><span><b>Ring Mode</b><small>Use only the controls learned above</small></span><input id="controller-mode" type="checkbox" /></label>
      <div class="controller-actions">
        <button id="controller-start" type="button">Start setup</button>
        <button id="controller-skip" type="button" hidden>Skip — 3 is enough</button>
        <button id="controller-reset" type="button" hidden>Reset</button>
      </div>
      <p class="controller-note">Keyboard scrolling stays normal. Wheel gestures navigate only while Ring Mode is on. Calendar creation and sending still require voice confirmation.</p>
    </aside>
    <div id="swipe-pulse" aria-hidden="true"></div>`;

  const stage = root.querySelector<HTMLElement>("#stage")!;
  const dock = root.querySelector<HTMLElement>("#dock")!;
  const feed = root.querySelector<HTMLElement>("#feed")!;
  const chipDate = root.querySelector<HTMLElement>("#chip-date")!;
  const motion = new SurfaceMotion(stage);

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

  let prevState: State | undefined;
  let previous:
    | {
        view: State["view"];
        activeStackId: string | null;
        stackLayout?: Stack["layout"];
        stackItems?: CardItem[];
        focusIndex?: number;
        anchor: string;
        calendarView: State["calendarView"];
      }
    | undefined;

  store.subscribe((s) => {
    const dockContent = dockHTML(s);
    dock.innerHTML = dockContent;
    dock.style.display = dockContent ? "flex" : "none";
    dock.classList.toggle("picking", s.dockFocus !== null);
    // A dock-highlight move changes nothing on the stage; rebuilding it would
    // restart transitions for no visual change, so only the dock re-renders.
    const dockOnly =
      prevState !== undefined &&
      (Object.keys(s) as (keyof State)[]).every((k) => k === "dockFocus" || Object.is(s[k], prevState![k]));
    prevState = s;
    if (dockOnly) return;
    const stack = store.activeStack();
    const html = stageHTML(s, stack);
    const sameStack =
      previous &&
      (s.view === "stack" || s.view === "reader") &&
      s.view === previous.view &&
      s.activeStackId === previous.activeStackId &&
      stack?.layout === previous.stackLayout;
    const focusChanged = sameStack && stack && previous?.focusIndex !== stack.focusIndex;
    const itemsUnchanged = sameStack && stack?.items === previous?.stackItems;

    if (focusChanged && itemsUnchanged && s.view === "stack" && stack) {
      const compactSingleItem =
        stack.layout === "map" ||
        (document.body.classList.contains("glasses-on") && (stack.layout === "list" || stack.layout === "summary"));
      if (compactSingleItem) {
        const direction = stack.focusIndex > (previous?.focusIndex ?? 0) ? 1 : -1;
        motion.replace(html, { kind: "swipe", direction });
      } else {
        motion.syncFocus(stack.focusIndex, stack.items.length, stack.title);
      }
    } else if (focusChanged && itemsUnchanged && s.view === "reader" && stack) {
      const direction = stack.focusIndex > (previous?.focusIndex ?? 0) ? 1 : -1;
      motion.replace(html, { kind: "swipe", direction });
    } else if (
      previous &&
      s.view === "calendar" &&
      previous.view === "calendar" &&
      s.calendarView === previous.calendarView &&
      s.anchor !== previous.anchor
    ) {
      const direction = new Date(`${s.anchor}T00:00:00`) > new Date(`${previous.anchor}T00:00:00`) ? 1 : -1;
      motion.replace(html, { kind: "swipe", direction });
    } else {
      const sameSurface =
        previous &&
        s.view === previous.view &&
        s.activeStackId === previous.activeStackId &&
        s.calendarView === previous.calendarView;
      motion.replace(html, { kind: sameSurface ? "refresh" : "surface" });
    }

    previous = {
      view: s.view,
      activeStackId: s.activeStackId,
      stackLayout: stack?.layout,
      stackItems: stack?.items,
      focusIndex: stack?.focusIndex,
      anchor: s.anchor,
      calendarView: s.calendarView,
    };

  });

  // Mount/refresh the live map once the stage DOM has genuinely settled —
  // motion finalizes transitions by rewriting stage.innerHTML, which drops
  // any node appended mid-transition, so mounting waits for stage-settled.
  // Lazy import keeps Leaflet out of the base bundle.
  const mountMap = () => {
    if (store.activeStack()?.layout !== "map" || store.state.view !== "stack") return;
    const canvases = stage.querySelectorAll<HTMLElement>("[data-map-canvas]");
    const placeholder = canvases[canvases.length - 1];
    if (placeholder) void import("./mapview").then((m) => m.sync(store, placeholder));
  };
  stage.addEventListener("stage-settled", mountMap);

  return motion;
}
