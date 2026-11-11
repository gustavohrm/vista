import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("parseSettings", () => {
  it("uses the defaults when nothing is stored", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("reads stored editor settings", () => {
    const stored = JSON.stringify({
      version: 1,
      editor: { lineNumbers: false, minimap: true, vim: true, wordWrap: false },
    });

    expect(parseSettings(stored)).toEqual({
      version: 1,
      editor: { lineNumbers: false, minimap: true, vim: true, wordWrap: false },
    });
  });

  it("falls back to the default for each missing or mistyped field", () => {
    const stored = JSON.stringify({ version: 1, editor: { vim: true, minimap: "yes" } });

    expect(parseSettings(stored).editor).toEqual({ ...DEFAULT_SETTINGS.editor, vim: true });
  });

  it.each([
    ["text that is not JSON", "{"],
    ["another version", JSON.stringify({ version: 2, editor: { vim: true } })],
    ["no editor object", JSON.stringify({ version: 1, editor: [] })],
    ["a value that is not an object", "true"],
  ])("uses the defaults for %s", (_case, stored) => {
    expect(parseSettings(stored)).toEqual(DEFAULT_SETTINGS);
  });
});
