import { describe, expect, test } from "bun:test";
import { isOpenPalm, type Point } from "../src/gesture/pose";
import { PalmSwipeDetector } from "../src/gesture/swipe";

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

  test("maps physical right movement to next", () => {
    const detector = new PalmSwipeDetector();
    const palm = pose("open");
    expect(detector.push(shifted(palm, 0.65), 0)).toBeNull();
    expect(detector.push(shifted(palm, 0.56), 60)).toBeNull();
    expect(detector.push(shifted(palm, 0.47), 120)).toBe(1);
  });

  test("maps physical left movement to previous", () => {
    const detector = new PalmSwipeDetector();
    const palm = pose("open");
    expect(detector.push(shifted(palm, 0.35), 0)).toBeNull();
    expect(detector.push(shifted(palm, 0.44), 60)).toBeNull();
    expect(detector.push(shifted(palm, 0.53), 120)).toBe(-1);
  });

  test("does not fire for a fist or slow drift", () => {
    const detector = new PalmSwipeDetector();
    const fist = pose("fist");
    expect(detector.push(shifted(fist, 0.65), 0)).toBeNull();
    expect(detector.push(shifted(fist, 0.45), 120)).toBeNull();

    const palm = pose("open");
    expect(detector.push(shifted(palm, 0.6), 1000)).toBeNull();
    expect(detector.push(shifted(palm, 0.55), 1200)).toBeNull();
    expect(detector.push(shifted(palm, 0.5), 1400)).toBeNull();
  });
});
