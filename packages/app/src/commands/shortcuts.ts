/*
 * Shortcuts are written as `+`-joined modifiers followed by one key, such as "Mod+Shift+S".
 * `Mod` is Ctrl, or Cmd on macOS keyboards; both are accepted so the same binding works everywhere.
 */

interface ParsedShortcut {
  key: string;
  hasMod: boolean;
  hasShift: boolean;
  hasAlt: boolean;
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  return {
    key,
    hasMod: parts.includes("Mod"),
    hasShift: parts.includes("Shift"),
    hasAlt: parts.includes("Alt"),
  };
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  const isModPressed = event.ctrlKey || event.metaKey;
  if (isModPressed !== parsed.hasMod || event.shiftKey !== parsed.hasShift || event.altKey !== parsed.hasAlt) {
    return false;
  }
  if (parsed.key.length === 1) {
    // Alt and Shift change the typed character on some layouts, so fall back to the physical key.
    return event.key.toLowerCase() === parsed.key.toLowerCase() || event.code === `Key${parsed.key.toUpperCase()}`;
  }
  return event.key === parsed.key;
}

/**
 * Writes a shortcut for display, such as "Ctrl + Shift + S": Mod shows as Ctrl, and each plus has a
 * space on either side so the keys read apart.
 */
export function formatShortcut(shortcut: string): string {
  // A shortcut whose key is the plus sign itself ends in "++".
  const isPlusKey = shortcut.endsWith("++");
  const parts = (isPlusKey ? shortcut.slice(0, -2) : shortcut).split("+").filter((part) => part !== "");
  return [...parts, ...(isPlusKey ? ["+"] : [])].map((part) => (part === "Mod" ? "Ctrl" : part)).join(" + ");
}
