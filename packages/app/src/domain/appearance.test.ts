import { describe, expect, it } from "vitest";

import { DEFAULT_APPEARANCE_SETTINGS, parseAppearanceSettings, resolveContrast, resolveMotion } from "./appearance";
import { parseSettings } from "./settings";

describe("parseAppearanceSettings", () => {
  it("keeps every known choice", () => {
    expect(parseAppearanceSettings({ contrast: "more", motion: "none" })).toEqual({ contrast: "more", motion: "none" });
    expect(parseAppearanceSettings({ contrast: "standard", motion: "reduced" })).toEqual({
      contrast: "standard",
      motion: "reduced",
    });
  });

  it("falls back field by field", () => {
    expect(parseAppearanceSettings({ contrast: "less", motion: "all" })).toEqual({ contrast: "system", motion: "all" });
    expect(parseAppearanceSettings({ contrast: "more", motion: 3 })).toEqual({ contrast: "more", motion: "system" });
  });

  it("falls back whole for a value that is not an object", () => {
    for (const value of [undefined, null, "more", ["more"], 1]) {
      expect(parseAppearanceSettings(value)).toEqual(DEFAULT_APPEARANCE_SETTINGS);
    }
  });

  it("is read with the other settings, and defaults when they predate it", () => {
    expect(parseSettings(JSON.stringify({ version: 1, appearance: { contrast: "more" } })).appearance).toEqual({
      contrast: "more",
      motion: "system",
    });
    expect(parseSettings(JSON.stringify({ version: 1, editor: {} })).appearance).toEqual(DEFAULT_APPEARANCE_SETTINGS);
  });
});

describe("resolveContrast", () => {
  it("follows the operating system only for System", () => {
    expect(resolveContrast("system", true)).toBe("more");
    expect(resolveContrast("system", false)).toBe("standard");
    expect(resolveContrast("standard", true)).toBe("standard");
    expect(resolveContrast("more", false)).toBe("more");
  });
});

describe("resolveMotion", () => {
  it("resolves System to all or reduced, never none", () => {
    expect(resolveMotion("system", false)).toBe("full");
    expect(resolveMotion("system", true)).toBe("reduce");
  });

  it("keeps an explicit choice whatever the operating system asks", () => {
    expect(resolveMotion("all", true)).toBe("full");
    expect(resolveMotion("reduced", false)).toBe("reduce");
    expect(resolveMotion("none", false)).toBe("none");
  });
});
