import { classifyWorkspaceFailures, WorkspaceError, type WorkspaceCapability } from "@vista/app";
import { describe, expect, it } from "vitest";

import { nativeFailures } from "./platform-failures";

// The Tauri filesystem plugin rejects with a string; these are its shapes on Windows and Linux.
function kindOf(rejection: string, isWindows: boolean): Promise<unknown> {
  const capability = { forgetFolder: async () => Promise.reject(rejection) } as unknown as WorkspaceCapability;
  return classifyWorkspaceFailures(capability, nativeFailures(isWindows))
    .forgetFolder("id")
    .catch((error: unknown) => (error instanceof WorkspaceError ? error.kind : error));
}

describe("nativeFailures", () => {
  it.each([
    [
      "failed to open file at path: C:/notes/a.md with error: The system cannot find the file specified. (os error 2)",
      "not-found",
    ],
    [
      "failed to read directory at path: C:/gone with error: The system cannot find the path specified. (os error 3)",
      "not-found",
    ],
    ["failed to open file at path: C:/notes/a.md with error: Access is denied. (os error 5)", "permission-denied"],
    ["forbidden path: C:/Windows/system.ini", "permission-denied"],
    ["failed to create file: The file exists. (os error 80)", "already-exists"],
    [
      "failed to create directory: Cannot create a file when that file already exists. (os error 183)",
      "already-exists",
    ],
    ["failed to rename: The system cannot move the file to a different disk drive. (os error 17)", "unknown"],
    ["failed to write file: The disk is full. (os error 112)", "unknown"],
  ])("reads %s as %s on Windows", async (rejection, kind) => {
    await expect(kindOf(rejection, true)).resolves.toBe(kind);
  });

  it.each([
    [
      "failed to open file at path: /home/me/notes/a.md with error: No such file or directory (os error 2)",
      "not-found",
    ],
    [
      "failed to open file at path: /home/me/notes/a.md with error: Permission denied (os error 13)",
      "permission-denied",
    ],
    [
      "failed to open file at path: /Users/me/Documents/a.md with error: Operation not permitted (os error 1)",
      "permission-denied",
    ],
    ["forbidden path: /etc/passwd", "permission-denied"],
    ["failed to create directory at path: /home/me/notes/x with error: File exists (os error 17)", "already-exists"],
    ["failed to read file at path: /mnt/usb/a.md with error: Input/output error (os error 5)", "unknown"],
    ["failed to write file: No space left on device (os error 28)", "unknown"],
  ])("reads %s as %s on Linux and macOS", async (rejection, kind) => {
    await expect(kindOf(rejection, false)).resolves.toBe(kind);
  });
});
