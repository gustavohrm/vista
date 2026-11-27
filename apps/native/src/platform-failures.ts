import type { PlatformFailures } from "@vista/app";

/**
 * The Tauri plugins reject with a string, which ends in the operating system's error for a filesystem
 * failure, such as `(os error 2)`: ENOENT on Linux, ERROR_FILE_NOT_FOUND on Windows. A path outside the
 * granted scope is refused by the filesystem plugin as a `forbidden path`.
 */
export const NATIVE_FAILURES: PlatformFailures = {
  patterns: [
    [/\(os error (?:2|3)\)/, "not-found"],
    [/\(os error (?:5|13)\)|forbidden path/i, "permission-denied"],
    [/\(os error (?:17|80|183)\)/, "already-exists"],
  ],
};
