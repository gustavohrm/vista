import type { PlatformFailures } from "@vista/app";

/**
 * The File System Access API reports its failures as `DOMException`s, which name the failure.
 * `NotReadableError` is a file the operating system refused to read after the handle was granted.
 */
export const WEB_FAILURES: PlatformFailures = {
  names: {
    NotAllowedError: "permission-denied",
    SecurityError: "permission-denied",
    NotReadableError: "permission-denied",
    NotFoundError: "not-found",
    NotSupportedError: "unsupported",
  },
};
