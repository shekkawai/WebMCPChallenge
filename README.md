# WebMCPChallenge (working name)

**A universal, agent-rendered display surface.** Your agent (ChatGPT in its in-app browser, or any WebMCP-capable agent) pulls your real data through its own connectors — Gmail, Google Calendar, Google Drive, anything — and renders it onto a full-screen glass surface. You control it from two metres away:

- **Voice carries intent** — "show me next month", "open the tlive pitch doc", "reply: I'll confirm by Friday". Seconds of agent round-trip are fine for decisions.
- **A palm swipe carries navigation** — next email, next file, next week. Handled entirely on-page (camera → MediaPipe → swipe), because navigation can't wait for a round trip.
- **Motion stays attached to the input** — cards follow the palm continuously, then spring into place; ring and keyboard navigation use the same settling motion, while calendars and readers transition directionally.
- **The swipe sets context the agent reads back** — `surface_get_view_state` tells the agent which card or week you are looking at, so "move *this* to Thursday" just works. Pointing with the whole screen.

Mail and Calendar get tailored views; everything else can flow through `surface_present`, an intent-based renderer. The agent says whether the user needs to glance, browse, inspect, compare, choose, or triage. The page chooses the component for the current context. The same comparison becomes a table on desktop and swipeable cards inside the glasses lens, without resending data.

This pattern is documented as an experimental standard proposal in [SPEC.md](SPEC.md): **the agent decides what and why; the context decides how.**

Entry for the [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/).

**Live demo:** <https://webmcp-challenge.shekkawai.workers.dev>

## Screens

| Mail deck | Single email (reader) |
| --- | --- |
| ![Mail](shots/mail.png) | ![Reader](shots/reader.png) |

| Calendar week | Calendar month | Drive files |
| --- | --- | --- |
| ![Week](shots/calendar.png) | ![Month](shots/month.png) | ![Drive](shots/drive.png) |

| Same `compare` data on desktop | Same state in Glasses mode |
| --- | --- |
| ![Desktop comparison table](shots/compare.png) | ![Glasses comparison cards](shots/compare-glasses.png) |

## Why WebMCP

The agent's connectors know your data; the page knows your body and your focus. WebMCP is the only channel where those two meet: the page hands the agent a live, structured view of what a human is physically attending to — and tools appear/disappear (`toolchange`) as views change: the reader's `surface_close_item` only exists while the reader is open.

## Tools

| Tool | Direction | Purpose |
| --- | --- | --- |
| `surface_show_calendar` | agent → page | Render fetched events as a week/month view |
| `surface_show_emails` | agent → page | Render fetched emails as swipeable cards (pass `body` for full text) |
| `surface_show_files` | agent → page | Render a Drive folder listing as cards |
| `surface_show_items` | agent → page | **Universal**: render ANY collection as cards |
| `surface_present` | agent → page | **Smart Responsive**: render semantic data by purpose, adapting desktop ↔ glasses and returning a render receipt |
| `surface_select_item` | agent → page | Select from a `purpose: "choose"` presentation; dynamically registered only while choices are shown |
| `surface_toggle_item` | agent → page | Mark/unmark items in a `purpose: "triage"` presentation; dynamically registered only during triage |
| `surface_switch` | agent → page | Bring a rendered surface to the front |
| `surface_dismiss` | agent → page | Remove a surface from the dock entirely (“close the mail panel”); registered only while surfaces exist |
| `map_set_location` | agent → page | Set the user's (possibly simulated) position — the map's blue you-are-here dot |
| `map_show_route` | agent → page | Draw + animate the walking route to a pin; returns distance, minutes, and street names for the agent to speak; registered only while a map is on screen |
| `surface_open_item` | agent → page | Expand the focused card full-screen — *only while a deck is shown* |
| `surface_close_item` | agent → page | Close the reader — *only while the reader is open* |
| `surface_get_view_state` | page → agent | What the user is looking at (deixis: "this one") |
| `surface_speak` | agent → page | Speak through the surface's own speaker |
| `surface_set_calendar_view` | agent → page | Week/month toggle — *only while the calendar is on screen* |
| `calendar_propose_slots` | agent → page | Paint numbered proposed time slots onto the calendar — *calendar only* |
| `calendar_confirm_slot` | agent → page | Confirm a proposed slot; only claim “Event added” after the calendar connector confirms creation — *only while proposals exist* |
| `surface_show_options` | agent → page | Render 2–4 designed option cards with structured text and optional agent/Drive artwork |
| `option_select` | agent → page | Mark the chosen option — *only while options are shown* |
| `surface_show_people` | agent → page | Render recipients/contacts as a name-chip grid |
| `surface_confirm_done` | agent → page | Full-screen check confirmation after an action completes |
| `surface_open_image` | agent → page | Display an image from an HTTPS URL or `data:` URL (the Webroom ingestion pattern) |

