/** Presentation and input options of the raw editor. */
export interface EditorSettings {
  lineNumbers: boolean;
  minimap: boolean;
  vim: boolean;
  wordWrap: boolean;
}

/** Limits on the files Vista opens. */
export interface FileSettings {
  /** Largest file Vista opens, in megabytes (1 MB = 1,048,576 bytes). A whole number in range. */
  maxOpenSizeMb: number;
}

/** User preferences, stored by the browser or webview under `SETTINGS_STORAGE_KEY`. */
export interface Settings {
  version: 1;
  editor: EditorSettings;
  files: FileSettings;
}

export const SETTINGS_STORAGE_KEY = "vista.settings";

/** Suits prose and narrow screens, the common case for Markdown and plain-text notes. */
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  lineNumbers: true,
  minimap: false,
  vim: false,
  wordWrap: true,
};

export const MIN_OPEN_SIZE_MB = 1;
/** A file read whole into memory past this point risks the tab's memory limit in Chromium. */
export const MAX_OPEN_SIZE_MB_LIMIT = 512;

/** Far above a note or a spreadsheet export, and below where the editors stop responding. */
export const DEFAULT_FILE_SETTINGS: FileSettings = { maxOpenSizeMb: 10 };

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  editor: DEFAULT_EDITOR_SETTINGS,
  files: DEFAULT_FILE_SETTINGS,
};

export const BYTES_PER_MB = 1024 * 1024;

/** Whether a value can be stored as the file size limit. */
export function isValidOpenSizeMb(value: unknown): value is number {
  return (
    Number.isInteger(value) && (value as number) >= MIN_OPEN_SIZE_MB && (value as number) <= MAX_OPEN_SIZE_MB_LIMIT
  );
}

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
  if (!isRecord(value) || value.version !== 1) {
    return DEFAULT_SETTINGS;
  }
  return { version: 1, editor: parseEditorSettings(value.editor), files: parseFileSettings(value.files) };
}

function parseEditorSettings(value: unknown): EditorSettings {
  if (!isRecord(value)) {
    return DEFAULT_EDITOR_SETTINGS;
  }
  const pick = (name: keyof EditorSettings) =>
    typeof value[name] === "boolean" ? value[name] : DEFAULT_EDITOR_SETTINGS[name];
  return {
    lineNumbers: pick("lineNumbers"),
    minimap: pick("minimap"),
    vim: pick("vim"),
    wordWrap: pick("wordWrap"),
  };
}

function parseFileSettings(value: unknown): FileSettings {
  if (!isRecord(value) || !isValidOpenSizeMb(value.maxOpenSizeMb)) {
    return DEFAULT_FILE_SETTINGS;
  }
  return { maxOpenSizeMb: value.maxOpenSizeMb };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
