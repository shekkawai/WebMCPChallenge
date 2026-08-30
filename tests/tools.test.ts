import { describe, expect, test } from "bun:test";
import { Store } from "../src/state/store";
import { wireTools } from "../src/tools";
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

describe("surface tool flow", () => {
  test("tracks view-scoped tools and does not fake an external calendar write", async () => {
    const store = new Store();
    const context = new FakeContext();
    const adapter = new WebMCPAdapter(context);
    wireTools(store, adapter);

    expect(context.tools.has("surface_set_calendar_view")).toBeFalse();
    await context.tools.get("surface_show_calendar").execute({ view: "month", events: [] });
    expect(context.tools.has("surface_set_calendar_view")).toBeTrue();
    expect(context.tools.has("calendar_confirm_slot")).toBeFalse();

    await context.tools.get("calendar_propose_slots").execute({
      view: "month",
      slots: [{ date: "2026-09-04", time: "19:00" }],
    });
    expect(context.tools.has("calendar_confirm_slot")).toBeTrue();

    expect(
      await context.tools.get("calendar_confirm_slot").execute({ slot: 99, title: "Annual event", created: true }),
    ).toEqual({ error: "no such proposed slot" });
    expect(store.state.view).toBe("calendar");

    expect(
      await context.tools.get("calendar_confirm_slot").execute({ slot: 1, title: "Annual event", created: false }),
    ).toEqual({
      selected: { date: "2026-09-04", time: "19:00", title: "Annual event" },
      needsCalendarWrite: true,
    });
    expect(store.state.done?.message).toBe("Slot selected");
    expect(context.tools.has("calendar_confirm_slot")).toBeFalse();
  });

  test("registers and removes reader tools as the page opens and closes an item", async () => {
    const store = new Store();
    const context = new FakeContext();
    const adapter = new WebMCPAdapter(context);
    wireTools(store, adapter);

    await context.tools.get("surface_show_emails").execute({
      emails: [{ id: "mail-1", from: "sender@example.com", subject: "Hello", body: "Private body" }],
    });
    expect(context.tools.has("surface_open_item")).toBeTrue();
    expect(context.tools.has("surface_close_item")).toBeFalse();

    await context.tools.get("surface_open_item").execute({ id: "mail-1" });
    expect(context.tools.has("surface_close_item")).toBeTrue();

    await context.tools.get("surface_close_item").execute({});
    expect(context.tools.has("surface_close_item")).toBeFalse();
    expect(store.state.view).toBe("stack");
  });

  test("opened images are identifiable in view state after the user swipes", async () => {
    const store = new Store();
    const context = new FakeContext();
    wireTools(store, new WebMCPAdapter(context));

    const open = context.tools.get("surface_open_image");
    const first = await open.execute({ url: "https://example.com/a.png", title: "Sunset v1" });
    const second = await open.execute({ url: "https://example.com/b.png", title: "Sunset v2" });
    const third = await open.execute({ url: "https://example.com/c.png", title: "Sunset v3" });
    expect(first.id).toBeTruthy();
    expect(second.position).toBe(2);
    expect(third.images).toBe(3);

    store.closeItem();
    store.swipe(-1);
    const state = await context.tools.get("surface_get_view_state").execute({});
    expect(state.stack.position).toBe("2 of 3");
    expect(state.stack.focusedItem.id).toBe(second.id);
    expect(state.stack.focusedItem.title).toBe("Sunset v2");
    expect(state.stack.focusedItem.hasImage).toBeTrue();
    expect(JSON.stringify(state)).not.toContain("example.com");
  });
});

describe("surface_dismiss", () => {
  test("registers only while surfaces exist and removes dock tabs", async () => {
    const store = new Store();
    const context = new FakeContext();
    const adapter = new WebMCPAdapter(context);
    wireTools(store, adapter);

    expect(context.tools.has("surface_dismiss")).toBeFalse();
    await context.tools.get("surface_show_emails").execute({
      emails: [{ id: "mail-1", from: "a@example.com", subject: "Hello", body: "Body" }],
    });
    await context.tools.get("surface_show_files").execute({ files: [{ id: "d1", name: "Doc", type: "doc" }] });
    expect(context.tools.has("surface_dismiss")).toBeTrue();

    expect(await context.tools.get("surface_dismiss").execute({ id: "nope" })).toEqual({
      error: "surface 'nope' does not exist",
    });

    const afterMail = await context.tools.get("surface_dismiss").execute({ id: "mail" });
    expect(afterMail.surfaces.map((s: any) => s.id)).toEqual(["drive"]);
    expect(store.state.view).toBe("stack");

    await context.tools.get("surface_dismiss").execute({ id: "drive" });
    expect(store.state.view).toBe("idle");
    expect(context.tools.has("surface_dismiss")).toBeFalse();
  });
});

describe("map tools", () => {
  test("coordinates make surface_present render a map and register map_show_route", async () => {
    const store = new Store();
    const context = new FakeContext();
    const adapter = new WebMCPAdapter(context);
    wireTools(store, adapter);

    expect(context.tools.has("map_set_location")).toBeTrue();
    expect(context.tools.has("map_show_route")).toBeFalse();

    const receipt = await context.tools.get("surface_present").execute({
      title: "Cafes near you",
      purpose: "choose",
      items: [
        { id: "a", title: "Halfway Coffee", lat: 37.7787, lng: -122.3937 },
        { id: "b", title: "Amber", lat: 37.781, lng: -122.39 },
      ],
    });
    expect(receipt.receipt.renderedAs).toBe("map-pins");
    expect(context.tools.has("map_show_route")).toBeTrue();

    expect(await context.tools.get("map_show_route").execute({})).toEqual({
      error: "no user position — call map_set_location first",
    });
    expect(await context.tools.get("map_set_location").execute({ lat: 200, lng: 0 })).toEqual({
      error: "lat/lng must be valid WGS84 coordinates",
    });
  });
});