## Run

```bash
bun install
bun run test
bun run dev
# open http://localhost:5173/?demo=mail
# (also: drive | calendar | month | reader | compare | slots | options | chosen | people | done | photo)
# Click Camera to enable palm swipes; ← → remains the no-camera fallback
# Click Controller to teach a BLE ring/clicker its Previous, Next, and Select buttons
# Click Glasses (or press G, or add &glasses=1) for the smart-glasses
#   simulation — a POV shot through one lens, with the live surface pinned
#   inside the lens at any window size. Every input channel keeps working
#   underneath. Purely presentational.
# window.__surface exposes the store, WebMCP adapter, and gesture controller
```

### Glasses simulation (smart-responsive preview)

Responsive design adapted layout to screens; this surface adapts *interaction*
to context. The **Glasses** toggle shows what that means: the wearer's point
of view through one lens, with the same live page projected inside the lens as
a monocular AR display — driven by voice (through the agent) and a ring, with
no keyboard in reach. This is a real **glasses breakpoint**, not a scaled-down
screen: the app is given a genuine near-square viewport carved into the lens,
so the layout reflows (compact chip, tighter cards, denser calendar) and text
stays readable — the same way a phone breakpoint reflows a desktop page. The
frame is the subject, not the photo: JS scales the shot so the whole glasses
frame fits the window height and pins the lens centre to the screen centre, so
the photo bleeds off the sides (mostly the left) rather than the frame being
cropped — a wider window shows more frame, never less. Beyond about 16:9 the
photo stops short of the edges and fades into an out-of-focus peripheral fill
(`LENS`, `FRAME_SPAN` and `FILL_*` in `src/views/glasses.ts` hold the tuning if
the photo changes; `tests/glasses.test.ts` pins the geometry).
The page's capabilities don't change between contexts; only the input
channels and the layout do.

![Glasses simulation](shots/glasses.png)

### Testing the camera gesture

Click **Camera** in the top chip. The preview panel draws a live hand skeleton
over the webcam feed, so tracking is visible at a glance:

- **White skeleton** — your hand is tracked, but the pose isn't an open palm yet.
- **Green skeleton** — open palm recognized; a left/right sweep will fire.
- The status line narrates the same states (`raise a hand into view` →
  `hand tracked — open your palm` → `open palm ✓ — sweep left / right` →
  `swipe ✓ next`), and a gesture legend sits under the preview.

A swipe needs a deliberate sideways sweep (~15% of the frame width within
~0.3s). Slow drift and closed fists are ignored by design; after each swipe
there is a ~0.5s cooldown before the next one can fire. While the palm moves,
the focused card follows its progress and the incoming card is revealed; an
incomplete gesture springs back. Reduced-motion preferences disable this
direct manipulation and all decorative transitions. It follows the familiar
touch-carousel convention: sweep left for next, sweep right for previous.

### Ring / clicker / wheel input — the D-pad model

Navigation works like a game controller. **Left/Right** move focus,
**Down** drops a visible amber highlight onto the dock (the tab bar),
Left/Right then move the highlight between surfaces, **Select** opens the
highlighted tab, and **Up** returns focus to the cards. Inside an open
document, Down/Up scroll it instead — reading beats navigating.

