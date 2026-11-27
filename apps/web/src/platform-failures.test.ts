import { classifyWorkspaceFailures, WorkspaceError, type WorkspaceCapability } from "@vista/app";
import { describe, expect, it } from "vitest";

import { WEB_FAILURES } from "./platform-failures";

function kindOf(rejection: unknown): Promise<unknown> {
  const capability = { forgetFolder: async () => Promise.reject(rejection) } as unknown as WorkspaceCapability;
  return classifyWorkspaceFailures(capability, WEB_FAILURES)
    .forgetFolder("id")
    .catch((error: unknown) => (error instanceof WorkspaceError ? error.kind : error));
}

describe("WEB_FAILURES", () => {
  it.each([
    ["NotAllowedError", "permission-denied"],
    ["SecurityError", "permission-denied"],
    ["NotReadableError", "permission-denied"],
    ["NotFoundError", "not-found"],
    ["NotSupportedError", "unsupported"],
    ["QuotaExceededError", "unknown"],
  ])("reads a %s as %s", async (name, kind) => {
    await expect(kindOf(new DOMException("The platform's own words.", name))).resolves.toBe(kind);
  });
});
