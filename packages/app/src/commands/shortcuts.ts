/*
 * Shortcuts are written as `+`-joined modifiers followed by one key, such as "Mod+Shift+S".
 * `Mod` is Ctrl, or Cmd on macOS keyboards; both are accepted so the same binding works everywhere.
 * A letter is written in upper case, and the arrows as `Up`, `Down`, `Left`, and `Right`.
 */

interface ParsedShortcut {
  key: string;
  hasMod: boolean;
  hasShift: boolean;
  hasAlt: boolean;
}

/** `event.key` names that shortcuts write shorter, as the menus have always shown them. */
const KEY_NAMES: Readonly<Record<string, string>> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
};

/** Keys that never make a shortcut by themselves: modifiers, and keys that name no key yet. */
const IGNORED_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "OS", "Dead", "Unidentified", "Process"]);

const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;

function parseShortcut(shortcut: string): ParsedShortcut {
  // A shortcut whose key is the plus sign itself ends in "++".
  const isPlusKey = shortcut.endsWith("++");
  const parts = (isPlusKey ? shortcut.slice(0, -2) : shortcut).split("+");
  const key = isPlusKey ? "+" : (parts.pop() ?? "");
  return {
    key,
    hasMod: parts.includes("Mod"),
    hasShift: parts.includes("Shift"),
    hasAlt: parts.includes("Alt"),
  };
}

function writeShortcut({ key, hasMod, hasShift, hasAlt }: ParsedShortcut): string {
  const letter = key.length === 1 ? key.toUpperCase() : key;
  return [...(hasMod ? ["Mod"] : []), ...(hasAlt ? ["Alt"] : []), ...(hasShift ? ["Shift"] : []), letter].join("+");
}

/**
 * Writes a shortcut the one way it is stored, so two spellings of a key compare equal: modifiers in
 * the order Mod, Alt, Shift, and a letter in upper case.
 *
 * @param shortcut - A shortcut in any modifier order, such as `Shift+Mod+s`.
 * @returns The same shortcut, such as `Mod+Shift+S`.
 */
export function normalizeShortcut(shortcut: string): string {
  return writeShortcut(parseShortcut(shortcut));
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  const isModPressed = event.ctrlKey || event.metaKey;
  if (isModPressed !== parsed.hasMod || event.shiftKey !== parsed.hasShift || event.altKey !== parsed.hasAlt) {
    return false;
  }
  if (parsed.key.length === 1) {
    // Alt and Shift change the typed character on some layouts, so fall back to the physical key.
    const physical = /^[a-z]$/i.test(parsed.key)
      ? `Key${parsed.key.toUpperCase()}`
      : /^\d$/.test(parsed.key)
        ? `Digit${parsed.key}`
        : null;
    return event.key.toLowerCase() === parsed.key.toLowerCase() || (physical !== null && event.code === physical);
  }
  return (KEY_NAMES[event.key] ?? event.key) === parsed.key;
}

/**
 * Reads the shortcut a key press makes, for recording one: letters and digits from the physical key,
 * so a key held with Alt or Shift reads as the key and not the character it types, and every other
 * key from what it is.
 *
 * @param event - A keydown.
 * @returns The shortcut, such as `Mod+Shift+G`, or null while only modifiers are down.
 */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  if (IGNORED_KEYS.has(event.key)) {
    return null;
  }
  const physical = /^Key([A-Z])$/.exec(event.code)?.[1] ?? /^Digit(\d)$/.exec(event.code)?.[1];
  const key = physical ?? KEY_NAMES[event.key] ?? event.key;
  return writeShortcut({
    key,
    hasMod: event.ctrlKey || event.metaKey,
    hasShift: event.shiftKey,
    hasAlt: event.altKey,
  });
}

/** Why a key cannot be a command's shortcut. */
export type ShortcutRefusal =
  /** It has no Ctrl, Alt, or Cmd, so it would stop a character from being typed. */
  | "no-modifier"
  /** It is Ctrl+Alt with a character, which Windows sends for AltGr, so it would stop that character. */
  | "alt-graph"
  /** The browser keeps it and never hands it to the page. */
  | "host"
  /** An editor handles it, so binding it would take it from every text field. */
  | "editor";

/** Keys the browser keeps for itself; a page never receives them. */
const BROWSER_KEYS = new Set(
  ["Mod+N", "Mod+Shift+N", "Mod+T", "Mod+Shift+T", "Mod+W", "Mod+Shift+W", "Mod+Tab", "Mod+Shift+Tab"].map(
    normalizeShortcut,
  ),
);

/** The keys the browser keeps, for telling the user before they press one. */
export const BROWSER_KEPT_SHORTCUTS = ["Mod+N", "Mod+T", "Mod+W", "Mod+Tab"] as const;

/**
 * Says whether a key can be given to a command, and if not, why.
 *
 * @param shortcut - The key, in the `Mod+Shift+S` notation.
 * @param platform - The host, since the browser keeps some keys the desktop app does not.
 * @param editorKeys - The keys the editors handle themselves, normalized.
 * @returns Why the key is refused, or null when it can be used.
 */
export function shortcutRefusal(
  shortcut: string,
  platform: string,
  editorKeys: ReadonlySet<string>,
): ShortcutRefusal | null {
  const parsed = parseShortcut(shortcut);
  const normalized = writeShortcut(parsed);
  if (!parsed.hasMod && !parsed.hasAlt && !FUNCTION_KEY.test(parsed.key)) {
    return "no-modifier";
  }
  if (parsed.hasMod && parsed.hasAlt && parsed.key.length === 1) {
    return "alt-graph";
  }
  if (platform !== "native" && BROWSER_KEYS.has(normalized)) {
    return "host";
  }
  if (editorKeys.has(normalized)) {
    return "editor";
  }
  return null;
}

/**
 * Writes a shortcut for display, such as "Ctrl + Shift + S": Mod shows as Ctrl, and each plus has a
 * space on either side so the keys read apart.
 */
export function formatShortcut(shortcut: string): string {
  const isPlusKey = shortcut.endsWith("++");
  const parts = (isPlusKey ? shortcut.slice(0, -2) : shortcut).split("+").filter((part) => part !== "");
  return [...parts, ...(isPlusKey ? ["+"] : [])].map((part) => (part === "Mod" ? "Ctrl" : part)).join(" + ");
}
