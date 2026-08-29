import { describe, expect, test } from "bun:test";
import {
  decidePresentation,
  normalizePurpose,
  presentationDescription,
  renderReceipt,
  type PresentationContext,
  type PresentationPurpose,
} from "../src/presentation";
import { Store } from "../src/state/store";
import { createSurfacePresentTool, wireTools } from "../src/tools";
import { WebMCPAdapter, type ModelContext } from "../src/webmcp/adapter";

class FakeContext implements ModelContext {
  tools = new Map<string, any>();

  registerTool(tool: any, options?: { signal?: AbortSignal }): Promise<void> {
    if (this.tools.has(tool.name)) return Promise.reject(new DOMException("duplicate", "InvalidStateError"));
    this.tools.set(tool.name, tool);
    options?.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
    return Promise.resolve();
  }
}

describe("intent-based presentation contract", () => {
  const expected: Record<PresentationPurpose, Record<PresentationContext, string>> = {
    glance: { desktop: "summary-grid", glasses: "focused-summary" },
    browse: { desktop: "swipe-deck", glasses: "swipe-deck" },
    inspect: { desktop: "document-reader", glasses: "document-reader" },
    compare: { desktop: "comparison-table", glasses: "comparison-cards" },
    choose: { desktop: "option-deck", glasses: "single-option-card" },
    triage: { desktop: "triage-list", glasses: "triage-card" },
  };

  for (const purpose of Object.keys(expected) as PresentationPurpose[]) {
    for (const context of ["desktop", "glasses"] as const) {
      test(`${purpose} resolves predictably for ${context}`, () => {
        expect(decidePresentation(purpose, context).renderedAs).toBe(expected[purpose][context]);
      });
    }
  }

  test("unknown purposes degrade to browse and report the fallback", () => {
    const purpose = normalizePurpose("dashboard-magic");
    const decision = decidePresentation(purpose, "desktop");
    expect(purpose).toBe("browse");
    expect(renderReceipt("x", purpose, "dashboard-magic", "desktop", decision, 2, 2)).toEqual({
      surface: "x",
      purpose: "browse",
      context: "desktop",
      renderedAs: "swipe-deck",
      interaction: "navigate",
      showing: 2,
      total: 2,
      fallback: "browse",
    });
  });

  test("purpose parsing tolerates model casing and whitespace", () => {
    expect(normalizePurpose("  Compare ")).toBe("compare");
  });

  test("tool descriptions teach the vocabulary and current context in-band", () => {
    const desktop = presentationDescription("desktop");
    const glasses = presentationDescription("glasses");
    for (const word of ["glance", "browse", "inspect", "compare", "choose", "triage"]) {
      expect(desktop).toContain(word);
    }
    expect(desktop).toContain("Current context: desktop");
    expect(glasses).toContain("Current context: glasses");
    expect(glasses).toContain("swipeable layouts");
  });

  test("surface_present renders comparable facts and returns a desktop receipt", async () => {
    const store = new Store();
    const tool = createSurfacePresentTool(store, () => "desktop");
    const result = await tool.execute({
      id: "venues",
      title: "Venues",
      purpose: "compare",
      dataKind: "location",
      hint: { layout: "table" },
      items: [
        { id: "a", title: "Harbour Room", facts: [{ label: "Price", value: "HK$18,000" }] },
        { id: "b", title: "The Hive", facts: [{ label: "Price", value: "HK$14,500" }] },
      ],
    });

    expect(store.activeStack()?.layout).toBe("comparison");
    expect(store.activeStack()?.purpose).toBe("compare");
    expect(store.activeStack()?.items[1]?.facts).toEqual([{ label: "Price", value: "HK$14,500" }]);
    expect(result).toEqual({
      receipt: {
        surface: "venues",
        purpose: "compare",
        context: "desktop",
        renderedAs: "comparison-table",
        interaction: "view",
        showing: 2,
        total: 2,
      },
    });
  });

  test("the same compare call returns a glasses receipt without changing its data", async () => {
    const store = new Store();
    const tool = createSurfacePresentTool(store, () => "glasses");
    const result = await tool.execute({
      title: "Venues",
      purpose: "compare",
      items: [
        { title: "A", facts: [{ label: "Price", value: 100 }] },
        { title: "B", facts: [{ label: "Price", value: 120 }] },
      ],
    });

    expect(store.activeStack()?.items).toHaveLength(2);
    expect(result).toEqual({
      receipt: {
        surface: "presentation",
        purpose: "compare",
        context: "glasses",
        renderedAs: "comparison-cards",
        interaction: "view",
        showing: 1,
        total: 2,
      },
    });
  });

  test("choose presentations dynamically expose a safe page-local selection tool", async () => {
    const store = new Store();
    const context = new FakeContext();
    wireTools(store, new WebMCPAdapter(context), () => "desktop");

    await context.tools.get("surface_present").execute({
      title: "Invitation styles",
      purpose: "choose",
      items: [{ id: "one", title: "Aurora" }, { id: "two", title: "Mono" }],
    });
    expect(context.tools.has("surface_select_item")).toBeTrue();
    expect(context.tools.has("option_select")).toBeFalse();

    expect(await context.tools.get("surface_select_item").execute({ item: "two" })).toEqual({
      selected: { id: "two", title: "Mono" },
    });
    expect(store.activeStack()?.items[1]?.selected).toBeTrue();
  });

  test("triage presentations expose reversible multi-select review state", async () => {
    const store = new Store();
    const context = new FakeContext();
    wireTools(store, new WebMCPAdapter(context), () => "desktop");

    await context.tools.get("surface_present").execute({
      title: "Inbox review",
      purpose: "triage",
      interaction: "edit",
      items: [{ id: "urgent", title: "Client reply" }, { id: "receipt", title: "Receipt" }],
    });
    expect(store.activeStack()?.interaction).toBe("multi-select");
    expect(context.tools.has("surface_toggle_item")).toBeTrue();

    expect(await context.tools.get("surface_toggle_item").execute({ item: "urgent", selected: true })).toEqual({
      item: { id: "urgent", title: "Client reply", selected: true },
    });
    expect(await context.tools.get("surface_toggle_item").execute({ item: "urgent" })).toEqual({
      item: { id: "urgent", title: "Client reply", selected: false },
    });
  });
});
