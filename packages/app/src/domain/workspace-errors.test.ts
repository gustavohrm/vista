import { describe, expect, it } from "vitest";

import { WorkspaceError, type WorkspaceCapability, type WorkspaceFolder } from "../ports";
import { classifyWorkspaceFailures, createWorkspaceErrorClassifier, workspaceErrorKind } from "./workspace-errors";

describe("createWorkspaceErrorClassifier", () => {
  const classify = createWorkspaceErrorClassifier({
    names: { NotAllowedError: "permission-denied" },
    patterns: [[/\(os error 2\)/, "not-found"]],
  });

  it("names a failure by its error name", () => {
    const caught = new DOMException("The request is not allowed.", "NotAllowedError");

    const error = classify(caught);

    expect(error).toBeInstanceOf(WorkspaceError);
    expect(error.kind).toBe("permission-denied");
    expect(error.cause).toBe(caught);
  });

  it("names a thrown string by a pattern in it", () => {
    expect(classify("failed to open file: No such file or directory (os error 2)").kind).toBe("not-found");
  });

  it("reads a failure nothing recognizes as unknown, keeping its text for the console", () => {
    const error = classify(new Error("disk on fire"));

    expect(error.kind).toBe("unknown");
    expect(error.message).toBe("disk on fire");
  });

  it("returns a WorkspaceError as it is", () => {
    const thrown = new WorkspaceError("already-exists", '"a.md" already exists.');

    expect(classify(thrown)).toBe(thrown);
  });
});

describe("classifyWorkspaceFailures", () => {
  const folder: WorkspaceFolder = { id: "f", name: "notes", rootPath: "/", accessMode: "direct" };
  const capability = {
    isSupported: true,
    pickFolder: async () => folder,
    readTree: async () => Promise.reject(new DOMException("Gone.", "NotFoundError")),
  } as unknown as WorkspaceCapability;
  const wrapped = classifyWorkspaceFailures(capability, { names: { NotFoundError: "not-found" } });

  it("rejects with a classified WorkspaceError", async () => {
    await expect(wrapped.readTree(folder)).rejects.toSatisfy(
      (error) => error instanceof WorkspaceError && error.kind === "not-found",
    );
  });

  it("passes results and plain values through", async () => {
    expect(wrapped.isSupported).toBe(true);
    await expect(wrapped.pickFolder()).resolves.toBe(folder);
  });
});

describe("workspaceErrorKind", () => {
  it("is the kind of a WorkspaceError and unknown for anything else", () => {
    expect(workspaceErrorKind(new WorkspaceError("conflict", "changed"))).toBe("conflict");
    expect(workspaceErrorKind(new Error("x"))).toBe("unknown");
    expect(workspaceErrorKind("x")).toBe("unknown");
  });
});
