import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import type { UpdaterCapability } from "@vista/app";

/**
 * Checks the release source named in `tauri.conf.json` for a newer, signed version.
 *
 * @returns The desktop updater capability.
 */
/**
 * Reads the manifest's translated summaries, keeping only text by locale.
 *
 * @param value - The manifest's `vista_notes`, as served.
 * @returns The summaries by locale, or undefined when there are none.
 */
export function readNotesByLocale(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const notes = Object.fromEntries(
    Object.entries(value).flatMap(([locale, text]) =>
      typeof text === "string" && text.trim() !== "" ? [[locale, text.trim()]] : [],
    ),
  );
  return Object.keys(notes).length > 0 ? notes : undefined;
}

export function createNativeUpdaterAdapter(): UpdaterCapability {
  return {
    async check() {
      const update = await check();
      if (!update) {
        return null;
      }
      return {
        version: update.version,
        // The manifest's `notes`, which the release writes from the version's changelog entry.
        notes: update.body?.trim() || undefined,
        // The manifest's `vista_notes`, which the release writes from the translated entries. The updater
        // does not know the field, so it is read from the manifest as served.
        notesByLocale: readNotesByLocale(update.rawJson.vista_notes),
        async install() {
          // The signature is verified against the public key in `tauri.conf.json` before anything installs.
          await update.downloadAndInstall();
          // On Windows the installer has already ended the app; on Linux the new AppImage needs a restart.
          await relaunch();
        },
      };
    },
  };
}
