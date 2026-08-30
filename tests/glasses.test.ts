import { describe, expect, test } from "bun:test";
import { glassesGeometry } from "../src/views/glasses";

const VIEWPORTS = [
  { name: "16:9 laptop", vw: 1920, vh: 1080 },
  { name: "16:10 laptop", vw: 1440, vh: 900 },
  { name: "ultrawide", vw: 2560, vh: 1000 },
  { name: "very wide", vw: 3440, vh: 900 },
  { name: "square-ish", vw: 1000, vh: 1000 },
  { name: "portrait", vw: 480, vh: 900 },
];

describe("glasses geometry", () => {
  for (const v of VIEWPORTS) {
    test(`${v.name}: the frame stays whole and centred`, () => {
      const g = glassesGeometry(v.vw, v.vh);
      // The whole glasses frame fits inside the viewport height — a wider
      // window must never crop it.
      expect(g.frameHeight).toBeLessThanOrEqual(v.vh + 0.5);
      // The lens display box always fits the viewport width — on a portrait
      // phone the frame shrinks rather than the app overflowing the screen.
      expect(g.boxW).toBeLessThanOrEqual(v.vw * 0.95);
      // Lens display box is centred on the viewport.
      expect(g.boxLeft + g.boxW / 2).toBeCloseTo(v.vw / 2, 3);
      expect(g.boxTop + g.boxH / 2).toBeCloseTo(v.vh / 2, 3);
      // Where the width cap is not what sized the frame (landscape/square),
      // the frame fills the height and the photo leaves no vertical gap.
      // Portrait trades those for fitting the width; ambient blur fills in.
      if (g.frameHeight / v.vh > 0.9) {
        expect(g.photoTop).toBeLessThanOrEqual(0);
        expect(g.photoTop + g.dispH).toBeGreaterThanOrEqual(v.vh);
      }
      // The display box sits inside the photo's lens, not off it.
      expect(g.boxW).toBeLessThan(g.dispW);
      expect(g.boxH).toBeLessThan(g.dispH);
    });
  }

  test("landscape and square viewports still fill the height", () => {
    for (const v of VIEWPORTS.filter((v) => v.vw >= v.vh)) {
      const g = glassesGeometry(v.vw, v.vh);
      expect(g.frameHeight / v.vh).toBeGreaterThan(0.9);
    }
  });

  test("portrait phone: frame shrinks to fit, app box stays on screen", () => {
    const g = glassesGeometry(390, 844);
    expect(g.boxLeft).toBeGreaterThanOrEqual(0);
    expect(g.boxLeft + g.boxW).toBeLessThanOrEqual(390);
    expect(g.boxW).toBeGreaterThan(300);
  });

  test("the photo bleeds off the left more than the right", () => {
    const g = glassesGeometry(1920, 1080);
    const leftOverhang = -g.photoLeft;
    const rightOverhang = g.photoLeft + g.dispW - 1920;
    expect(leftOverhang).toBeGreaterThan(rightOverhang);
    expect(leftOverhang).toBeGreaterThan(0);
  });

  test("windows up to about 16:9 are covered edge to edge", () => {
    for (const v of [{ vw: 1920, vh: 1080 }, { vw: 1440, vh: 900 }, { vw: 1280, vh: 800 }]) {
      const g = glassesGeometry(v.vw, v.vh);
      expect(g.photoLeft).toBeLessThanOrEqual(0);
      expect(g.photoLeft + g.dispW).toBeGreaterThanOrEqual(v.vw);
    }
  });

  test("a wider window shows the frame at least as large, never smaller", () => {
    const narrow = glassesGeometry(1400, 900);
    const wide = glassesGeometry(2600, 900);
    expect(wide.frameHeight).toBeGreaterThanOrEqual(narrow.frameHeight);
    expect(wide.boxW).toBeGreaterThanOrEqual(narrow.boxW);
  });
});
