import { describe, expect, it } from "vitest";

import type { Command } from ".";
import { changeShortcuts, resolveShortcuts, shortcutOwner } from "./keymap";

function command(id: string, keys?: { shortcuts?: string[]; shortcutHint?: string }): Command {
  return { id, label: id, category: "File", run: () => {}, ...keys };
}

const COMMANDS = [
  command("save", { shortcuts: ["Mod+S"] }),
  command("goto.line", { shortcuts: ["Mod+G"] }),
  command("goto.file", { shortcuts: ["Mod+P"] }),
  command("tabs.next"),
  command("undo", { shortcutHint: "Mod+Z" }),
];

function keysOf(commands: readonly Command[]): Record<string, readonly string[] | undefined> {
  return Object.fromEntries(commands.map((each) => [each.id, each.shortcuts]));
}

function keysFor(commands: readonly Command[], id: string): readonly string[] | undefined {
  return commands.find((each) => each.id === id)?.shortcuts;
}

describe("resolveShortcuts", () => {
  it("gives every command its default keys when nothing is stored", () => {
    const resolved = resolveShortcuts(COMMANDS, {}, "web");

    expect(keysOf(resolved)).toEqual({
      save: ["Mod+S"],
      "goto.line": ["Mod+G"],
      "goto.file": ["Mod+P"],
      "tabs.next": [],
      undo: undefined,
    });
    expect(resolved[0]?.defaultShortcuts).toEqual(["Mod+S"]);
  });

  it("replaces a default with a stored list, in its order, and an empty list removes every key", () => {
    const resolved = resolveShortcuts(COMMANDS, { "goto.line": ["Mod+L", "Mod+G"], save: [] }, "web");

    expect(keysOf(resolved)).toMatchObject({ save: [], "goto.line": ["Mod+L", "Mod+G"] });
  });

  it("ignores an entry whose command does not exist, and one for an editor command", () => {
    const resolved = resolveShortcuts(COMMANDS, { gone: ["Mod+L"], undo: ["Mod+U"] }, "web");

    expect(keysOf(resolved)).toEqual(keysOf(resolveShortcuts(COMMANDS, {}, "web")));
  });

  it("drops a refused or repeated key from a stored list and keeps the rest", () => {
    const resolved = resolveShortcuts(
      COMMANDS,
      { "tabs.next": ["L", "Mod+Tab", "Mod+Z", "Mod+Alt+2", "Mod+l", "Mod+L", "Alt+Right"] },
      "web",
    );

    expect(keysFor(resolved, "tabs.next")).toEqual(["Mod+L", "Alt+Right"]);
  });

  it("keeps a key the browser keeps on the desktop", () => {
    const resolved = resolveShortcuts(COMMANDS, { "tabs.next": ["Mod+Tab"] }, "native");

    expect(keysFor(resolved, "tabs.next")).toEqual(["Mod+Tab"]);
  });

  it("gives a key the user chose over another command's default", () => {
    const resolved = resolveShortcuts(COMMANDS, { "tabs.next": ["Mod+G"] }, "web");

    expect(keysOf(resolved)).toMatchObject({ "goto.line": [], "tabs.next": ["Mod+G"] });
    expect(resolved.find((each) => each.id === "goto.line")?.defaultShortcuts).toEqual(["Mod+G"]);
  });

  it("leaves a key in two stored lists with the first command", () => {
    const resolved = resolveShortcuts(COMMANDS, { "tabs.next": ["Mod+L"], save: ["Mod+L", "Mod+S"] }, "web");

    expect(keysOf(resolved)).toMatchObject({ save: ["Mod+L", "Mod+S"], "tabs.next": [] });
  });
});

describe("changeShortcuts", () => {
  const resolved = resolveShortcuts(COMMANDS, {}, "web");

  it("stores a changed list whole, normalized", () => {
    expect(changeShortcuts(resolved, {}, { "goto.line": ["Mod+G", "Mod+l"] })).toEqual({
      "goto.line": ["Mod+G", "Mod+L"],
    });
  });

  it("does not store a list equal to the default, and null resets", () => {
    expect(changeShortcuts(resolved, { save: [] }, { "goto.line": ["Mod+G"], save: null })).toEqual({});
  });

  it("keeps the other stored lists and drops entries for commands that do not exist", () => {
    expect(changeShortcuts(resolved, { gone: ["Mod+L"], "tabs.next": ["Mod+J"] }, { save: [] })).toEqual({
      save: [],
      "tabs.next": ["Mod+J"],
    });
  });
});

describe("shortcutOwner", () => {
  it("finds the command with a key in any spelling", () => {
    const resolved = resolveShortcuts(COMMANDS, { "goto.line": ["Mod+G", "Mod+L"] }, "web");

    expect(shortcutOwner(resolved, "Mod+l")?.id).toBe("goto.line");
    expect(shortcutOwner(resolved, "Mod+J")).toBeUndefined();
  });
});
