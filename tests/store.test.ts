import { describe, expect, test } from "bun:test";
import { Store } from "../src/state/store";

describe("Store", () => {
  test("rejects an unknown proposed slot instead of choosing slot one", () => {
    const store = new Store();
    store.proposeSlots([
      { date: "2026-09-04", time: "19:00" },
      { date: "2026-09-11", time: "19:30" },
    ]);

    expect(store.confirmSlot(99, "Annual event", true)).toBeNull();
    expect(store.state.proposals).toHaveLength(2);
    expect(store.state.events).toHaveLength(0);
    expect(store.state.view).toBe("calendar");
  });

  test("does not open the focused card when a requested id is missing", () => {
    const store = new Store();
    store.showStack("mail", "Mail", "email", [{ id: "one", title: "First" }]);

    expect(store.openItem("missing")).toBeNull();
    expect(store.state.view).toBe("stack");
  });

  test("does not select the focused option when a requested name is missing", () => {
    const store = new Store();
    store.showStack("options", "Options", "option", [
      { id: "1", title: "Aurora" },
      { id: "2", title: "Mono" },
    ]);

    expect(store.selectOption("Missing design")).toBeNull();
    expect(store.activeStack()?.items.some((item) => item.selected)).toBeFalse();
  });

  test("does not expose full content or image data through view state", () => {
    const store = new Store();
    store.showStack("mail", "Mail", "email", [
      {
        id: "one",
        title: "Private mail",
        content: "TOP SECRET BODY",
        imageUrl: "data:image/png;base64,SECRET_IMAGE_BYTES",
      },
    ]);

    const state = JSON.stringify(store.getViewState());
    expect(state).not.toContain("TOP SECRET BODY");
    expect(state).not.toContain("SECRET_IMAGE_BYTES");
    expect(state).toContain('"hasContent":true');
    expect(state).toContain('"hasImage":true');
  });

  test("moves month view from an end-of-month anchor to the next month", () => {
    const store = new Store();
    store.showCalendar([], "month", "2027-01-31");
    store.swipe(1);
    expect(store.state.anchor).toBe("2027-02-01");
  });

  test("reports empty stacks without a false one-of-zero position", () => {
    const store = new Store();
    store.showStack("empty", "Empty", "generic", []);
    expect(store.getViewState().stack?.position).toBe("0 of 0");
  });

  test("reports an invalid surface switch", () => {
    const store = new Store();
    expect(store.switchTo("missing")).toBeFalse();
    expect(store.state.view).toBe("idle");
  });

  test("boundary swipes do not emit a fake navigation state", () => {
    const store = new Store();
    store.showStack("one", "One", "generic", [{ id: "only", title: "Only item" }]);
    let emissions = 0;
    store.subscribe(() => emissions++);
    expect(store.swipe(-1)).toBeFalse();
    expect(store.swipe(1)).toBeFalse();
    expect(emissions).toBe(1);
  });
});

describe("Dock D-pad focus", () => {
  const seeded = () => {
    const store = new Store();
    store.showCalendar([], "week");
    store.showStack("mail", "Mail", "email", [
      { id: "m1", title: "First" },
      { id: "m2", title: "Second" },
    ]);
    store.showStack("drive", "Files", "file", [{ id: "d1", title: "Doc" }]);
    return store;
  };

  test("down focuses the active tab, swipes move the highlight, select switches", () => {
    const store = seeded();
    expect(store.focusDock()).toBeTrue();
    expect(store.state.dockFocus).toBe(2);
    expect(store.swipe(-1)).toBeTrue();
    expect(store.state.dockFocus).toBe(1);
    expect(store.state.activeStackId).toBe("drive");
    expect(store.activateDockFocus()).toBeTrue();
    expect(store.state.view).toBe("stack");
    expect(store.state.activeStackId).toBe("mail");
    expect(store.state.dockFocus).toBeNull();
  });

  test("highlight clamps at both ends and up returns focus to the stage", () => {
    const store = seeded();
    store.focusDock();
    expect(store.swipe(1)).toBeFalse();
    expect(store.state.dockFocus).toBe(2);
    store.swipe(-1);
    store.swipe(-1);
    expect(store.state.dockFocus).toBe(0);
    expect(store.swipe(-1)).toBeFalse();
    expect(store.blurDock()).toBeTrue();
    expect(store.state.dockFocus).toBeNull();
  });

  test("an agent-driven surface change clears the dock highlight", () => {
    const store = seeded();
    store.focusDock();
    store.showStack("people", "People", "person", [{ id: "p1", title: "Kelvin" }]);
    expect(store.state.dockFocus).toBeNull();
  });

  test("focusDock does nothing with an empty dock", () => {
    const store = new Store();
    expect(store.focusDock()).toBeFalse();
    expect(store.state.dockFocus).toBeNull();
  });

  test("view state reports the highlighted dock tab only while picking", () => {
    const store = seeded();
    expect(store.getViewState().dockHighlight).toBeUndefined();
    store.focusDock();
    store.swipe(-1);
    store.swipe(-1);
    expect(store.getViewState().dockHighlight).toBe("calendar");
  });
});

