import { createTheme } from "@codenhub/theme";
import { useSyncExternalStore } from "react";

type ThemeName = "light" | "dark";

/** The theme the user chose: one of the two, or whatever the operating system uses. */
export type ThemePreference = ThemeName | "system";

/** The theme shown and the choice behind it. */
export interface ThemeState {
  /** The theme in effect now. */
  theme: ThemeName;
  /** What the user chose. `"system"` follows the operating system and changes with it. */
  preference: ThemePreference;
  setPreference(preference: ThemePreference): void;
}

function createVistaTheme() {
  return createTheme({
    attribute: "data-theme",
    storageKey: "vista-theme",
    defaultTheme: "dark",
    darkClass: true,
    className: true,
    systemTheme: { light: "light", dark: "dark" },
    themes: {
      dark: { colorScheme: "dark", pairedTheme: "light" },
      light: { colorScheme: "light", pairedTheme: "dark" },
    },
  });
}

let globalTheme: ReturnType<typeof createVistaTheme> | null = null;

/**
 * Initializes or retrieves the singleton @codenhub/theme instance for Vista.
 *
 * @returns Configured Theme instance.
 */
export function getThemeInstance() {
  if (!globalTheme) {
    globalTheme = createVistaTheme();
    if (typeof window !== "undefined") {
      globalTheme.init();
    }
  }
  return globalTheme;
}

const getThemeName = (): ThemeName => getThemeInstance().name;
const getServerThemeName = (): ThemeName => "dark";
// No stored preference means the theme follows the system, which is how @codenhub/theme starts.
const getPreference = (): ThemePreference => getThemeInstance().preference ?? "system";
const getServerPreference = (): ThemePreference => "system";

function setPreference(preference: ThemePreference): void {
  const instance = getThemeInstance();
  if (preference === "system") {
    instance.clearPreference();
  } else {
    instance.set(preference);
  }
}

/**
 * React hook that connects components to the theme state and listener.
 *
 * @returns The active theme, the user's choice, and a setter for that choice.
 */
export function useTheme(): ThemeState {
  const instance = getThemeInstance();
  const theme = useSyncExternalStore(instance.subscribe, getThemeName, getServerThemeName);
  const preference = useSyncExternalStore(instance.subscribe, getPreference, getServerPreference);
  return { theme, preference, setPreference };
}
