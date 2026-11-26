import { describe, expect, it } from "vitest";

import { formatShortcut, matchesShortcut, normalizeShortcut, shortcutFromEvent, shortcutRefusal } from "./shortcuts";

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
  it("shows Mod as Ctrl, with a space on each side of every plus", () => {
    expect(formatShortcut("Mod+Shift+S")).toBe("Ctrl + Shift + S");
  });

  it("keeps a key that is itself a comma or plus", () => {
    expect(formatShortcut("Mod+,")).toBe("Ctrl + ,");
    expect(formatShortcut("Mod++")).toBe("Ctrl + +");
  });
});

describe("normalizeShortcut", () => {
  it("orders modifiers Mod, Alt, Shift and upper-cases a letter", () => {
    expect(normalizeShortcut("Shift+Mod+s")).toBe("Mod+Shift+S");
    expect(normalizeShortcut("Shift+Alt+Mod+g")).toBe("Mod+Alt+Shift+G");
  });

  it("keeps the plus key", () => {
    expect(normalizeShortcut("Mod++")).toBe("Mod++");
  });
});

describe("shortcutFromEvent", () => {
  it("reads nothing while only modifiers are down", () => {
    expect(shortcutFromEvent(keydown({ key: "Control", code: "ControlLeft", ctrlKey: true }))).toBeNull();
    expect(shortcutFromEvent(keydown({ key: "Dead", code: "Quote", altKey: true }))).toBeNull();
  });

  it("reads a letter from the physical key when Alt changes the character", () => {
    expect(shortcutFromEvent(keydown({ key: "Ω", code: "KeyZ", altKey: true }))).toBe("Alt+Z");
  });

  it("reads a digit from the physical key when Shift changes the character", () => {
    expect(shortcutFromEvent(keydown({ key: "@", code: "Digit2", ctrlKey: true, shiftKey: true }))).toBe("Mod+Shift+2");
  });

  it("reads Cmd as Mod, and arrows and F-keys by name", () => {
    expect(shortcutFromEvent(keydown({ key: "l", code: "KeyL", metaKey: true }))).toBe("Mod+L");
    expect(shortcutFromEvent(keydown({ key: "ArrowUp", code: "ArrowUp", altKey: true }))).toBe("Alt+Up");
    expect(shortcutFromEvent(keydown({ key: "F5", code: "F5" }))).toBe("F5");
  });
});

describe("shortcutRefusal", () => {
  const editorKeys = new Set(["Mod+Z", "Mod+C"]);

  it("refuses a key without Ctrl, Alt, or Cmd, except an F-key", () => {
    expect(shortcutRefusal("G", "web", editorKeys)).toBe("no-modifier");
    expect(shortcutRefusal("Shift+G", "native", editorKeys)).toBe("no-modifier");
    expect(shortcutRefusal("F2", "web", editorKeys)).toBeNull();
    expect(shortcutRefusal("Shift+F2", "native", editorKeys)).toBeNull();
  });

  it("refuses Ctrl+Alt with a character, which AltGr sends, on every platform", () => {
    // AltGr+2 types @ on a Spanish keyboard.
    expect(shortcutRefusal("Mod+Alt+2", "web", editorKeys)).toBe("alt-graph");
    expect(shortcutRefusal("Mod+Alt+Q", "native", editorKeys)).toBe("alt-graph");
    expect(shortcutRefusal("Mod+Alt+Up", "native", editorKeys)).toBeNull();
    expect(shortcutRefusal("Mod+Alt+F3", "web", editorKeys)).toBeNull();
  });

  it("refuses the keys the browser keeps only in the browser", () => {
    const kept = ["Mod+N", "Mod+Shift+N", "Mod+T", "Mod+Shift+T", "Mod+W", "Mod+Shift+W", "Mod+Tab", "Shift+Mod+Tab"];
    for (const key of kept) {
      expect(shortcutRefusal(key, "web", editorKeys)).toBe("host");
      expect(shortcutRefusal(key, "native", editorKeys)).toBeNull();
    }
  });

  it("refuses the editor's keys in any spelling", () => {
    expect(shortcutRefusal("Mod+z", "native", editorKeys)).toBe("editor");
    expect(shortcutRefusal("Mod+C", "web", editorKeys)).toBe("editor");
  });

  it("allows a key with a modifier that nothing keeps", () => {
    expect(shortcutRefusal("Mod+L", "web", editorKeys)).toBeNull();
    expect(shortcutRefusal("Alt+Shift+L", "native", editorKeys)).toBeNull();
  });
});
