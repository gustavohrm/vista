import type { Command } from ".";
import { normalizeShortcut, shortcutRefusal } from "./shortcuts";

/** The user's shortcut choices: each changed command's whole list of keys, by command id. */
export type StoredShortcuts = Readonly<Record<string, readonly string[]>>;

/**
 * The keys the editors handle themselves, which no command can be given.
 *
 * @param commands - Every command.
 * @returns Their `shortcutHint` keys, normalized.
 */
export function editorShortcuts(commands: readonly Pick<Command, "shortcutHint">[]): Set<string> {
  return new Set(
    commands.flatMap((command) => (command.shortcutHint ? [normalizeShortcut(command.shortcutHint)] : [])),
  );
}

/** Whether the user can change a command's keys: every command but those whose key an editor handles. */
export function isRebindable(command: Pick<Command, "shortcutHint">): boolean {
  return command.shortcutHint === undefined;
}

/**
 * Applies the user's choices to the commands' default keys. A stored list replaces its command's
 * default; within it, a key that is refused or repeated is dropped. A key the user gave one command
 * is dropped from another's default, since the user's choice wins over a default, and a key in two
 * stored lists, which only a damaged store holds, stays with the first command.
 *
 * @param commands - Every command, each with its default keys in `shortcuts`.
 * @param stored - The user's choices, as read from storage.
 * @param platform - The host, which decides the keys the browser keeps.
 * @returns The commands with their keys resolved, each rebindable one with `defaultShortcuts` set.
 */
export function resolveShortcuts<T extends Command>(
  commands: readonly T[],
  stored: StoredShortcuts,
  platform: string,
): T[] {
  const editorKeys = editorShortcuts(commands);
  const claimed = new Set<string>();
  const chosen = new Map<string, string[]>();
  for (const command of commands) {
    const list = Object.hasOwn(stored, command.id) ? stored[command.id] : undefined;
    if (!isRebindable(command) || list === undefined) {
      continue;
    }
    const keys: string[] = [];
    for (const key of list.map(normalizeShortcut)) {
      if (!claimed.has(key) && shortcutRefusal(key, platform, editorKeys) === null) {
        claimed.add(key);
        keys.push(key);
      }
    }
    chosen.set(command.id, keys);
  }
  return commands.map((command) => {
    if (!isRebindable(command)) {
      return command;
    }
    const defaults = (command.shortcuts ?? []).map(normalizeShortcut);
    const shortcuts = chosen.get(command.id) ?? defaults.filter((key) => !claimed.has(key));
    return { ...command, shortcuts, defaultShortcuts: defaults };
  });
}

/**
 * Writes the user's choices after a change, keeping only the commands whose list differs from the
 * default. Entries for commands this build does not have are dropped here, on a change, and not
 * when read, so a command a later build brings back keeps its keys until then.
 *
 * @param commands - Every command, resolved.
 * @param stored - The choices as stored now.
 * @param changes - New lists by command id; null resets that command to its default.
 * @returns The choices to store.
 */
export function changeShortcuts(
  commands: readonly Command[],
  stored: StoredShortcuts,
  changes: Readonly<Record<string, readonly string[] | null>>,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const command of commands) {
    if (!isRebindable(command)) {
      continue;
    }
    const change = Object.hasOwn(changes, command.id) ? changes[command.id] : undefined;
    const list = change === undefined ? (Object.hasOwn(stored, command.id) ? stored[command.id] : undefined) : change;
    if (list === null || list === undefined) {
      continue;
    }
    const keys = [...new Set(list.map(normalizeShortcut))];
    if (!sameKeys(keys, command.defaultShortcuts ?? [])) {
      next[command.id] = keys;
    }
  }
  return next;
}

/**
 * Finds the command that has a key.
 *
 * @param commands - Every command, resolved.
 * @param shortcut - The key.
 * @returns The command, or undefined when none has it.
 */
export function shortcutOwner<T extends Command>(commands: readonly T[], shortcut: string): T | undefined {
  const key = normalizeShortcut(shortcut);
  return commands.find((command) => command.shortcuts?.includes(key));
}

/** Whether two lists hold the same keys in the same order. */
export function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}
