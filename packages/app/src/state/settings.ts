import { useCallback, useState } from "react";

import { parseSettings, SETTINGS_STORAGE_KEY, type EditorSettings, type Settings } from "../domain/settings";

/**
 * Holds the user's settings, loaded from local storage once and written back on every change.
 * Storage can be unavailable, such as in some private windows; settings then last for the session.
 *
 * @returns The settings and a function that changes some editor settings.
 */
export function useSettings(): [Settings, (changes: Partial<EditorSettings>) => void] {
  const [settings, setSettings] = useState(loadSettings);

  const updateEditorSettings = useCallback((changes: Partial<EditorSettings>) => {
    setSettings((previous) => {
      const next: Settings = { ...previous, editor: { ...previous.editor, ...changes } };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.error("Failed to save settings:", err);
      }
      return next;
    });
  }, []);

  return [settings, updateEditorSettings];
}

function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return parseSettings(null);
  }
}
