import { vi, type Mock } from "vitest";

import { WorkspaceError, type FileStat, type WorkspaceCapability, type WorkspaceNode } from "../ports";

type MockedCapability = {
  [Name in keyof WorkspaceCapability]: WorkspaceCapability[Name] extends (...args: infer A) => infer R
    ? Mock<(...args: A) => R>
    : WorkspaceCapability[Name];
};

/** A workspace capability over files held in memory, with the version checks a real host makes. */
export interface MemoryWorkspace extends MockedCapability {
  /** The text of a file as stored now, decoded as UTF-8, or undefined when there is none. */
  textOf(path: string): string | undefined;
  /** Changes a file as another program would, giving it a new version. */
  changeExternally(path: string, content: string | Uint8Array): void;
  deleteExternally(path: string): void;
}

interface StoredFile {
  bytes: Uint8Array<ArrayBuffer>;
  stat: FileStat;
}

/**
 * Creates a memory workspace. `tree` is what `readTree` returns; it defaults to the files, flat.
 * `overrides` replace single operations, such as one that fails.
 */
export function createMemoryWorkspace(
  files: Record<string, string | Uint8Array>,
  { tree, overrides }: { tree?: WorkspaceNode[]; overrides?: Partial<WorkspaceCapability> } = {},
): MemoryWorkspace {
  let clock = 1_000;
  const stored = new Map<string, StoredFile>();
  const put = (path: string, content: string | Uint8Array) => {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);
    clock += 1_000;
    const stat = { size: bytes.length, modifiedAt: clock };
    stored.set(path, { bytes, stat });
    return { ...stat };
  };
  for (const [path, content] of Object.entries(files)) {
    put(path, content);
  }
  const flatTree = (): WorkspaceNode[] =>
    [...stored.keys()].toSorted().map((path) => ({
      id: path,
      name: path.split("/").pop() ?? path,
      path,
      kind: "file",
      extension: path.includes(".") ? (path.split(".").pop() ?? "") : "",
    }));
  const require = (path: string) => {
    const file = stored.get(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    return file;
  };

  const capability: MockedCapability = {
    isSupported: true,
    openFolder: vi.fn(async () => ({ id: "workspace-1", name: "My Notes", rootPath: "/notes" })),
    restoreFolder: vi.fn(async () => ({ status: "none" as const })),
    readTree: vi.fn(async () => structuredClone(tree ?? flatTree())),
    stat: vi.fn(async (_workspace, path) => {
      const file = stored.get(path);
      return file ? { ...file.stat } : null;
    }),
    readFile: vi.fn(async (_workspace, path) => {
      const file = require(path);
      return { bytes: new Uint8Array(file.bytes), stat: { ...file.stat } };
    }),
    writeFile: vi.fn(async (_workspace, path, bytes, options) => {
      const expected = options?.expected;
      const current = stored.get(path);
      if (
        expected &&
        (!current || current.stat.size !== expected.size || current.stat.modifiedAt !== expected.modifiedAt)
      ) {
        throw new WorkspaceError("conflict", `"${path}" changed on disk.`);
      }
      return put(path, bytes);
    }),
    createFile: vi.fn(async (_workspace, path) => {
      if (stored.has(path)) {
        throw new Error(`"${path}" already exists.`);
      }
      put(path, "");
    }),
    createDirectory: vi.fn(async () => {}),
    move: vi.fn(async (_workspace, fromPath, toPath) => {
      // Copied first, because the loop changes the map it would otherwise be walking.
      for (const [path, file] of Array.from(stored)) {
        if (path === fromPath || path.startsWith(`${fromPath}/`)) {
          stored.delete(path);
          stored.set(toPath + path.slice(fromPath.length), file);
        }
      }
    }),
    remove: vi.fn(async (_workspace, path) => {
      for (const candidate of Array.from(stored.keys())) {
        if (candidate === path || candidate.startsWith(`${path}/`)) {
          stored.delete(candidate);
        }
      }
    }),
  };
  for (const [name, implementation] of Object.entries(overrides ?? {})) {
    const target = capability[name as keyof MockedCapability];
    if (typeof implementation === "function" && vi.isMockFunction(target)) {
      target.mockImplementation(implementation as never);
    } else {
      Object.assign(capability, { [name]: implementation });
    }
  }

  return {
    ...capability,
    textOf: (path) => {
      const file = stored.get(path);
      return file ? new TextDecoder().decode(file.bytes) : undefined;
    },
    changeExternally: (path, content) => void put(path, content),
    deleteExternally: (path) => void stored.delete(path),
  };
}

/** The text passed to each `writeFile` call for a path, in call order. */
export function writtenTexts(workspace: MemoryWorkspace, path: string): string[] {
  return workspace.writeFile.mock.calls
    .filter(([, writtenPath]) => writtenPath === path)
    .map(([, , bytes]) => new TextDecoder().decode(bytes));
}
