import { Store } from "./state/store";
import { WebMCPAdapter } from "./webmcp/adapter";
import { wireTools } from "./tools";
import { renderApp } from "./views/renderer";
import { attachCameraSwipe, type CameraSwipeController } from "./gesture/swipe";
import { attachControllerInput, type ControllerInput } from "./input/controller";
import { attachGlassesMode, type GlassesMode } from "./views/glasses";
import { localDateISO } from "./utils";

const store = new Store();
const mcp = new WebMCPAdapter();

renderApp(document.getElementById("app")!, store, mcp.available);
wireTools(store, mcp);
const gesture = attachCameraSwipe(store);
const controller = attachControllerInput(store);
const glasses = attachGlassesMode();

declare global {
  interface Window {
    __surface: { store: Store; mcp: WebMCPAdapter; gesture: CameraSwipeController; controller: ControllerInput; glasses: GlassesMode };
  }
}
window.__surface = { store, mcp, gesture, controller, glasses };

// ?demo=mail|drive|calendar|month|reader seeds fake data so every view is
// testable without an agent attached.
const demo = new URLSearchParams(location.search).get("demo");
if (demo !== null) {
  const iso = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return localDateISO(d);
  };

  store.showCalendar(
    [
      { date: iso(0), time: "10:30", title: "AI Meetup rehearsal" },
      { date: iso(0), time: "15:00", title: "Kelvin — tlive pricing call" },
      { date: iso(0), time: "16:00", title: "tlive demo · hall B" },
      { date: iso(1), time: "11:00", title: "OMP newsletter review" },
      { date: iso(3), title: "Sparkdemy client onboarding" },
      { date: iso(5), time: "19:00", title: "AI Meetup HK — WebMCP talk" },
      { date: iso(8), time: "14:00", title: "Coreply client check-in" },
      { date: iso(12), title: "Content batch day" },
    ],
    "week",
  );

  store.showStack("drive", "Proposals", "file", [
    { id: "d1", kind: "folder", title: "Client Proposals", subtitle: "12 items · me", badge: "FOLDER" },
    {
      id: "d2",
      kind: "doc",
      title: "tlive pitch — events package",
      subtitle: "me · Aug 27",
      badge: "DOC",
      preview: "Per-event pricing, audience cap tiers, and the September conference rollout plan.",
      content:
        "tlive — events package\n\nPricing\n· Single event: per-event licence, audience cap 500.\n· Conference tier: 3 days, multi-room, cap 2,000.\n\nRollout\nSeptember conference is the pilot: two rooms, Cantonese→English live captions, QR join for the audience relay.",
    },
    { id: "d3", kind: "doc", title: "OMP content calendar", subtitle: "me · Aug 25", badge: "SHEET", preview: "September posting schedule across IG, Threads, LinkedIn." },
    { id: "d4", kind: "file", title: "AI Meetup slides.pdf", subtitle: "me · Aug 22", badge: "PDF", preview: "18 slides — WebMCP talk draft." },
    { id: "d5", kind: "doc", title: "WebMCP challenge notes", subtitle: "me · Aug 29", badge: "DOC", preview: "Voice = intent, swipe = navigation, get_view_state = deixis." },
    { id: "d6", kind: "folder", title: "Receipts 2026", subtitle: "34 items · me", badge: "FOLDER" },
  ]);

  store.showStack("mail", "Mail", "email", [
    {
      id: "m1",
      kind: "email",
      title: "Re: tlive 報價",
      subtitle: "Kelvin Chan",
      badge: "09:41",
      preview: "Thanks Shek — the demo went well with our events team. Can you confirm the per-event price and the audience cap by Friday?",
      content:
        "Hi Shek,\n\nThe demo went well with our events team — the live Cantonese captions were the highlight.\n\nCould you confirm by Friday:\n1. Per-event price for a single-day conference\n2. Audience cap per room\n3. Whether the QR audience relay is included\n\nWe'd like to run it at the September conference.\n\nBest,\nKelvin",
    },
    { id: "m2", kind: "email", title: "Speaker slot confirmed (Sept 12)", subtitle: "AI Meetup HK", badge: "08:55", preview: "You are confirmed for the WebMCP demo slot. Slides due Sept 10." },
    { id: "m3", kind: "email", title: "Your August receipt", subtitle: "Publer", badge: "07:12", preview: "Receipt for your August subscription is attached." },
    { id: "m4", kind: "email", title: "Invoice #2081 — August", subtitle: "Cloudflare", badge: "06:40", preview: "Your Workers Paid plan invoice for August is ready." },
    { id: "m5", kind: "email", title: "3 new comments on your video", subtitle: "YouTube", badge: "Yesterday", preview: "阿石OMP — new comments on the Cantonese AI dub upload." },
    { id: "m6", kind: "email", title: "Payout of HK$4,120 initiated", subtitle: "Stripe", badge: "Yesterday", preview: "Your payout is on the way to your bank account ending 021." },
  ]);

  const fridays = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    const out: string[] = [];
    while (out.length < 3) {
      if (d.getDay() === 5) out.push(localDateISO(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  })();

  const seedOptions = () =>
    store.showStack("options", "Invitation designs", "option", [
      {
        id: "1",
        kind: "option",
        title: "Aurora",
        badge: "Option 1",
        design: {
          template: "aurora",
          eventTitle: "OMP Annual Gathering",
          dateLine: `Fri ${fridays[2].slice(8)}/${fridays[2].slice(5, 7)} · 7:00 PM`,
          venue: "The Hive · Wan Chai",
          tagline: "An evening of AI, friends & dim sum",
          accent: "#8b5cf6",
          logoText: "OMP",
        },
      },
      {
        id: "2",
        kind: "option",
        title: "Mono",
        badge: "Option 2",
        design: {
          template: "mono",
          eventTitle: "OMP Annual Gathering",
          dateLine: `Fri ${fridays[2].slice(8)}/${fridays[2].slice(5, 7)} · 7:00 PM`,
          venue: "The Hive · Wan Chai",
          tagline: "You are warmly invited",
          accent: "#c2410c",
          logoText: "OMP",
        },
      },
      {
        id: "3",
        kind: "option",
        title: "Neon",
        badge: "Option 3",
        design: {
          template: "neon",
          eventTitle: "OMP ANNUAL GATHERING",
          dateLine: `FRI ${fridays[2].slice(8)}/${fridays[2].slice(5, 7)} · 19:00`,
          venue: "THE HIVE · WAN CHAI",
          tagline: "one night · all signal",
          accent: "#22d3ee",
          logoText: "OMP",
        },
      },
    ]);

  const seedPeople = () =>
    store.showStack(
      "people",
      "Recipients",
      "person",
      [
        { name: "Kelvin Chan", detail: "kelvin@eventco.hk", tag: "VIP" },
        { name: "Michelle Wong", detail: "michelle.w@nexadigital.com" },
        { name: "Jason Lam", detail: "jason@lamandpartners.hk" },
        { name: "Priya Sharma", detail: "priya@fintechhub.asia", tag: "Speaker" },
        { name: "David Cheung", detail: "d.cheung@hkstartups.org" },
        { name: "Emily Ho", detail: "emily.ho@creativelabs.hk" },
        { name: "Marcus Ng", detail: "marcus@growthworks.io" },
        { name: "Sarah Liu", detail: "sarah.liu@mediapulse.cn", tag: "Press" },
        { name: "Tommy Yuen", detail: "tommy@yuenventures.hk" },
        { name: "Grace Tam", detail: "grace.tam@edufuture.hk" },
        { name: "Ben Kwok", detail: "ben@kwokdesign.com" },
        { name: "Fiona Lee", detail: "fiona@omp.asia", tag: "Team" },
      ].map((p, i) => ({ id: String(i), kind: "person" as const, title: p.name, subtitle: p.detail, badge: p.tag })),
      "grid",
    );

  if (demo === "drive") store.switchTo("drive");
  else if (demo === "calendar") store.switchTo("calendar");
  else if (demo === "month") {
    store.switchTo("calendar");
    store.setCalendarView("month");
  } else if (demo === "reader") store.openItem("m1");
  else if (demo === "slots")
    store.proposeSlots(
      [
        { date: fridays[0], time: "19:00", end: "22:00", label: "evening fully free" },
        { date: fridays[1], time: "19:30", end: "22:30", label: "free after 7pm" },
        { date: fridays[2], time: "19:00", end: "23:00", label: "whole evening free" },
      ],
      "month",
    );
  else if (demo === "options") seedOptions();
  else if (demo === "photo") {
    const art =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1a5e"/><stop offset=".55" stop-color="#a34a7d"/><stop offset="1" stop-color="#f2a65a"/></linearGradient></defs><rect width="800" height="1000" fill="url(#s)"/><circle cx="400" cy="560" r="150" fill="#ffd9a0" opacity=".9"/><rect y="640" width="800" height="360" fill="#1a1030" opacity=".85"/><path d="M0 660 Q200 600 400 650 T800 640 V1000 H0 Z" fill="#241543"/></svg>`,
      );
    store.showStack("options", "Invitation designs", "option", [
      {
        id: "1",
        kind: "option",
        title: "Sunset artwork",
        badge: "Option 1",
        design: {
          template: "aurora",
          eventTitle: "OMP Annual Gathering",
          dateLine: `Fri ${fridays[2].slice(8)}/${fridays[2].slice(5, 7)} · 7:00 PM`,
          venue: "The Hive · Wan Chai",
          tagline: "Artwork by your agent — text remains structured",
          accent: "#f2a65a",
          logoText: "OMP",
          imageUrl: art,
        },
      },
    ]);
    store.openItem("1");
  } else if (demo === "chosen") {
    seedOptions();
    store.selectOption(1);
  } else if (demo === "people") seedPeople();
  else if (demo === "done") store.showDone("Invitations sent", "12 people · Aurora card · via Gmail");
  else store.switchTo("mail");
}
