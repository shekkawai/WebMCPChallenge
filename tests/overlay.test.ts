import { describe, expect, test } from "bun:test";
import { drawHands, HAND_CONNECTIONS, IDLE_COLOR, PALM_COLOR, type OverlayContext } from "../src/gesture/overlay";
import type { Point } from "../src/gesture/pose";

function stubContext() {
  const calls = { clearRect: 0, stroke: 0, fill: 0 };
  const strokeColors: string[] = [];
  const points: { x: number; y: number }[] = [];
  const ctx: OverlayContext = {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    clearRect: () => void calls.clearRect++,
    beginPath: () => {},
    moveTo: (x, y) => void points.push({ x, y }),
    lineTo: (x, y) => void points.push({ x, y }),
    stroke: () => {
      calls.stroke++;
      strokeColors.push(String(ctx.strokeStyle));
    },
    arc: () => {},
    fill: () => void calls.fill++,
  };
  return { ctx, calls, strokeColors, points };
}

const hand = (x = 0.5): Point[] => Array.from({ length: 21 }, (_, i) => ({ x, y: i / 21, z: 0 }));

describe("skeleton overlay", () => {
  test("draws every bone and joint of a tracked hand", () => {
    const { ctx, calls } = stubContext();
    drawHands(ctx, 640, 360, [{ landmarks: hand(), palm: false }]);
    expect(calls.clearRect).toBe(1);
    expect(calls.stroke).toBe(HAND_CONNECTIONS.length);
    expect(calls.fill).toBe(21);
  });

  test("palm state decides the skeleton color", () => {
    const { ctx, strokeColors } = stubContext();
    drawHands(ctx, 640, 360, [
      { landmarks: hand(0.3), palm: true },
      { landmarks: hand(0.7), palm: false },
    ]);
    expect(strokeColors.slice(0, HAND_CONNECTIONS.length).every((c) => c === PALM_COLOR)).toBe(true);
    expect(strokeColors.slice(HAND_CONNECTIONS.length).every((c) => c === IDLE_COLOR)).toBe(true);
  });

  test("maps normalized landmarks into pixel space", () => {
    const { ctx, points } = stubContext();
    drawHands(ctx, 640, 360, [{ landmarks: hand(0.5), palm: true }]);
    expect(points.every((p) => p.x === 320 && p.y >= 0 && p.y <= 360)).toBe(true);
  });

  test("clears but draws nothing without hands or with partial landmarks", () => {
    const { ctx, calls } = stubContext();
    drawHands(ctx, 640, 360, []);
    drawHands(ctx, 640, 360, [{ landmarks: hand().slice(0, 10), palm: true }]);
    expect(calls.clearRect).toBe(2);
    expect(calls.stroke).toBe(0);
    expect(calls.fill).toBe(0);
  });
});
