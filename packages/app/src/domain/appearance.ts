/**
 * The appearance preferences: scheme, theme, contrast, and motion. `docs/specs/appearance.md` defines
 * each one, how it is stored, and how it is applied.
 */

/** Whether the interface is light or dark. `"system"` follows the operating system. */
export type SchemePreference = "system" | "light" | "dark";

/**
 * The themes, in the order Settings shows them. Each has a light and a dark variant, which is what
 * lets `"system"` work with any of them. Their names are in the dictionaries, under `appearance.themes`.
 */
export const THEMES = [
  { id: "daylight" },
  { id: "neutral" },
  { id: "midnight" },
  { id: "ocean" },
  { id: "forest" },
  { id: "ember" },
  { id: "cappuccino" },
] as const;

/** A theme's id, as it appears in its variants' names and in its `theme-<id>` class. */
export type ThemeId = (typeof THEMES)[number]["id"];

/** The theme a user who never chose sees, and the one an unknown saved theme falls back to. */
export const DEFAULT_THEME: ThemeId = "daylight";

/** How much contrast the interface uses. `"system"` follows the operating system. */
export type ContrastPreference = "system" | "standard" | "more";

/** How much the interface moves. `"system"` is `"all"`, or `"reduced"` when the operating system asks for less. */
export type MotionPreference = "system" | "all" | "reduced" | "none";

/** The values written to `data-contrast`, as `@codenhub/styles` reads them. */
export type ContrastLevel = "standard" | "more";

/** The values written to `data-motion`, as `@codenhub/styles` reads them. */
export type MotionLevel = "full" | "reduce" | "none";

/** The appearance preferences saved with the other settings; the scheme and theme are saved by `@codenhub/theme`. */
export interface AppearanceSettings {
  contrast: ContrastPreference;
  motion: MotionPreference;
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  contrast: "system",
  motion: "system",
};

const CONTRAST_PREFERENCES: readonly ContrastPreference[] = ["system", "standard", "more"];
const MOTION_PREFERENCES: readonly MotionPreference[] = ["system", "all", "reduced", "none"];

/**
 * Reads stored appearance settings, falling back to the default field by field.
 *
 * @param value - The stored `appearance` value, of any shape.
 * @returns Complete appearance settings.
 */
export function parseAppearanceSettings(value: unknown): AppearanceSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_APPEARANCE_SETTINGS;
  }
  const { contrast, motion } = value as Record<string, unknown>;
  return {
    contrast: CONTRAST_PREFERENCES.includes(contrast as ContrastPreference)
      ? (contrast as ContrastPreference)
      : DEFAULT_APPEARANCE_SETTINGS.contrast,
    motion: MOTION_PREFERENCES.includes(motion as MotionPreference)
      ? (motion as MotionPreference)
      : DEFAULT_APPEARANCE_SETTINGS.motion,
  };
}

/**
 * Resolves the contrast preference to the level CSS reads.
 *
 * @param preference - What the user chose.
 * @param systemWantsMore - Whether the operating system asks for more contrast.
 * @returns The level to apply.
 */
export function resolveContrast(preference: ContrastPreference, systemWantsMore: boolean): ContrastLevel {
  if (preference === "system") {
    return systemWantsMore ? "more" : "standard";
  }
  return preference;
}

/**
 * Resolves the motion preference to the level CSS reads. The operating system's setting is on or
 * off, so `"system"` never resolves to `"none"`.
 *
 * @param preference - What the user chose.
 * @param systemWantsLess - Whether the operating system asks for reduced motion.
 * @returns The level to apply.
 */
export function resolveMotion(preference: MotionPreference, systemWantsLess: boolean): MotionLevel {
  switch (preference) {
    case "system":
      return systemWantsLess ? "reduce" : "full";
    case "all":
      return "full";
    case "reduced":
      return "reduce";
    case "none":
      return "none";
  }
}
