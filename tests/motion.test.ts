import { describe, expect, test } from "bun:test";
import { cardRole, swipeCardPose } from "../src/motion";

describe("surface motion", () => {
  test("assigns stable card roles around the focused item", () => {
    expect([0, 1, 2, 3, 4].map((index) => cardRole(index, 2))).toEqual([
      "far-left",
      "prev",
      "focus",
      "next",
      "far-right",
    ]);
  });

  test("next-swipe progress continuously moves the focus and incoming card to their final roles", () => {
    expect(swipeCardPose("focus", 0)).toEqual({ x: -50, rotate: 0, scale: 1, opacity: 1 });
    expect(swipeCardPose("focus", 1)).toEqual({ x: -140, rotate: 16, scale: 0.86, opacity: 0.42000000000000004 });
    expect(swipeCardPose("next", 1)).toEqual({ x: -50, rotate: 0, scale: 1, opacity: 1 });
  });

  test("previous-swipe progress mirrors the transition", () => {
    expect(swipeCardPose("focus", -1)).toEqual({ x: 40, rotate: -16, scale: 0.86, opacity: 0.42000000000000004 });
    expect(swipeCardPose("prev", -1)).toEqual({ x: -50, rotate: 0, scale: 1, opacity: 1 });
  });

  test("progress is clamped and unrelated cards stay untouched", () => {
    expect(swipeCardPose("next", 3)).toEqual(swipeCardPose("next", 1));
    expect(swipeCardPose("prev", 0.5)).toBeNull();
    expect(swipeCardPose("far-right", -0.5)).toBeNull();
  });
});
