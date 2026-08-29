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
