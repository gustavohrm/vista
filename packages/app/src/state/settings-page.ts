import type { SettingsSection } from "../components/settings/settings-page";

/** Where Settings was, so a reload of the window comes back to it. */
export interface SettingsPage {
  section: SettingsSection;
  /** The workspace whose page shows while the section is "workspaces". */
  workspaceId: string | null;
}

const STORAGE_KEY = "vista.settingsPage";
const SECTIONS: readonly SettingsSection[] = ["workspaces", "appearance", "editor", "files", "shortcuts", "about"];

/**
 * Reads the Settings page this window last showed, or `null` when Settings was closed. It is kept in
 * `sessionStorage`, so it lasts through a reload but not into a new window or the next start.
 */
export function loadSettingsPage(): SettingsPage | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof value !== "object" || value === null) {
      return null;
    }
    const { section, workspaceId } = value as Record<string, unknown>;
    const known = SECTIONS.find((candidate) => candidate === section);
    if (known === undefined) {
      return null;
    }
    return { section: known, workspaceId: typeof workspaceId === "string" ? workspaceId : null };
  } catch {
    // Blocked storage or a damaged value: Settings starts closed.
    return null;
  }
}

/** Remembers the shown Settings page, or forgets it with `null` as Settings closes. */
export function saveSettingsPage(page: SettingsPage | null): void {
  try {
    if (page === null) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(page));
    }
  } catch {
    // Blocked storage: Settings is simply not remembered through a reload.
  }
}
