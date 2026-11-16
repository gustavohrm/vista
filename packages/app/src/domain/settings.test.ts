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

  it("reads the stored update setting", () => {
    const stored = JSON.stringify({ version: 1, updates: { checkAtStartup: true } });

    expect(parseSettings(stored)).toEqual({
      ...DEFAULT_SETTINGS,
      updates: { checkAtStartup: true, dismissedVersion: null },
    });
  });

  it("keeps a dismissed version as long as the longest version allowed", () => {
    const version = "1".repeat(64);
    const stored = JSON.stringify({ version: 1, updates: { checkAtStartup: true, dismissedVersion: version } });

    expect(parseSettings(stored).updates.dismissedVersion).toBe(version);
  });

  it("keeps the dismissed version when the startup switch is mistyped", () => {
    const stored = JSON.stringify({ version: 1, updates: { checkAtStartup: "yes", dismissedVersion: "0.4.0" } });

    expect(parseSettings(stored).updates).toEqual({ checkAtStartup: false, dismissedVersion: "0.4.0" });
  });

  it("reads the version whose update notice was dismissed", () => {
    const stored = JSON.stringify({ version: 1, updates: { checkAtStartup: true, dismissedVersion: "0.4.0" } });

    expect(parseSettings(stored).updates).toEqual({ checkAtStartup: true, dismissedVersion: "0.4.0" });
  });

  it.each([
    ["mistyped", 4],
    ["empty", ""],
    ["longer than any version", "1".repeat(65)],
  ])("dismisses no version when the stored one is %s, and keeps the other update setting", (_case, dismissed) => {
    const stored = JSON.stringify({ version: 1, updates: { checkAtStartup: true, dismissedVersion: dismissed } });

    expect(parseSettings(stored).updates).toEqual({ checkAtStartup: true, dismissedVersion: null });
  });

  it.each([
    ["missing, as in settings stored before it existed", { version: 1, editor: { vim: true } }],
    ["mistyped", { version: 1, updates: { checkAtStartup: "yes" } }],
  ])("leaves startup update checks off when the setting is %s", (_case, stored) => {
    expect(parseSettings(JSON.stringify(stored)).updates).toEqual({ checkAtStartup: false, dismissedVersion: null });
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
