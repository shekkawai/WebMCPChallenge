# WebMCP Challenge — agent notes

Public MIT repo `shekkawai/WebMCPChallenge`, entered in OpenAI's WebMCP Challenge
(**deadline Sept 4 2026, 04:00 HK**). Live at
`https://webmcp-challenge.shekkawai.workers.dev`.

The pitch is **Smart Responsive**: responsive design adapted *layout* to screen size;
this adapts *interaction and presentation* to context. The agent says what the data is
and what the user needs to do with it; the page decides how it looks on a desk, across
a room, or in a lens. `SPEC.md` is the standard proposal and is the most quotable
artifact in the repo — keep it and the code in agreement.

## Non-negotiables

- **The agent never picks a component.** It sends `purpose` (one of six) plus items via
  `surface_present`; the page maps purpose + context + item shape to a renderer. Layout
  `hint`s are advisory and may be ignored; `purpose` may not. Unknown purpose degrades to
  `browse` rather than failing. Never add `show_table`/`show_dropdown`-style tools — the
  whole argument dies if the vocabulary becomes one tool per widget.
- **Sensitive actions stay human-confirmed.** Ring Select and local tools may open, close,
  focus, and choose. They may never create a calendar event or send anything. The page
  also must not claim "Event added" before the write is confirmed.
- **`surface_get_view_state` returns IDs, titles, and `hasContent`/`hasImage` flags only** —
  never email bodies, never base64 image data. It is the deixis channel ("this one"), not
  a data exfiltration route.
- **Ring/controller input is opt-in and learned.** Outside Ring Mode, vertical wheel,
  ArrowUp/Down, PageUp/Down and ordinary clicks must do nothing. A learned wheel binding
  must never hijack scrolling inside an open reader. These rules exist because each was a
  real bug found in a browser pass, not by tests.
- **Camera is opt-in, and the pixels never leave the tab.** The privacy line ("the agent
  coached me and never saw me") is load-bearing for the submission.
- Camera, ring, keyboard, mouse and the agent are **independently stackable channels**,
  never a mode switch the user must choose between.

## Verification that actually catches things

`bun test` (60 tests) covers pose maths from real landmark fixtures, the swipe classifier,
purpose mapping, adapter registration lifecycle, and glasses geometry. It has repeatedly
passed while the app was broken in the browser — **every input, motion, or layout change
needs a live `agent-browser` pass too.**

- `agent-browser screenshot <path>` — the full-page flag is `--full`, **not**
  `--full-page`; passing the wrong one silently creates a file literally named
  `--full-page` in the cwd instead of failing. This has happened three times.
- Everything is drivable without a camera: `?demo=mail|drive|calendar|month|reader|slots|options|chosen|people|done|photo|compare`,
  arrow keys mirror the palm swipe 1:1, and `?glasses=1` forces the lens view.
- Glasses mode is **persisted**, so a URL without `glasses=1` can still open in the lens.
  Press `G` or use the Exit button before capturing a "desktop" screenshot.

## Architecture facts (do not re-derive)

- Static Vite build, no backend. `src/webmcp/adapter.ts` resolves both
  `document.modelContext` and the older `navigator.modelContext`, and registers tools with
  an `AbortSignal` so dynamic re-registration genuinely unregisters. Registering by
  signature and re-registering on state change is what makes `toolchange` fire — that is
  the spec feature the judges built and it is a scored part of the entry.
- `src/motion.ts` owns all motion. Deck focus changes are **CSS role classes**
  (`focus`/`prev`/`next`/`far-left`/`far-right`) transitioning on `.card`, not per-frame JS;
  `trackSwipe` only takes over during a live palm drag and `gesture-tracking` disables the
  transition while it does. View swaps animate through two stacked layers in `replace()`.
- `src/views/glasses.ts` is presentational only and must stay that way. `LENS` at the top
  is the only thing to change if the photo is swapped. The frame — not the photo — is
  anchored to the viewport centre, so a wider window shows more frame, never a cropped one.
  The app gets a real near-square viewport and **reflows**; it is never scaled down.
- `public/mediapipe/` is ~40 MB of vendored WASM + hand-landmarker model (no CDN egress).
  It is deliberate; obligations are recorded in `THIRD-PARTY-NOTICES.md`.

## Deploying

`bun run deploy` — note the script runs `env -u CLOUDFLARE_API_TOKEN wrangler deploy`.
Both Cloudflare tokens in Zo secrets are **expired**; unsetting the stale env var lets
wrangler fall back to its cached OAuth login, which works. Do not "fix" that by removing
the `env -u`.

`.github/workflows/deploy.yml` runs tests + build on every PR and push, then deploys only
if the `CLOUDFLARE_API_TOKEN` repo secret exists. It does not, so CI verifies and **skips
the deploy step cleanly** — that is expected, not a failure. `CLOUDFLARE_ACCOUNT_ID` is
already set. Until Shek creates a Worker-edit token, every deploy is manual from here, so
**always confirm the live bundle hash matches a fresh local build** after pushing.

## Still open

Live connector rehearsal in ChatGPT desktop, and the 3-minute video. Both are the critical
path; new features are not. The video arc is one page shot three ways — desk (keys), across
the room (voice + palm), glasses context (voice + ring) — with no code change between shots.
