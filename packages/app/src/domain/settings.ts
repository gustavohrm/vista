import { DEFAULT_APPEARANCE_SETTINGS, parseAppearanceSettings, type AppearanceSettings } from "./appearance";

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

/** When the desktop app asks for a newer version. */
export interface UpdateSettings {
  /** Whether to check at every start. Off by default, so Vista makes no update request the user didn't ask for. */
  checkAtStartup: boolean;
  /**
   * The version whose update notice the user dismissed, so the notice stays away until a newer one
   * is out. Null when none was dismissed.
   */
  dismissedVersion: string | null;
}

/** User preferences, stored by the browser or webview under `SETTINGS_STORAGE_KEY`. */
export interface Settings {
  version: 1;
  appearance: AppearanceSettings;
  editor: EditorSettings;
  files: FileSettings;
  updates: UpdateSettings;
  /**
   * The user's keyboard shortcut choices: the whole list of keys of each command whose list differs
   * from its default, by command id. Read as stored; which commands and keys apply is settled when
   * the commands are built.
   */
  shortcuts: Readonly<Record<string, readonly string[]>>;
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

export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = { checkAtStartup: false, dismissedVersion: null };

/** Longer than any version Vista publishes, such as `1.2.3-beta.4`, and short enough to bound a damaged store. */
const MAX_VERSION_LENGTH = 64;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  appearance: DEFAULT_APPEARANCE_SETTINGS,
  editor: DEFAULT_EDITOR_SETTINGS,
  files: DEFAULT_FILE_SETTINGS,
  updates: DEFAULT_UPDATE_SETTINGS,
  shortcuts: {},
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
  return {
    version: 1,
    appearance: parseAppearanceSettings(value.appearance),
    editor: parseEditorSettings(value.editor),
    files: parseFileSettings(value.files),
    updates: parseUpdateSettings(value.updates),
    shortcuts: parseShortcutSettings(value.shortcuts),
  };
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

function parseUpdateSettings(value: unknown): UpdateSettings {
  if (!isRecord(value)) {
    return DEFAULT_UPDATE_SETTINGS;
  }
  const { checkAtStartup, dismissedVersion } = value;
  return {
    checkAtStartup: typeof checkAtStartup === "boolean" ? checkAtStartup : DEFAULT_UPDATE_SETTINGS.checkAtStartup,
    dismissedVersion:
      typeof dismissedVersion === "string" && dismissedVersion !== "" && dismissedVersion.length <= MAX_VERSION_LENGTH
        ? dismissedVersion
        : DEFAULT_UPDATE_SETTINGS.dismissedVersion,
  };
}

/** Keeps each entry that is a list, and in it each key that is a non-empty string. */
function parseShortcutSettings(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, keys]) =>
      Array.isArray(keys) ? [[id, keys.filter((key): key is string => typeof key === "string" && key !== "")]] : [],
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
