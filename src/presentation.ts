export const PRESENTATION_PURPOSES = ["glance", "browse", "inspect", "compare", "choose", "triage"] as const;
export type PresentationPurpose = (typeof PRESENTATION_PURPOSES)[number];

export const DATA_KINDS = [
  "collection",
  "document",
  "schedule",
  "timeline",
  "metrics",
  "media",
  "people",
  "hierarchy",
  "location",
  "entity",
] as const;
export type DataKind = (typeof DATA_KINDS)[number];

export const INTERACTIONS = ["view", "navigate", "single-select", "multi-select", "edit", "confirm"] as const;
export type PresentationInteraction = (typeof INTERACTIONS)[number];

export const LAYOUT_HINTS = ["cards", "grid", "list", "table"] as const;
export type LayoutHint = (typeof LAYOUT_HINTS)[number];

export type PresentationContext = "desktop" | "glasses";
export type StackLayout = "deck" | "grid" | "comparison" | "list" | "summary" | "map";

export interface PresentationMeta {
  purpose: PresentationPurpose;
  requestedPurpose?: string;
  dataKind?: DataKind;
  interaction: PresentationInteraction;
  hint?: LayoutHint;
}

export interface RenderDecision {
  layout: StackLayout;
  renderedAs: string;
  interaction: PresentationInteraction;
}

const PURPOSE_SET = new Set<string>(PRESENTATION_PURPOSES);
const DATA_KIND_SET = new Set<string>(DATA_KINDS);
const INTERACTION_SET = new Set<string>(INTERACTIONS);
const LAYOUT_SET = new Set<string>(LAYOUT_HINTS);

export function normalizePurpose(value: unknown): PresentationPurpose {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return PURPOSE_SET.has(normalized) ? (normalized as PresentationPurpose) : "browse";
}

export function normalizeDataKind(value: unknown): DataKind | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return DATA_KIND_SET.has(normalized) ? (normalized as DataKind) : undefined;
}

export function normalizeInteraction(value: unknown): PresentationInteraction | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return INTERACTION_SET.has(normalized) ? (normalized as PresentationInteraction) : undefined;
}

export function normalizeLayoutHint(value: unknown): LayoutHint | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return LAYOUT_SET.has(normalized) ? (normalized as LayoutHint) : undefined;
}

export function defaultInteraction(purpose: PresentationPurpose): PresentationInteraction {
  if (purpose === "choose") return "single-select";
  if (purpose === "triage") return "multi-select";
  if (purpose === "browse") return "navigate";
  return "view";
}

export function resolveInteraction(
  purpose: PresentationPurpose,
  requested?: PresentationInteraction,
): PresentationInteraction {
  const allowed: Record<PresentationPurpose, PresentationInteraction[]> = {
    glance: ["view"],
    browse: ["navigate", "view"],
    inspect: ["view"],
    compare: ["view", "navigate"],
    choose: ["single-select"],
    triage: ["multi-select"],
  };
  return requested && allowed[purpose].includes(requested) ? requested : defaultInteraction(purpose);
}

export function decidePresentation(
  purpose: PresentationPurpose,
  context: PresentationContext,
  hint?: LayoutHint,
  hasGeo = false,
): RenderDecision {
  const interaction = defaultInteraction(purpose);
  // Location shape: items carrying coordinates render as pins on a live map.
  // This is page-side vocabulary — the agent never asked for a map, it sent
  // location-shaped data. Inspect (read one document) and triage (bulk
  // keep/dismiss) still use their focused layouts.
  if (hasGeo && purpose !== "inspect" && purpose !== "triage") {
    return { layout: "map", renderedAs: context === "glasses" ? "map-lens" : "map-pins", interaction };
  }
  if (purpose === "compare") {
    return { layout: "comparison", renderedAs: context === "glasses" ? "comparison-cards" : "comparison-table", interaction };
  }
  if (purpose === "inspect") return { layout: "deck", renderedAs: "document-reader", interaction };
  if (purpose === "choose") {
    return { layout: "deck", renderedAs: context === "glasses" ? "single-option-card" : "option-deck", interaction };
  }
  if (purpose === "triage") {
    return { layout: "list", renderedAs: context === "glasses" ? "triage-card" : "triage-list", interaction };
  }
  if (purpose === "glance") {
    return { layout: "summary", renderedAs: context === "glasses" ? "focused-summary" : "summary-grid", interaction };
  }
  if (context === "desktop" && hint === "grid") return { layout: "summary", renderedAs: "card-grid", interaction };
  if (context === "desktop" && hint === "list") return { layout: "list", renderedAs: "collection-list", interaction };
  return { layout: "deck", renderedAs: "swipe-deck", interaction };
}

export function presentationContext(): PresentationContext {
  return typeof document !== "undefined" && document.body?.classList.contains("glasses-on") ? "glasses" : "desktop";
}

export function presentationDescription(context: PresentationContext): string {
  const contextNote =
    context === "glasses"
      ? "Current context: glasses. The page will use focused, swipeable layouts and keep comparisons concise."
      : "Current context: desktop. The page can use wider tables, lists, grids, and card decks.";
  return (
    "Present structured data on this Smart Responsive surface. Choose only the user's purpose; the page chooses the UI for the current context. " +
    "Purposes: glance = key facts in seconds (next event); browse = explore a collection (files or news); " +
    "inspect = examine one item deeply (read an email); compare = weigh multiple items by shared facts (venues by price); " +
    "choose = pick one option to act on (invitation design); triage = prioritize, keep, dismiss, or organize many items (inbox review). " +
    "dataKind, interaction, and layout hints are optional. Hints are advisory and may be overridden for readability. " +
    contextNote
  );
}

export function renderReceipt(
  id: string,
  purpose: PresentationPurpose,
  requestedPurpose: unknown,
  context: PresentationContext,
  decision: RenderDecision,
  showing: number,
  total: number,
) {
  const requested = typeof requestedPurpose === "string" ? requestedPurpose.trim().toLowerCase() : "";
  const fallback = !PURPOSE_SET.has(requested);
  return {
    surface: id,
    purpose,
    context,
    renderedAs: decision.renderedAs,
    interaction: decision.interaction,
    showing,
    total,
    ...(fallback ? { fallback: "browse" } : {}),
  };
}
