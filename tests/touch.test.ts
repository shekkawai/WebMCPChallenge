import { describe, expect, test } from "bun:test";
import { touchSwipeDirection } from "../src/input/touch";

describe("touch swipe direction", () => {
  test("a leftward drag pulls the next item in", () => {
    expect(touchSwipeDirection(-90, 4)).toBe(1);
  });

  test("a rightward drag goes back", () => {
    expect(touchSwipeDirection(120, -10)).toBe(-1);
  });

  test("a short drag is a tap, not a swipe", () => {
    expect(touchSwipeDirection(-30, 0)).toBeNull();
    expect(touchSwipeDirection(51, 0)).toBeNull();
  });

  test("a vertical-dominant drag is a scroll, not a swipe", () => {
    expect(touchSwipeDirection(-60, 80)).toBeNull();
    expect(touchSwipeDirection(-60, -40)).toBeNull();
  });

  test("a clearly horizontal drag with some drift still swipes", () => {
    expect(touchSwipeDirection(-110, 30)).toBe(1);
  });
});
