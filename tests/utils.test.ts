import { describe, expect, test } from "bun:test";
import { MAX_IMAGE_URL_LENGTH, safeCssColor, safeImageUrl } from "../src/utils";

describe("input safety", () => {
  test("accepts supported image sources", () => {
    expect(safeImageUrl("https://example.com/poster.png")).toBe("https://example.com/poster.png");
    expect(safeImageUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });

  test("rejects unsafe or oversized image sources", () => {
    expect(safeImageUrl("http://example.com/poster.png")).toBeUndefined();
    expect(safeImageUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeImageUrl(`data:image/png;base64,${"A".repeat(MAX_IMAGE_URL_LENGTH)}`)).toBeUndefined();
  });

  test("rejects CSS declaration injection", () => {
    expect(safeCssColor("#8b5cf6")).toBe("#8b5cf6");
    expect(safeCssColor("red;background:url(https://example.com/x)")).toBeUndefined();
  });
});
