import { useCallback, useState } from "react";

import {
  parseSettings,
  SETTINGS_STORAGE_KEY,
  type EditorSettings,
  type FileSettings,
  type Settings,
  type UpdateSettings,
} from "../domain/settings";

/** Changes to apply to some settings, by section. */
export interface SettingsChanges {
  editor?: Partial<EditorSettings>;
  files?: Partial<FileSettings>;
  updates?: Partial<UpdateSettings>;
}

/**
 * Holds the user's settings, loaded from local storage once and written back on every change.
 * Storage can be unavailable, such as in some private windows; settings then last for the session.
 *
 * @returns The settings and a function that changes some of them.
 */
export function useSettings(): [Settings, (changes: SettingsChanges) => void] {
  const [settings, setSettings] = useState(loadSettings);

  const updateSettings = useCallback((changes: SettingsChanges) => {
    setSettings((previous) => {
      const next: Settings = {
        ...previous,
        editor: { ...previous.editor, ...changes.editor },
        files: { ...previous.files, ...changes.files },
        updates: { ...previous.updates, ...changes.updates },
      };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.error("Failed to save settings:", err);
      }
      return next;
    });
  }, []);

  return [settings, updateSettings];
}

function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return parseSettings(null);
  }
}
