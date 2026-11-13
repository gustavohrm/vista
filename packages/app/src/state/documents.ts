import { normalizeExtension } from "../domain/file-types";
import { getViewer, resolveViewMode } from "../domain/viewers";
import type { FileDocument, FileStat, ViewMode } from "../ports";

/** A file as read from disk and decoded, ready to show in a tab. */
export interface LoadedFile {
  content: string;
  /** The version on disk that `content` came from. */
  stat: FileStat;
  /** Whether the file starts with a UTF-8 byte-order mark, which saving writes back. */
  hasBom: boolean;
  /** True when the text could not be decoded as UTF-8, so saving it would change characters. */
  isReadOnly: boolean;
}

/** What another program did to an open file since Vista last read or wrote it. */
export type ExternalChange = "changed" | "deleted";

/** An open tab: a document buffer plus which workspace it belongs to and how it is shown. */
export interface OpenDocument extends FileDocument {
  /** Unique across workspaces, so several roots can have files at the same relative path. */
  key: string;
  workspaceId: string;
  viewMode: ViewMode;
  /** The version on disk the buffer was last read from or written to. Saving expects it. */
  diskStat: FileStat;
  hasBom: boolean;
  isReadOnly: boolean;
  externalChange: ExternalChange | null;
  /** Counts reloads from disk, so views that own their copy of the text start over. */
  revision: number;
}

export interface DocumentsState {
  /** Open documents in tab order. */
  documents: OpenDocument[];
  activeKey: string | null;
}

/** A workspace-relative path in one workspace. */
export interface WorkspaceEntryRef {
  workspaceId: string;
  path: string;
}

export type DocumentsAction =
  | { type: "open"; workspaceId: string; path: string; file: LoadedFile }
  | { type: "activate"; key: string }
  | { type: "close"; keys: string[] }
  | { type: "edit"; key: string; content: string }
  | { type: "saved"; key: string; content: string; stat: FileStat }
  | { type: "diskChanged"; key: string; stat: FileStat | null }
  // `expected` is the version the reload started from; a save during the read makes the result stale.
  | { type: "reloaded"; key: string; expected: FileStat; file: LoadedFile }
  | { type: "setViewMode"; key: string; viewMode: ViewMode }
  | { type: "move"; workspaceId: string; fromPath: string; toPath: string };

export const INITIAL_DOCUMENTS_STATE: DocumentsState = { documents: [], activeKey: null };

export function documentKey(workspaceId: string, path: string): string {
  return `${workspaceId}:${path}`;
}

export function getActiveDocument(state: DocumentsState): OpenDocument | null {
  return state.documents.find((doc) => doc.key === state.activeKey) ?? null;
}

/** Documents at an entry's path or inside it, in tab order. */
export function findAffectedDocuments(state: DocumentsState, entry: WorkspaceEntryRef): OpenDocument[] {
  return state.documents.filter((doc) => doc.workspaceId === entry.workspaceId && isSameOrInside(doc.path, entry.path));
}

export function documentsReducer(state: DocumentsState, action: DocumentsAction): DocumentsState {
  switch (action.type) {
    case "open":
      return openDocument(state, action);
    case "activate":
      return state.documents.some((doc) => doc.key === action.key) ? { ...state, activeKey: action.key } : state;
    case "close":
      return closeDocuments(state, new Set(action.keys));
    case "edit":
      return updateDocument(state, action.key, (doc) =>
        doc.content === action.content || doc.isReadOnly ? doc : { ...doc, content: action.content, isDirty: true },
      );
    case "saved":
      // The buffer may have changed while the write was in flight; only what was written is clean.
      return updateDocument(state, action.key, (doc) => ({
        ...doc,
        isDirty: doc.content !== action.content,
        diskStat: action.stat,
        externalChange: null,
      }));
    case "diskChanged":
      return updateDocument(state, action.key, (doc) => {
        // A check can finish after a save already recorded the version it saw.
        if (action.stat !== null && isSameStat(action.stat, doc.diskStat)) {
          return doc;
        }
        const externalChange = action.stat === null ? "deleted" : "changed";
        return doc.externalChange === externalChange ? doc : { ...doc, externalChange };
      });
    case "reloaded":
      return updateDocument(state, action.key, (doc) => {
        if (!isSameStat(action.expected, doc.diskStat)) {
          return doc;
        }
        return doc.isDirty
          ? { ...doc, externalChange: "changed" }
          : {
              ...doc,
              content: action.file.content,
              diskStat: action.file.stat,
              hasBom: action.file.hasBom,
              isReadOnly: action.file.isReadOnly,
              viewMode: action.file.isReadOnly ? "raw" : doc.viewMode,
              externalChange: null,
              revision: doc.revision + 1,
            };
      });
    case "setViewMode":
      return updateDocument(state, action.key, (doc) => ({
        ...doc,
        viewMode: doc.isReadOnly ? "raw" : resolveViewMode(doc.extension, action.viewMode),
      }));
    case "move":
      return moveDocuments(state, action);
  }
}