describe("Dismissing surfaces", () => {
  test("dismissing the active stack falls back to the neighbouring stack", () => {
    const store = new Store();
    store.showStack("mail", "Mail", "email", [{ id: "m1", title: "First" }]);
    store.showStack("options", "Options", "option", [{ id: "1", title: "Aurora" }]);
    expect(store.dismissSurface("options")).toBeTrue();
    expect(store.state.stacks.map((s) => s.id)).toEqual(["mail"]);
    expect(store.state.activeStackId).toBe("mail");
    expect(store.state.view).toBe("stack");
  });

  test("dismissing the last stack falls back to the calendar, then idle", () => {
    const store = new Store();
    store.showCalendar([{ date: "2026-09-04", title: "Event" }], "week");
    store.showStack("mail", "Mail", "email", [{ id: "m1", title: "First" }]);
    expect(store.dismissSurface("mail")).toBeTrue();
    expect(store.state.view).toBe("calendar");
    expect(store.dismissSurface("calendar")).toBeTrue();
    expect(store.state.view).toBe("idle");
    expect(store.state.hasCalendar).toBeFalse();
  });

  test("dismissing the calendar clears proposals but keeps events for a re-show", () => {
    const store = new Store();
    store.showCalendar([{ date: "2026-09-04", title: "Event" }], "week");
    store.proposeSlots([{ date: "2026-09-11", time: "19:00" }]);
    expect(store.dismissSurface("calendar")).toBeTrue();
    expect(store.state.proposals).toHaveLength(0);
    expect(store.state.events).toHaveLength(1);
    store.showCalendar(store.state.events, "week");
    expect(store.state.hasCalendar).toBeTrue();
  });

  test("dismissing a background stack leaves the current view alone", () => {
    const store = new Store();
    store.showStack("mail", "Mail", "email", [{ id: "m1", title: "First" }]);
    store.showStack("drive", "Files", "file", [{ id: "d1", title: "Doc" }]);
    store.openItem("d1");
    expect(store.dismissSurface("mail")).toBeTrue();
    expect(store.state.view).toBe("reader");
    expect(store.state.activeStackId).toBe("drive");
  });

  test("unknown surface ids are rejected", () => {
    const store = new Store();
    expect(store.dismissSurface("mail")).toBeFalse();
    expect(store.dismissSurface("calendar")).toBeFalse();
  });
});

describe("Map state", () => {
  test("user location and route summaries reach view state without route geometry", () => {
    const store = new Store();
    store.showStack("cafes", "Cafes", "generic", [{ id: "a", title: "Halfway", lat: 37.7787, lng: -122.3937 }]);
    store.setUserLocation(37.7765, -122.3947, "SF Caltrain");
    store.setRoute({ toId: "a", points: [[37.7765, -122.3947], [37.7787, -122.3937]], distanceM: 619, durationMin: 8, streets: ["Townsend Street"], fallback: false });
    const view = store.getViewState() as any;
    expect(view.userLocation.label).toBe("SF Caltrain");
    expect(view.route).toEqual({ to: "a", distanceM: 619, durationMin: 8, fallback: false });
    expect(JSON.stringify(view)).not.toContain("points");
  });

  test("re-rendering a stack clears a stale route; focusItem moves focus by id", () => {
    const store = new Store();
    store.showStack("cafes", "Cafes", "generic", [
      { id: "a", title: "Halfway", lat: 37.7787, lng: -122.3937 },
      { id: "b", title: "Amber", lat: 37.781, lng: -122.39 },
    ]);
    store.setRoute({ toId: "a", points: [], distanceM: 1, durationMin: 1, streets: [], fallback: true });
    expect(store.focusItem("b")).toBeTrue();
    expect(store.activeStack()?.focusIndex).toBe(1);
    store.showStack("cafes", "Cafes", "generic", [{ id: "a", title: "Halfway", lat: 37.7787, lng: -122.3937 }]);
    expect(store.state.route).toBeNull();
  });
});
