import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import type { UpdaterCapability } from "@vista/app";

/**
 * Checks the release source named in `tauri.conf.json` for a newer, signed version.
 *
 * @returns The desktop updater capability.
 */
export function createNativeUpdaterAdapter(): UpdaterCapability {
  return {
    async check() {
      const update = await check();
      if (!update) {
        return null;
      }
      return {
        version: update.version,
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
