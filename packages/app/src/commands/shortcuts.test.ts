import { describe, expect, it } from "vitest";

import { formatShortcut, matchesShortcut } from "./shortcuts";

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("matchesShortcut", () => {
  it("matches Mod with Ctrl", () => {
    expect(matchesShortcut(keydown({ key: "s", ctrlKey: true }), "Mod+S")).toBe(true);
  });

  it("matches Mod with Cmd", () => {
    expect(matchesShortcut(keydown({ key: "s", metaKey: true }), "Mod+S")).toBe(true);
  });

  it("does not match without the modifier", () => {
    expect(matchesShortcut(keydown({ key: "s" }), "Mod+S")).toBe(false);
  });

  it("does not match when an extra modifier is held", () => {
    expect(matchesShortcut(keydown({ key: "S", ctrlKey: true, shiftKey: true }), "Mod+S")).toBe(false);
  });

  it("matches Shift combinations whatever the letter's case", () => {
    expect(matchesShortcut(keydown({ key: "S", ctrlKey: true, shiftKey: true }), "Mod+Shift+S")).toBe(true);
  });

  it("matches a letter by its physical key when Alt changes the typed character", () => {
    expect(matchesShortcut(keydown({ key: "∑", code: "KeyW", altKey: true }), "Alt+W")).toBe(true);
  });

  it("matches named keys", () => {
    expect(matchesShortcut(keydown({ key: "PageDown", altKey: true }), "Alt+PageDown")).toBe(true);
  });
});

describe("formatShortcut", () => {
  it("shows Mod as Ctrl", () => {
    expect(formatShortcut("Mod+Shift+S")).toBe("Ctrl+Shift+S");
  });
});
