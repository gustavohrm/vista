import { decodeText } from "../domain/text-codec";
import type { Workspace, WorkspaceCapability } from "../ports";
import type { LoadedFile } from "./documents";

export type LoadFileResult =
  | { kind: "loaded"; file: LoadedFile }
  | { kind: "missing" }
  | { kind: "too-large"; size: number }
  | { kind: "binary" };

/**
 * Reads a file for a tab. The size is checked before reading, so a file over the limit is never
 * read into memory, and again after, in case it grew in between.
 */
export async function loadFile(
  capability: WorkspaceCapability,
  { workspace, path, maxBytes }: { workspace: Workspace; path: string; maxBytes: number },
): Promise<LoadFileResult> {
  const stat = await capability.stat(workspace, path);
  if (stat === null) {
    return { kind: "missing" };
  }
  if (stat.size > maxBytes) {
    return { kind: "too-large", size: stat.size };
  }
  const contents = await capability.readFile(workspace, path);
  if (contents.bytes.length > maxBytes) {
    return { kind: "too-large", size: contents.bytes.length };
  }
  const decoded = decodeText(contents.bytes);
  switch (decoded.kind) {
    case "binary":
      return { kind: "binary" };
    case "read-only":
      return { kind: "loaded", file: { content: decoded.text, stat: contents.stat, hasBom: false, isReadOnly: true } };
    case "text":
      return {
        kind: "loaded",
        file: { content: decoded.text, stat: contents.stat, hasBom: decoded.hasBom, isReadOnly: false },
      };
  }
}
