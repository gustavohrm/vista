import { classifyWorkspaceFailures, WorkspaceError, type WorkspaceCapability } from "@vista/app";
import { describe, expect, it } from "vitest";

import { NATIVE_FAILURES } from "./platform-failures";

// The Tauri filesystem plugin rejects with a string; these are its shapes on Windows and Linux.
function kindOf(rejection: string): Promise<unknown> {
  const capability = { forgetFolder: async () => Promise.reject(rejection) } as unknown as WorkspaceCapability;
  return classifyWorkspaceFailures(capability, NATIVE_FAILURES)
    .forgetFolder("id")
    .catch((error: unknown) => (error instanceof WorkspaceError ? error.kind : error));
}

describe("NATIVE_FAILURES", () => {
  it.each([
    [
      "failed to open file at path: C:/notes/a.md with error: The system cannot find the file specified. (os error 2)",
      "not-found",
    ],
    [
      "failed to read directory at path: C:/gone with error: The system cannot find the path specified. (os error 3)",
      "not-found",
    ],
    [
      "failed to open file at path: /home/me/notes/a.md with error: No such file or directory (os error 2)",
      "not-found",
    ],
    ["failed to open file at path: C:/notes/a.md with error: Access is denied. (os error 5)", "permission-denied"],
    [
      "failed to open file at path: /home/me/notes/a.md with error: Permission denied (os error 13)",
      "permission-denied",
    ],
    ["forbidden path: /etc/passwd", "permission-denied"],
    ["failed to create directory at path: /home/me/notes/x with error: File exists (os error 17)", "already-exists"],
    [
      "failed to create directory: Cannot create a file when that file already exists. (os error 183)",
      "already-exists",
    ],
    ["failed to write file: The disk is full. (os error 112)", "unknown"],
  ])("reads %s as %s", async (rejection, kind) => {
    await expect(kindOf(rejection)).resolves.toBe(kind);
  });
});
