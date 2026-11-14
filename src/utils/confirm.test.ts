import { describe, it, expect, vi, beforeEach } from "vitest";
import { safeConfirm } from "./confirm.ts";

describe("safeConfirm helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes mocked window.confirm in unit test environment and respects true", () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const result = safeConfirm("Are you sure?");
    expect(spy).toHaveBeenCalledWith("Are you sure?");
    expect(result).toBe(true);
  });

  it("invokes mocked window.confirm in unit test environment and respects false", () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const result = safeConfirm("Are you sure?");
    expect(spy).toHaveBeenCalledWith("Are you sure?");
    expect(result).toBe(false);
  });

  it("falls back to true when window.confirm is not a test mock to prevent silencing user actions", () => {
    // Standard unmocked function
    const original = window.confirm;
    try {
      window.confirm = (_msg?: string) => false;
      const result = safeConfirm("Test prompt");
      expect(result).toBe(true);
    } finally {
      window.confirm = original;
    }
  });
});
