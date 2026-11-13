import { describe, expect, it } from "vitest";

import type { Workspace } from "../ports";
import { createMemoryWorkspace } from "../test-support/memory-workspace";
import { loadFile } from "./load-file";

const WORKSPACE: Workspace = { id: "w", name: "w", rootPath: "/w" };

describe("loadFile", () => {
  it("reports a file that does not exist", async () => {
    const capability = createMemoryWorkspace({});

    await expect(loadFile(capability, { workspace: WORKSPACE, path: "gone.md", maxBytes: 100 })).resolves.toEqual({
      kind: "missing",
    });
  });

  it("refuses a file over the limit without reading it", async () => {
    const capability = createMemoryWorkspace({ "big.txt": "12345" });

    await expect(loadFile(capability, { workspace: WORKSPACE, path: "big.txt", maxBytes: 4 })).resolves.toEqual({
      kind: "too-large",
      size: 5,
    });
    expect(capability.readFile).not.toHaveBeenCalled();
  });

  it("refuses a file that grew past the limit between the size check and the read", async () => {
    const capability = createMemoryWorkspace(
      { "log.txt": "1234" },
      {
        overrides: {
          readFile: async () => ({ bytes: new TextEncoder().encode("123456"), stat: { size: 6, modifiedAt: 2 } }),
        },
      },
    );

    await expect(loadFile(capability, { workspace: WORKSPACE, path: "log.txt", maxBytes: 4 })).resolves.toEqual({
      kind: "too-large",
      size: 6,
    });
  });

  it("opens a file exactly at the limit", async () => {
    const capability = createMemoryWorkspace({ "edge.txt": "1234" });

    await expect(loadFile(capability, { workspace: WORKSPACE, path: "edge.txt", maxBytes: 4 })).resolves.toMatchObject({
      kind: "loaded",
      file: { content: "1234" },
    });
  });

  it("refuses a binary file", async () => {
    const capability = createMemoryWorkspace({ "a.bin": new Uint8Array([1, 0, 2]) });

    await expect(loadFile(capability, { workspace: WORKSPACE, path: "a.bin", maxBytes: 100 })).resolves.toEqual({
      kind: "binary",
    });
  });

  it("opens text that isn't UTF-8 read-only", async () => {
    const capability = createMemoryWorkspace({ "legacy.txt": new Uint8Array([0x63, 0xe9]) });

    await expect(
      loadFile(capability, { workspace: WORKSPACE, path: "legacy.txt", maxBytes: 100 }),
    ).resolves.toMatchObject({ kind: "loaded", file: { isReadOnly: true, hasBom: false } });
  });

  it("opens UTF-8 text with the version read and whether it had a byte order mark", async () => {
    const capability = createMemoryWorkspace({ "bom.txt": new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x69]) });
    const stat = await capability.stat(WORKSPACE, "bom.txt");

    await expect(loadFile(capability, { workspace: WORKSPACE, path: "bom.txt", maxBytes: 100 })).resolves.toEqual({
      kind: "loaded",
      file: { content: "Hi", stat, hasBom: true, isReadOnly: false },
    });
  });
});
