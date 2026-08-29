import { describe, expect, test } from "bun:test";
import { fallbackRoute, formatDistance, haversineM, isValidCoord, walkingRoute } from "../src/geo";
import { decidePresentation } from "../src/presentation";

describe("geo helpers", () => {
  test("haversine distance is accurate at city scale", () => {
    const d = haversineM({ lat: 22.2793, lng: 114.1732 }, { lat: 22.2775, lng: 114.177 });
    expect(d).toBeGreaterThan(380);
    expect(d).toBeLessThan(480);
  });

  test("coordinate validation rejects out-of-range and non-numeric values", () => {
    expect(isValidCoord(22.28, 114.17)).toBeTrue();
    expect(isValidCoord(91, 0)).toBeFalse();
    expect(isValidCoord(0, 181)).toBeFalse();
    expect(isValidCoord("22.28", 114.17)).toBeFalse();
    expect(isValidCoord(NaN, 114.17)).toBeFalse();
  });

  test("formatDistance switches to km at 1000 m", () => {
    expect(formatDistance(619)).toBe("619 m");
    expect(formatDistance(1500)).toBe("1.5 km");
  });

  test("fallback route is a straight line with a walking-pace estimate", () => {
    const route = fallbackRoute({ lat: 22.2793, lng: 114.1732 }, { lat: 22.2775, lng: 114.177 });
    expect(route.fallback).toBeTrue();
    expect(route.points).toHaveLength(2);
    expect(route.durationMin).toBeGreaterThanOrEqual(4);
  });

  test("a routing-service failure degrades to the fallback instead of throwing", async () => {
    const failing = (() => Promise.reject(new Error("down"))) as unknown as typeof fetch;
    const route = await walkingRoute({ lat: 22.2793, lng: 114.1732 }, { lat: 22.2775, lng: 114.177 }, failing);
    expect(route.fallback).toBeTrue();
    expect(route.points).toHaveLength(2);
  });

  test("a real routing response becomes lat/lng points with deduped street names", async () => {
    const body = {
      code: "Ok",
      routes: [
        {
          distance: 619.4,
          duration: 497,
          geometry: { coordinates: [[114.1732, 22.2793], [114.175, 22.2784], [114.177, 22.2775]] },
          legs: [{ steps: [{ name: "Lockhart Road" }, { name: "Lockhart Road" }, { name: "" }, { name: "Fleming Road" }] }],
        },
      ],
    };
    const fake = (() => Promise.resolve(new Response(JSON.stringify(body)))) as unknown as typeof fetch;
    const route = await walkingRoute({ lat: 22.2793, lng: 114.1732 }, { lat: 22.2775, lng: 114.177 }, fake);
    expect(route.fallback).toBeFalse();
    expect(route.points[0]).toEqual([22.2793, 114.1732]);
    expect(route.distanceM).toBe(619);
    expect(route.streets).toEqual(["Lockhart Road", "Fleming Road"]);
  });
});

describe("location shape presentation", () => {
  test("items with coordinates render as a map on desktop and in the lens", () => {
    expect(decidePresentation("choose", "desktop", undefined, true)).toMatchObject({ layout: "map", renderedAs: "map-pins" });
    expect(decidePresentation("browse", "glasses", undefined, true)).toMatchObject({ layout: "map", renderedAs: "map-lens" });
  });

  test("inspect and triage keep their focused layouts even with coordinates", () => {
    expect(decidePresentation("inspect", "desktop", undefined, true).layout).not.toBe("map");
    expect(decidePresentation("triage", "desktop", undefined, true).layout).not.toBe("map");
  });

  test("without coordinates nothing changes", () => {
    expect(decidePresentation("choose", "desktop", undefined, false).layout).toBe("deck");
  });
});
