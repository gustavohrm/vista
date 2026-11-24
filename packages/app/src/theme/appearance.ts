import { MotionGlobalConfig } from "motion/react";
import { useEffect, useSyncExternalStore } from "react";

import {
  resolveContrast,
  resolveMotion,
  type AppearanceSettings,
  type ContrastLevel,
  type MotionLevel,
} from "../domain/appearance";
import { parseSettings, SETTINGS_STORAGE_KEY } from "../domain/settings";
import { getThemeInstance } from "./theme-manager";

const MORE_CONTRAST_QUERY = "(prefers-contrast: more)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

let preferences: AppearanceSettings | null = null;
let motionLevel: MotionLevel = "full";
const motionListeners = new Set<() => void>();
let isFollowingSystem = false;
// What the motion library was set to before Vista applied a level, such as by a test that has every
// animation finish at once; only `none` overrides it.
const skipsAnimationsByDefault = MotionGlobalConfig.skipAnimations === true;

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/**
 * Writes the resolved contrast and motion levels on `<html>`, where `@codenhub/styles` and Vista's
 * CSS read them, and tells the motion library about a `none`.
 */
function apply(): void {
  if (!preferences || typeof document === "undefined") {
    return;
  }
  const contrast: ContrastLevel = resolveContrast(preferences.contrast, matches(MORE_CONTRAST_QUERY));
  const motion: MotionLevel = resolveMotion(preferences.motion, matches(REDUCED_MOTION_QUERY));
  const root = document.documentElement;
  root.dataset.contrast = contrast;
  root.dataset.motion = motion;
  // The stylesheet reaches only CSS; the motion library animates from script. Under `reduce` each
  // animation takes its reduced form from `useReducedMotion`, and under `none` none runs at all.
  MotionGlobalConfig.skipAnimations = motion === "none" || skipsAnimationsByDefault;
  if (motion !== motionLevel) {
    motionLevel = motion;
    for (const listener of motionListeners) {
      listener();
    }
  }
}

function followSystem(): void {
  if (isFollowingSystem || typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }
  isFollowingSystem = true;
  window.matchMedia(MORE_CONTRAST_QUERY).addEventListener("change", apply);
  window.matchMedia(REDUCED_MOTION_QUERY).addEventListener("change", apply);
}

/**
 * Applies the saved appearance before the first paint: the theme, and the contrast and motion
 * levels. Hosts call it before rendering, so a reload never shows the wrong appearance first.
 */
export function initAppearance(): void {
  getThemeInstance();
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    // Storage can be unavailable, such as in some private windows; the defaults apply then.
  }
  setAppearance(parseSettings(stored).appearance);
}

/**
 * Applies contrast and motion preferences, following the operating system while either is `"system"`.
 *
 * @param next - The preferences to apply.
 */
export function setAppearance(next: AppearanceSettings): void {
  preferences = next;
  followSystem();
  apply();
}

/**
 * Applies the appearance settings whenever they change.
 *
 * @param appearance - The saved contrast and motion preferences.
 */
export function useApplyAppearance(appearance: AppearanceSettings): void {
  useEffect(() => {
    setAppearance(appearance);
  }, [appearance]);
}

function subscribeMotion(listener: () => void): () => void {
  motionListeners.add(listener);
  return () => motionListeners.delete(listener);
}

const getMotionLevel = () => motionLevel;
const getServerMotionLevel = (): MotionLevel => "full";

/**
 * Whether animations take their reduced form: under the _Reduced_ and _None_ motion settings, and
 * under _System_ when the operating system asks for reduced motion. Replaces the motion library's
 * own hook, which reads only the operating system.
 *
 * @returns True when movement should land at once.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, getMotionLevel, getServerMotionLevel) !== "full";
}
