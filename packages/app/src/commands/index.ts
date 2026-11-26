import { useEffect, useRef } from "react";

import { t } from "../i18n";
import { matchesShortcut } from "./shortcuts";

export { formatShortcut } from "./shortcuts";
export {
  changeShortcuts,
  isRebindable,
  resolveShortcuts,
  sameKeys,
  shortcutOwner,
  type StoredShortcuts,
} from "./keymap";

/**
 * The groups commands are listed under, in the order the palette and the Keyboard Shortcuts list
 * show them.
 */
export const COMMAND_CATEGORIES = ["Workspace", "File", "Tabs", "Edit", "Selection", "View", "Go", "Settings"] as const;

export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

const CATEGORY_KEYS = {
  Workspace: "shortcuts.categories.workspace",
  File: "shortcuts.categories.file",
  Tabs: "shortcuts.categories.tabs",
  Edit: "shortcuts.categories.edit",
  Selection: "shortcuts.categories.selection",
  View: "shortcuts.categories.view",
  Go: "shortcuts.categories.go",
  Settings: "shortcuts.categories.settings",
} as const satisfies Record<CommandCategory, string>;

/**
 * Names a category in the interface language. The category itself stays an English id, which groups
 * and orders commands.
 *
 * @param category - The category to name.
 * @returns Its name, such as `View` or `Exibir`.
 */
export function categoryLabel(category: CommandCategory): string {
  return t(CATEGORY_KEYS[category]);
}

/** An action the user can trigger from a shortcut or from the menus. */
export interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  /** The keys that run the command, any of them; the first is the one shown where only one fits. */
  shortcuts?: readonly string[];
  /** The keys the command has until the user changes them, set by `resolveShortcuts`. */
  defaultShortcuts?: readonly string[];
  /**
   * A key the focused editor handles itself, shown in menus but not bound by the app, such as
   * Ctrl+Z in the raw editor. Binding it here would take the key from every other text field.
   */
  shortcutHint?: string;
  /** Makes the command a toggle in menus, showing this state. */
  isChecked?: boolean;
  /** Disabled commands still swallow their shortcut, so Ctrl+S never falls through to the browser. */
  isEnabled?: boolean;
  run: () => void | Promise<void>;
}

/**
 * The key shown for a command where only one fits, such as a tooltip or a menu row: its first key,
 * or the key an editor handles for it.
 *
 * @param command - The command.
 * @returns The key, or undefined when it has none.
 */
export function shownShortcut(command: Pick<Command, "shortcuts" | "shortcutHint">): string | undefined {
  return command.shortcuts?.[0] ?? command.shortcutHint;
}

/** Runs the command one of whose keys matches each keydown on the window. */
export function useCommandShortcuts(commands: readonly Command[]): void {
  // A ref keeps one listener for the app's lifetime while always reading the latest commands.
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const command = commandsRef.current.find((cmd) =>
        cmd.shortcuts?.some((shortcut) => matchesShortcut(event, shortcut)),
      );
      if (!command) {
        return;
      }
      event.preventDefault();
      if (command.isEnabled === false) {
        return;
      }
      void runCommand(command);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * Orders commands by category, keeping their order within each.
 *
 * @param commands - Commands in any category order.
 * @returns A new list, grouped in `COMMAND_CATEGORIES` order.
 */
export function sortByCategory<T extends Pick<Command, "category">>(commands: readonly T[]): T[] {
  return COMMAND_CATEGORIES.flatMap((category) => commands.filter((command) => command.category === category));
}

/** Runs a command, logging a failure instead of leaving a rejected promise unhandled. */
export async function runCommand(command: Command): Promise<void> {
  try {
    await command.run();
  } catch (err) {
    console.error(`Command "${command.id}" failed:`, err);
  }
}