export function isSameStat(a: FileStat, b: FileStat): boolean {
  return a.size === b.size && a.modifiedAt === b.modifiedAt;
}

function openDocument(
  state: DocumentsState,
  { workspaceId, path, file }: { workspaceId: string; path: string; file: LoadedFile },
): DocumentsState {
  const key = documentKey(workspaceId, path);
  if (state.documents.some((doc) => doc.key === key)) {
    return { ...state, activeKey: key };
  }
  const name = baseName(path);
  const extension = normalizeExtension(name);
  const opened: OpenDocument = {
    key,
    workspaceId,
    path,
    name,
    extension,
    content: file.content,
    isDirty: false,
    // Only the raw editor can show a read-only buffer.
    viewMode: file.isReadOnly ? "raw" : getViewer(extension).defaultMode,
    diskStat: file.stat,
    hasBom: file.hasBom,
    isReadOnly: file.isReadOnly,
    externalChange: null,
    revision: 0,
  };
  const activeIndex = state.documents.findIndex((doc) => doc.key === state.activeKey);
  const insertAt = activeIndex === -1 ? state.documents.length : activeIndex + 1;
  return {
    documents: [...state.documents.slice(0, insertAt), opened, ...state.documents.slice(insertAt)],
    activeKey: key,
  };
}

function closeDocuments(state: DocumentsState, keys: ReadonlySet<string>): DocumentsState {
  const documents = state.documents.filter((doc) => !keys.has(doc.key));
  if (documents.length === state.documents.length) {
    return state;
  }
  if (state.activeKey === null || !keys.has(state.activeKey)) {
    return { ...state, documents };
  }
  const activeIndex = state.documents.findIndex((doc) => doc.key === state.activeKey);
  const nextActive =
    state.documents.slice(activeIndex + 1).find((doc) => !keys.has(doc.key)) ??
    state.documents
      .slice(0, activeIndex)
      .reverse()
      .find((doc) => !keys.has(doc.key));
  return { documents, activeKey: nextActive?.key ?? null };
}

function updateDocument(
  state: DocumentsState,
  key: string,
  update: (doc: OpenDocument) => OpenDocument,
): DocumentsState {
  let hasChanged = false;
  const documents = state.documents.map((doc) => {
    if (doc.key !== key) {
      return doc;
    }
    const updated = update(doc);
    hasChanged ||= updated !== doc;
    return updated;
  });
  return hasChanged ? { ...state, documents } : state;
}

function moveDocuments(
  state: DocumentsState,
  { workspaceId, fromPath, toPath }: { workspaceId: string; fromPath: string; toPath: string },
): DocumentsState {
  let activeKey = state.activeKey;
  const documents = state.documents.map((doc) => {
    if (doc.workspaceId !== workspaceId || !isSameOrInside(doc.path, fromPath)) {
      return doc;
    }
    const path = toPath + doc.path.slice(fromPath.length);
    const name = baseName(path);
    const extension = normalizeExtension(name);
    const key = documentKey(workspaceId, path);
    if (doc.key === state.activeKey) {
      activeKey = key;
    }
    return { ...doc, key, path, name, extension, viewMode: resolveViewMode(extension, doc.viewMode) };
  });
  return { documents, activeKey };
}

function isSameOrInside(path: string, entryPath: string): boolean {
  return path === entryPath || path.startsWith(`${entryPath}/`);
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}
