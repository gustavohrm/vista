import type { PlatformFailures } from "@vista/app";

/**
 * The platform failures of the desktop app on one operating system. The Tauri plugins reject with a
 * string, which ends in the operating system's error for a filesystem failure, such as `(os error 2)`.
 * The numbers differ between systems: 5 is ERROR_ACCESS_DENIED on Windows but EIO on Linux and macOS,
 * and 17 is EEXIST there but ERROR_NOT_SAME_DEVICE on Windows, so each system has its own patterns. A
 * path outside the granted scope is refused by the filesystem plugin as a `forbidden path` on every one.
 *
 * @param isWindows - Whether the app runs on Windows, rather than on a Unix system.
 * @returns The failures the native adapter recognizes on that system.
 */
export function nativeFailures(isWindows: boolean): PlatformFailures {
  const forbidden = [/forbidden path/i, "permission-denied"] as const;
  return {
    patterns: isWindows
      ? [
          // ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND; ERROR_ACCESS_DENIED; ERROR_FILE_EXISTS, ERROR_ALREADY_EXISTS.
          [/\(os error (?:2|3)\)/, "not-found"],
          [/\(os error 5\)/, "permission-denied"],
          [/\(os error (?:80|183)\)/, "already-exists"],
          forbidden,
        ]
      : [
          // ENOENT; EPERM, EACCES; EEXIST.
          [/\(os error 2\)/, "not-found"],
          [/\(os error (?:1|13)\)/, "permission-denied"],
          [/\(os error 17\)/, "already-exists"],
          forbidden,
        ],
  };
}

export const NATIVE_FAILURES: PlatformFailures = nativeFailures(import.meta.env.TAURI_ENV_PLATFORM === "windows");
