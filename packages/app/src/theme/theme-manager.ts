import { createTheme, type ThemeDefinition } from "@codenhub/theme";
import { useSyncExternalStore } from "react";

import { DEFAULT_THEME, THEMES, type SchemePreference, type ThemeId } from "../domain/appearance";

/** A theme in one scheme, such as `ocean-dark`: what `@codenhub/theme` stores and applies. */
type VariantName = `${ThemeId}-${"light" | "dark"}`;

/** The theme shown and the choices behind it. */
export interface ThemeState {
  /** The theme the user chose, or Daylight when they never chose one. */
  theme: ThemeId;
  /** Whether the interface is light or dark now. */
  colorScheme: "light" | "dark";
  /** What the user chose for the scheme. `"system"` follows the operating system and changes with it. */
  scheme: SchemePreference;
  /** Chooses a theme and keeps the scheme. */
  setTheme(theme: ThemeId): void;
  /** Chooses a scheme and keeps the theme. */
  setScheme(scheme: SchemePreference): void;
}

const variant = (theme: ThemeId, scheme: "light" | "dark"): VariantName => `${theme}-${scheme}`;

function themeOf(name: VariantName): ThemeId {
  return name.slice(0, name.lastIndexOf("-")) as ThemeId;
}

function createVistaTheme() {
  const themes = {} as Record<VariantName, ThemeDefinition<VariantName>>;
  for (const { id } of THEMES) {
    themes[variant(id, "light")] = { colorScheme: "light", pairedTheme: variant(id, "dark") };
    themes[variant(id, "dark")] = { colorScheme: "dark", pairedTheme: variant(id, "light") };
  }
  return createTheme({
    attribute: "data-theme",
    storageKey: "vista-theme",
    defaultTheme: variant(DEFAULT_THEME, "dark"),
    darkClass: true,
    // `theme-ocean`, not `theme-ocean-dark`: one block of `light-dark()` tokens covers both variants,
    // and the `color-scheme` the package sets picks the half.
    className: (active) => `theme-${themeOf(active.name)}`,
    systemTheme: { light: variant(DEFAULT_THEME, "light"), dark: variant(DEFAULT_THEME, "dark") },
    themes,
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

/** What `useTheme` reads, kept as one object per change so it can serve as a store snapshot. */
interface Snapshot {
  name: VariantName;
  preference: VariantName | null;
  followsSystem: boolean;
}

let snapshot: Snapshot | null = null;

function getSnapshot(): Snapshot {
  const { name, preference, followsSystem } = getThemeInstance();
  if (
    !snapshot ||
    snapshot.name !== name ||
    snapshot.preference !== preference ||
    snapshot.followsSystem !== followsSystem
  ) {
    snapshot = { name, preference, followsSystem };
  }
  return snapshot;
}

const SERVER_SNAPSHOT: Snapshot = { name: variant(DEFAULT_THEME, "dark"), preference: null, followsSystem: false };
const getServerSnapshot = () => SERVER_SNAPSHOT;

function setTheme(theme: ThemeId): void {
  const instance = getThemeInstance();
  const scheme = getScheme(getSnapshot());
  if (scheme === "system") {
    instance.set(variant(theme, "light"), { followSystem: true });
  } else {
    instance.set(variant(theme, scheme));
  }
}

function setScheme(scheme: SchemePreference): void {
  const instance = getThemeInstance();
  const theme = themeOf(getSnapshot().name);
  if (scheme === "system") {
    if (theme === DEFAULT_THEME) {
      // The default following the system is what no saved choice means, so nothing is kept.
      instance.clearPreference();
    } else {
      instance.set(variant(theme, "light"), { followSystem: true });
    }
  } else {
    instance.set(variant(theme, scheme));
  }
}

function getScheme({ preference, followsSystem }: Snapshot): SchemePreference {
  // No saved choice, or one that no longer exists, is Daylight following the system.
  if (preference === null || followsSystem) {
    return "system";
  }
  return getThemeInstance().get().colorScheme;
}

/**
 * React hook that connects components to the theme state and listener.
 *
 * @returns The theme and scheme in effect, the user's choices, and setters for them.
 */
export function useTheme(): ThemeState {
  const instance = getThemeInstance();
  const current = useSyncExternalStore(instance.subscribe, getSnapshot, getServerSnapshot);
  return {
    theme: themeOf(current.name),
    colorScheme: current.name.endsWith("-dark") ? "dark" : "light",
    scheme: getScheme(current),
    setTheme,
    setScheme,
  };
}
