import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, MAX_OPEN_SIZE_MB_LIMIT, MIN_OPEN_SIZE_MB, parseSettings } from "./settings";

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
      ...DEFAULT_SETTINGS,
      editor: { lineNumbers: false, minimap: true, vim: true, wordWrap: false },
    });
  });

  it("reads the stored file size limit", () => {
    const stored = JSON.stringify({ version: 1, files: { maxOpenSizeMb: 50 } });

    expect(parseSettings(stored)).toEqual({ ...DEFAULT_SETTINGS, files: { maxOpenSizeMb: 50 } });
  });

  it("keeps the stored editor settings when the file settings are damaged", () => {
    const stored = JSON.stringify({ version: 1, editor: { vim: true }, files: "big" });

    expect(parseSettings(stored)).toEqual({
      ...DEFAULT_SETTINGS,
      editor: { ...DEFAULT_SETTINGS.editor, vim: true },
    });
  });

  it.each([
    ["zero", 0],
    ["a fraction", 2.5],
    ["below the minimum", MIN_OPEN_SIZE_MB - 1],
    ["above the maximum", MAX_OPEN_SIZE_MB_LIMIT + 1],
    ["text", "10"],
  ])("uses the default file size limit for %s", (_case, maxOpenSizeMb) => {
    const stored = JSON.stringify({ version: 1, files: { maxOpenSizeMb } });

    expect(parseSettings(stored).files).toEqual(DEFAULT_SETTINGS.files);
  });

  it("uses the default file size limit for a number too large to represent", () => {
    // Written as text, because `JSON.stringify` would turn the infinity `JSON.parse` reads here into null.
    const stored = '{ "version": 1, "files": { "maxOpenSizeMb": 1e999 } }';

    expect(parseSettings(stored).files).toEqual(DEFAULT_SETTINGS.files);
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
