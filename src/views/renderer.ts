import type { State, Store } from "../state/store";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function weekDays(anchor: string): string[] {
  const d = new Date(anchor + "T00:00:00");
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

function calendarHTML(s: State): string {
  if (s.calendarView === "week") {
    const today = new Date().toISOString().slice(0, 10);
    return (
      `<div class="week">` +
      weekDays(s.anchor)
        .map((date) => {
          const events = s.events.filter((e) => e.date === date);
          return `<div class="day${date === today ? " today" : ""}"><h3>${date.slice(5)}</h3>${events
            .map((e) => `<div class="event">${e.time ? `<span>${esc(e.time)}</span> ` : ""}${esc(e.title)}</div>`)
            .join("")}</div>`;
        })
        .join("") +
      `</div>`
    );
  }
  const month = s.anchor.slice(0, 7);
  const monthEvents = s.events.filter((e) => e.date.startsWith(month));
  return `<div class="month"><h2>${month}</h2>${
    monthEvents
      .map((e) => `<div class="event"><span>${esc(e.date)}${e.time ? " " + esc(e.time) : ""}</span> ${esc(e.title)}</div>`)
      .join("") || "<p>No events this month.</p>"
  }</div>`;
}

function mailHTML(s: State): string {
  if (!s.emails.length) return "<p>No mail rendered yet.</p>";
  return (
    `<div class="deck">` +
    s.emails
      .map((e, i) => {
        const cls =
          i === s.focusIndex
            ? "card focus"
            : i === s.focusIndex - 1
              ? "card prev"
              : i === s.focusIndex + 1
                ? "card next"
                : "card hidden";
        return `<article class="${cls}"><h3>${esc(e.subject)}</h3><p class="from">${esc(e.from)}</p><p>${esc(
          e.preview ?? "",
        )}</p></article>`;
      })
      .join("") +
    `</div><p class="counter">${s.focusIndex + 1} / ${s.emails.length}</p>`
  );
}

export function renderApp(root: HTMLElement, store: Store, mcpAvailable: boolean) {
  root.innerHTML = `
    <header id="bar">
      <span id="view-name"></span>
      <span id="mcp">${mcpAvailable ? "WebMCP ✓" : "WebMCP unavailable — keyboard ← →"}</span>
    </header>
    <main id="stage"></main>
    <aside id="feed"><h4>Agent feed</h4><ul id="feed-list"></ul></aside>`;

  const stage = root.querySelector<HTMLElement>("#stage")!;
  const viewName = root.querySelector<HTMLElement>("#view-name")!;
  const feedList = root.querySelector<HTMLElement>("#feed-list")!;

  document.addEventListener("agent-feed", (e) => {
    const li = document.createElement("li");
    li.textContent = (e as CustomEvent<string>).detail;
    feedList.prepend(li);
    while (feedList.children.length > 10) feedList.lastChild?.remove();
  });

  store.subscribe((s) => {
    viewName.textContent =
      s.view === "idle"
        ? "waiting for the agent…"
        : s.view === "mail"
          ? `mail · card ${s.focusIndex + 1}/${s.emails.length}`
          : `calendar · ${s.calendarView} · ${s.anchor}`;
    stage.innerHTML =
      s.view === "calendar"
        ? calendarHTML(s)
        : s.view === "mail"
          ? mailHTML(s)
          : `<div class="idle"><h1>Briefing surface</h1><p>Ask your agent to show your calendar or mail.<br/>Swipe (or ← →) to move through what it renders.</p></div>`;
  });
}
