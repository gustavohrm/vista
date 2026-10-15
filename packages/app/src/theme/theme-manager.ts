import { createTheme, type Theme } from "@codenhub/theme";
import { useEffect, useState } from "react";

import type { ThemeCapability } from "../ports";

let globalTheme: Theme | null = null;

/**
 * Initializes or retrieves the singleton @codenhub/theme instance for Vista.
 *
 * @returns Configured Theme instance.
 */
export function getThemeInstance(): Theme {
  if (!globalTheme) {
    globalTheme = createTheme({
      attribute: "data-theme",
      storageKey: "vista-theme",
      defaultTheme: "dark",
      isTailwindCss: true,
      shouldApplyClass: true,
      systemTheme: {
        light: "light",
        dark: "dark",
      },
      themes: [
        { name: "dark", colorScheme: "dark", pairedTheme: "light" },
        { name: "light", colorScheme: "light", pairedTheme: "dark" },
      ],
    });
    if (typeof window !== "undefined") {
      globalTheme.init();
    }
  }
  return globalTheme;
}

/**
 * React hook that connects components to the theme state and listener.
 *
 * @returns An object containing the active theme and toggle/set methods.
 */
export function useTheme(): ThemeCapability {
  const [themeName, setThemeName] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    const instance = getThemeInstance();
    return instance.get().name === "light" ? "light" : "dark";
  });

  useEffect(() => {
    const instance = getThemeInstance();
    const unsubscribe = instance.subscribe((detail) => {
      setThemeName(detail.name === "light" ? "light" : "dark");
    });
    return unsubscribe;
  }, []);

  const setTheme = (theme: "light" | "dark") => {
    const instance = getThemeInstance();
    instance.set(theme);
  };

  const toggleTheme = () => {
    const instance = getThemeInstance();
    instance.toggle();
  };

  return {
    theme: themeName,
    setTheme,
    toggleTheme,
  };
}
