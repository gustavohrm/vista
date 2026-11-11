/** Presentation and input options of the raw editor. */
export interface EditorSettings {
  lineNumbers: boolean;
  minimap: boolean;
  vim: boolean;
  wordWrap: boolean;
}

/** User preferences, stored by the browser or webview under `SETTINGS_STORAGE_KEY`. */
export interface Settings {
  version: 1;
  editor: EditorSettings;
}

export const SETTINGS_STORAGE_KEY = "vista.settings";

/** Suits prose and narrow screens, the common case for Markdown and plain-text notes. */
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  lineNumbers: true,
  minimap: false,
  vim: false,
  wordWrap: true,
};

export const DEFAULT_SETTINGS: Settings = { version: 1, editor: DEFAULT_EDITOR_SETTINGS };

/**
 * Reads stored settings. Anything unreadable falls back to the defaults, field by field, so a
 * damaged or hand-edited value never stops the app from starting.
 *
 * @param stored - The stored JSON text, or null when nothing is stored.
 * @returns Complete settings.
 */
export function parseSettings(stored: string | null): Settings {
  if (stored === null) {
    return DEFAULT_SETTINGS;
  }
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.editor)) {
    return DEFAULT_SETTINGS;
  }
  const editor = value.editor;
  const pick = (name: keyof EditorSettings) =>
    typeof editor[name] === "boolean" ? editor[name] : DEFAULT_EDITOR_SETTINGS[name];
  return {
    version: 1,
    editor: {
      lineNumbers: pick("lineNumbers"),
      minimap: pick("minimap"),
      vim: pick("vim"),
      wordWrap: pick("wordWrap"),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