Click **Controller**, then press the ring's **Previous**, **Next**, and
**Select** buttons once; a 4-direction ring can optionally also teach **Down**
and **Up** (or press Skip — three buttons is enough). The page learns the
exact keyboard key, mouse button, or wheel direction emitted by that device,
saves it locally, and turns on Ring Mode. Rings that emit real arrow keys get
the full D-pad with no setup at all. Select opens the focused email/file,
chooses the focused invitation design, or switches to the highlighted dock
tab; it never creates a calendar event or sends anything—those actions still
require voice confirmation through the agent.

Outside Ring Mode the same D-pad works on the plain keyboard (arrows + Enter,
away from form controls), while vertical scrolling, mouse clicks, and trackpad
gestures keep their normal browser behavior. Some media/browser keys can be
consumed by the operating system and will not reach any webpage; Controller
Setup makes that limitation visible instead of claiming universal
compatibility.

### Live map — the location shape

Items sent through `surface_present` that carry `lat`/`lng` render as numbered
pins on a real map (Leaflet + OpenStreetMap tiles, darkened by a CSS filter —
no API key, no backend). The map is a lazy-loaded chunk, so the base page pays
zero bytes for it until a location surface first renders.

The agent is the data source ("find a cafe near me" → its own web search →
pins), and the user's position is **told, not tracked**: `map_set_location`
sets the blue dot from what the user says ("assume I'm at Wan Chai MTR") —
the page never reads device GPS. `map_show_route` has the page fetch the
walking route (FOSSGIS OSRM, the same routing openstreetmap.org uses), draw it
with a draw-in + flowing-dash animation, and return only the human-scale
summary — distance, minutes, street names — through the tool channel, so the
agent can speak directions it could never compute itself. A routing outage
degrades to a dashed straight-line estimate; the demo never stalls.

Try `?demo=cafes` (pins + you-are-here) and `?demo=route` (animated walking
route). Swipe — palm, ring, or keys — moves pin to pin.

Deploy the production build to Cloudflare Workers with `bun run deploy`.

Every pull request is automatically tested and built. Every push to `main` that passes those checks is deployed to Cloudflare Workers by `.github/workflows/deploy.yml`. The repository requires `CLOUDFLARE_ACCOUNT_ID` and a Worker-scoped `CLOUDFLARE_API_TOKEN` as GitHub Actions secrets.

## Status

- [x] WebMCP adapter (`document.modelContext`, AbortSignal-owned dynamic registrations; legacy fallback retained)
- [x] Universal stack/card model; Mail, Drive, and generic surfaces; calendar week + month
- [x] Reader mode (single email / doc full-screen), dock, deixis via `surface_get_view_state`
- [x] Glass UI (direction C: card deck, Apple-glass polish)
- [x] Intent-based `surface_present` contract with six purposes, adaptive comparison/list/summary renderers, receipts, safe degradation, and [SPEC.md](SPEC.md)
- [x] Event-planning flow: slot proposals → confirm-to-event, rendered invitation-card options, recipients grid, sent confirmation
- [x] Camera palm-swipe, local MediaPipe model, explicit camera control, and landmark-level tests (ported from [dsh-jarvis-hud](https://github.com/shekkawai/dsh-jarvis-hud), MIT)
- [x] Live hand-skeleton overlay on the camera preview, per-state status line, and on-screen gesture hints
- [x] Unified motion system: live palm-following cards, spring settling, directional calendar/reader transitions, and reduced-motion support
- [x] Opt-in Controller Setup for BLE rings/clickers with learned Previous, Next, and safe local Select controls
- [x] Cloudflare Workers deployment with all camera assets verified over HTTPS
- [ ] Verify tool calls end-to-end in ChatGPT desktop in-app browser
- [ ] Demo video

Early UI direction mockups live in `mockups/`.

## License

MIT
