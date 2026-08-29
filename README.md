# WebMCPChallenge (working name)

**A universal, agent-rendered display surface.** Your agent (ChatGPT in its in-app browser, or any WebMCP-capable agent) pulls your real data through its own connectors — Gmail, Google Calendar, Google Drive, anything — and renders it onto a full-screen glass surface. You control it from two metres away:

- **Voice carries intent** — "show me next month", "open the tlive pitch doc", "reply: I'll confirm by Friday". Seconds of agent round-trip are fine for decisions.
- **A palm swipe carries navigation** — next email, next file, next week. Handled entirely on-page (camera → MediaPipe → swipe), because navigation can't wait for a round trip.
- **The swipe sets context the agent reads back** — `surface_get_view_state` tells the agent which card or week you are looking at, so "move *this* to Thursday" just works. Pointing with the whole screen.

Mail and Calendar get tailored views; everything else flows through one universal card system (`surface_show_items`) — the surface is an output device for agents the way a monitor is for programs.

Entry for the [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/).

## Screens

| Mail deck | Single email (reader) |
| --- | --- |
| ![Mail](shots/mail.png) | ![Reader](shots/reader.png) |

| Calendar week | Calendar month | Drive files |
| --- | --- | --- |
| ![Week](shots/calendar.png) | ![Month](shots/month.png) | ![Drive](shots/drive.png) |

## Why WebMCP

The agent's connectors know your data; the page knows your body and your focus. WebMCP is the only channel where those two meet: the page hands the agent a live, structured view of what a human is physically attending to — and tools appear/disappear (`toolchange`) as views change: the reader's `surface_close_item` only exists while the reader is open.

## Tools

| Tool | Direction | Purpose |
| --- | --- | --- |
| `surface_show_calendar` | agent → page | Render fetched events as a week/month view |
| `surface_show_emails` | agent → page | Render fetched emails as swipeable cards (pass `body` for full text) |
| `surface_show_files` | agent → page | Render a Drive folder listing as cards |
| `surface_show_items` | agent → page | **Universal**: render ANY collection as cards |
| `surface_switch` | agent → page | Bring a rendered surface to the front |
| `surface_open_item` | agent → page | Expand the focused card full-screen — *only while a deck is shown* |
| `surface_close_item` | agent → page | Close the reader — *only while the reader is open* |
| `surface_get_view_state` | page → agent | What the user is looking at (deixis: "this one") |
| `surface_speak` | agent → page | Speak through the surface's own speaker |
| `surface_set_calendar_view` | agent → page | Week/month toggle — *only while the calendar is on screen* |

## Run

```bash
bun install
bun run dev
# open http://localhost:5173/?demo=mail   (also: drive | calendar | month | reader)
# ← → keys mirror the palm swipe; window.__surface exposes store + adapter
```

## Status

- [x] WebMCP adapter (`document.modelContext` / `navigator.modelContext`, dynamic tool sets)
- [x] Universal stack/card model; Mail, Drive, and generic surfaces; calendar week + month
- [x] Reader mode (single email / doc full-screen), dock, deixis via `surface_get_view_state`
- [x] Glass UI (direction C: card deck, Apple-glass polish)
- [ ] Camera palm-swipe (port from [dsh-jarvis-hud](https://github.com/shekkawai/dsh-jarvis-hud), MIT)
- [ ] Verify tool calls end-to-end in ChatGPT desktop in-app browser
- [ ] Demo video

Early UI direction mockups live in `mockups/`.

## License

MIT
