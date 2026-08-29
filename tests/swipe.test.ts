import { describe, expect, test } from "bun:test";
import { isOpenPalm, type Point } from "../src/gesture/pose";
import { PalmSwipeDetector } from "../src/gesture/swipe";
import { Store } from "../src/state/store";
import {
  actionForToken,
  activateFocused,
  describeInputToken,
  keyInputToken,
  pointerInputToken,
  readerScrollStep,
  WheelInputDetector,
  wheelInputToken,
} from "../src/input/controller";

function pose(kind: "open" | "fist", wristY = 0.75): Point[] {
  const dy = wristY - 0.75;
  const points: Record<number, [number, number]> = {
    0: [0.5, 0.75], 1: [0.42, 0.72], 2: [0.38, 0.69], 3: [0.35, 0.66], 4: [0.33, 0.63],
    5: [0.45, 0.63], 6: [0.45, 0.56], 7: [0.45, 0.51], 8: [0.45, 0.47],
    9: [0.5, 0.62], 10: [0.5, 0.55], 11: [0.5, 0.49], 12: [0.5, 0.44],
    13: [0.55, 0.63], 14: [0.55, 0.56], 15: [0.55, 0.51], 16: [0.55, 0.47],
    17: [0.59, 0.64], 18: [0.59, 0.58], 19: [0.59, 0.54], 20: [0.59, 0.51],
  };
  if (kind === "fist") {
    for (const [pip, dip, tip, x] of [
      [6, 7, 8, 0.45], [10, 11, 12, 0.5], [14, 15, 16, 0.55], [18, 19, 20, 0.59],
    ] as const) {
      points[pip] = [x, 0.615];
      points[dip] = [x, 0.655];
      points[tip] = [x, 0.675];
    }
    points[4] = [0.47, 0.655];
  }
  return Array.from({ length: 21 }, (_, i) => ({ x: points[i][0], y: points[i][1] + dy, z: 0 }));
}

function shifted(points: Point[], rawX: number): Point[] {
  const offset = rawX - points[0].x;
  return points.map((point) => ({ ...point, x: point.x + offset }));
}

describe("palm swipe", () => {
  test("recognizes a deliberate palm at natural laptop-camera heights", () => {
    for (const wristY of [0.9, 0.75, 0.5, 0.25]) {
      expect(isOpenPalm(pose("open", wristY), null, false)).toBe(true);
    }
    expect(isOpenPalm(pose("fist"), null, false)).toBe(false);
  });

  test("maps physical right movement to previous like a touch carousel", () => {
    const detector = new PalmSwipeDetector();
    const palm = pose("open");
    expect(detector.push(shifted(palm, 0.65), 0)).toBeNull();
    expect(detector.push(shifted(palm, 0.56), 60)).toBeNull();
    expect(detector.progress).toBeLessThan(0);
    expect(detector.progress).toBeGreaterThan(-1);
    expect(detector.push(shifted(palm, 0.47), 120)).toBe(-1);
    expect(detector.progress).toBe(-1);
  });

  test("maps physical left movement to next like a touch carousel", () => {
    const detector = new PalmSwipeDetector();
    const palm = pose("open");
    expect(detector.push(shifted(palm, 0.35), 0)).toBeNull();
    expect(detector.push(shifted(palm, 0.44), 60)).toBeNull();
    expect(detector.progress).toBeGreaterThan(0);
    expect(detector.push(shifted(palm, 0.53), 120)).toBe(1);
    expect(detector.progress).toBe(1);
  });

  test("does not fire for a fist or slow drift", () => {
    const detector = new PalmSwipeDetector();
    const fist = pose("fist");
    expect(detector.push(shifted(fist, 0.65), 0)).toBeNull();
    expect(detector.push(shifted(fist, 0.45), 120)).toBeNull();
    expect(detector.progress).toBe(0);

    const palm = pose("open");
    expect(detector.push(shifted(palm, 0.6), 1000)).toBeNull();
    expect(detector.push(shifted(palm, 0.55), 1200)).toBeNull();
    expect(detector.push(shifted(palm, 0.5), 1400)).toBeNull();
  });
});

describe("ring / clicker input", () => {
  test("learns exact ring signals instead of claiming a fixed universal map", () => {
    const bindings = { previous: keyInputToken("PageUp")!, next: keyInputToken("PageDown")!, select: keyInputToken("Enter")! };
    expect(actionForToken(bindings, keyInputToken("PageUp"))).toBe("previous");
    expect(actionForToken(bindings, keyInputToken("PageDown"))).toBe("next");
    expect(actionForToken(bindings, keyInputToken("Enter"))).toBe("select");
    expect(actionForToken(bindings, keyInputToken("ArrowDown"))).toBeNull();
    expect(keyInputToken("Shift")).toBeNull();
  });

  test("learns keyboard, mouse, and wheel signals with readable labels", () => {
    expect(pointerInputToken(0)).toBe("pointer:0");
    expect(wheelInputToken(0, 20)).toBe("wheel:y:+");
    expect(wheelInputToken(-20, 5)).toBe("wheel:x:-");
    expect(describeInputToken("key: ")).toBe("Space");
    expect(describeInputToken("pointer:0")).toBe("Mouse click");
    expect(describeInputToken("wheel:y:-")).toBe("Wheel up");
  });

  test("wheel setup waits for a deliberate flick and keeps direction distinct", () => {
    const detector = new WheelInputDetector();
    expect(detector.push(0, 60, 0)).toBeNull();
    expect(detector.push(0, 80, 16)).toBe("wheel:y:+");
    expect(detector.push(0, 200, 100)).toBeNull();
    expect(detector.push(0, -200, 700)).toBe("wheel:y:-");
  });

  test("direction change resets the wheel accumulator", () => {
    const detector = new WheelInputDetector();
    expect(detector.push(100, 0, 0)).toBeNull();
    expect(detector.push(-100, 0, 16)).toBeNull();
    expect(detector.push(-30, 0, 32)).toBe("wheel:x:-");
  });

  test("local select opens cards, selects designs, and never confirms calendar writes", () => {
    const store = new Store();
    store.showStack("mail", "Mail", "email", [{ id: "m1", title: "Message", content: "Body" }]);
    expect(activateFocused(store)).toBe("opened");
    expect(store.state.view).toBe("reader");
    expect(activateFocused(store)).toBe("closed");
    expect(store.state.view).toBe("stack");

    store.showStack("options", "Options", "option", [{ id: "1", kind: "option", title: "One" }]);
    expect(activateFocused(store)).toBe("selected");
    expect(store.activeStack()?.items[0].selected).toBe(true);

    store.proposeSlots([{ date: "2026-09-04", time: "19:00" }]);
    expect(activateFocused(store)).toBe("confirmation-required");
    expect(store.state.proposals).toHaveLength(1);
    expect(store.state.done).toBeNull();
  });

  test("vertical scroll keys map to reader scroll steps, others do not", () => {
    expect(readerScrollStep("ArrowDown", 600)).toBe(90);
    expect(readerScrollStep("ArrowUp", 600)).toBe(-90);
    expect(readerScrollStep("PageDown", 600)).toBe(480);
    expect(readerScrollStep("PageUp", 600)).toBe(-480);
    expect(readerScrollStep("ArrowLeft", 600)).toBeNull();
    expect(readerScrollStep("Enter", 600)).toBeNull();
  });
});
