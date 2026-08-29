import { Store } from "./state/store";
import { WebMCPAdapter } from "./webmcp/adapter";
import { wireTools } from "./tools";
import { renderApp } from "./views/renderer";
import { attachKeyboardSwipe } from "./gesture/swipe";

const store = new Store();
const mcp = new WebMCPAdapter();

renderApp(document.getElementById("app")!, store, mcp.available);
wireTools(store, mcp);
attachKeyboardSwipe(store);

declare global {
  interface Window {
    __briefing: { store: Store; mcp: WebMCPAdapter };
  }
}
window.__briefing = { store, mcp };

// ?demo=1 seeds fake data so the surface is testable without an agent attached.
if (new URLSearchParams(location.search).has("demo")) {
  store.showEmails([
    {
      id: "1",
      from: "Kelvin Chan",
      subject: "Re: tlive 報價",
      preview: "Thanks Shek — can you confirm the per-event price by Friday?",
    },
    {
      id: "2",
      from: "AI Meetup HK",
      subject: "Speaker slot confirmed (Sept 12)",
      preview: "You are confirmed for the WebMCP demo slot. Slides due Sept 10.",
    },
    {
      id: "3",
      from: "Publer",
      subject: "Your August receipt",
      preview: "Receipt for your August subscription is attached.",
    },
  ]);
}
