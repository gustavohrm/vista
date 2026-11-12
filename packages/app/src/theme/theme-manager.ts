import { createTheme } from "@codenhub/theme";
import { useSyncExternalStore } from "react";

import type { ThemeCapability } from "../ports";

type ThemeName = ThemeCapability["theme"];

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

/**
 * React hook that connects components to the theme state and listener.
 *
 * @returns An object containing the active theme and toggle/set methods.
 */
export function useTheme(): ThemeCapability {
  const instance = getThemeInstance();
  const theme = useSyncExternalStore(instance.subscribe, getThemeName, getServerThemeName);
  return { theme, setTheme: instance.set, toggleTheme: instance.toggle };
}
