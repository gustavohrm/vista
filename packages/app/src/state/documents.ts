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

/** An open tab: a document buffer plus which folder it belongs to and how it is shown. */
export interface OpenDocument extends FileDocument {
  /** Unique across folders, so several folders can have files at the same relative path. */
  key: string;
  folderId: string;
  viewMode: ViewMode;
  /** The version on disk the buffer was last read from or written to. Saving expects it. */
  diskStat: FileStat;
  hasBom: boolean;
  isReadOnly: boolean;
  externalChange: ExternalChange | null;
  /** Counts reloads from disk, so views that own their copy of the text start over. */
  revision: number;
  /** A tab restored from the session whose file is read when the tab is first shown; until then it has no content. */
  isPending: boolean;
}

/** A tab as a session remembers it. */
export interface RestoredTab {
  folderId: string;
  path: string;
  viewMode: ViewMode;
}

export interface DocumentsState {
  /** Open documents in tab order. */
  documents: OpenDocument[];
  activeKey: string | null;
}

/** A path within one folder of the workspace. */
export interface FolderEntryRef {
  folderId: string;
  path: string;
}

export type DocumentsAction =
  | { type: "open"; folderId: string; path: string; file: LoadedFile }
  // `activeIndex` is into `tabs`, or -1; a tab activated meanwhile stays active.
  | { type: "restore"; tabs: readonly RestoredTab[]; activeIndex: number }
  | { type: "activate"; key: string }
  | { type: "close"; keys: string[] }
  | { type: "edit"; key: string; content: string }
  | { type: "saved"; key: string; content: string; stat: FileStat }
  | { type: "diskChanged"; key: string; stat: FileStat | null }
  // `expected` is the version the reload started from; a save during the read makes the result stale.
  | { type: "reloaded"; key: string; expected: FileStat; file: LoadedFile }
  | { type: "setViewMode"; key: string; viewMode: ViewMode }
  | { type: "move"; folderId: string; fromPath: string; toPath: string };

export const INITIAL_DOCUMENTS_STATE: DocumentsState = { documents: [], activeKey: null };

export function documentKey(folderId: string, path: string): string {
  return `${folderId}:${path}`;
}

export function getActiveDocument(state: DocumentsState): OpenDocument | null {
  return state.documents.find((doc) => doc.key === state.activeKey) ?? null;
}

/** Documents at an entry's path or inside it, in tab order. */
export function findAffectedDocuments(state: DocumentsState, entry: FolderEntryRef): OpenDocument[] {
  return state.documents.filter((doc) => doc.folderId === entry.folderId && isSameOrInside(doc.path, entry.path));
}

export function documentsReducer(state: DocumentsState, action: DocumentsAction): DocumentsState {
  switch (action.type) {
    case "open":
      return openDocument(state, action);
    case "restore":
      return restoreDocuments(state, action);
    case "activate":
      return state.documents.some((doc) => doc.key === action.key) ? { ...state, activeKey: action.key } : state;
    case "close":
      return closeDocuments(state, new Set(action.keys));
    case "edit":
      return updateDocument(state, action.key, (doc) =>
        doc.content === action.content || doc.isReadOnly || doc.isPending
          ? doc
          : { ...doc, content: action.content, isDirty: true },
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
        if (doc.isPending || (action.stat !== null && isSameStat(action.stat, doc.diskStat))) {
          return doc;
        }
        const externalChange = action.stat === null ? "deleted" : "changed";
        return doc.externalChange === externalChange ? doc : { ...doc, externalChange };
      });
    case "reloaded":
      return updateDocument(state, action.key, (doc) => {
        if (doc.isPending || !isSameStat(action.expected, doc.diskStat)) {
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
  { folderId, path, file }: { folderId: string; path: string; file: LoadedFile },
): DocumentsState {
  const key = documentKey(folderId, path);
  const existing = state.documents.find((doc) => doc.key === key);
  if (existing?.isPending) {
    const read = toOpenDocument({ folderId, path, file, viewMode: existing.viewMode });
    return { documents: state.documents.map((doc) => (doc === existing ? read : doc)), activeKey: key };
  }
  if (existing) {
    return { ...state, activeKey: key };
  }
  const opened = toOpenDocument({ folderId, path, file });
  const activeIndex = state.documents.findIndex((doc) => doc.key === state.activeKey);
  const insertAt = activeIndex === -1 ? state.documents.length : activeIndex + 1;
  return {
    documents: [...state.documents.slice(0, insertAt), opened, ...state.documents.slice(insertAt)],
    activeKey: key,
  };
}

function toOpenDocument({
  folderId,
  path,
  file,
  viewMode,
}: {
  folderId: string;
  path: string;
  file: LoadedFile;
  viewMode?: ViewMode;
}): OpenDocument {
  const name = baseName(path);
  const extension = normalizeExtension(name);
  return {
    key: documentKey(folderId, path),
    folderId,
    path,
    name,
    extension,
    content: file.content,
    isDirty: false,
    // Only the raw editor can show a read-only buffer.
    viewMode: file.isReadOnly ? "raw" : (viewMode ?? getViewer(extension).defaultMode),
    diskStat: file.stat,
    hasBom: file.hasBom,
    isReadOnly: file.isReadOnly,
    externalChange: null,
    revision: 0,
    isPending: false,
  };
}

function restoreDocuments(
  state: DocumentsState,
  { tabs, activeIndex }: { tabs: readonly RestoredTab[]; activeIndex: number },
): DocumentsState {
  const openKeys = new Set(state.documents.map((doc) => doc.key));
  const restored = tabs.flatMap(({ folderId, path, viewMode }): OpenDocument[] => {
    const key = documentKey(folderId, path);
    if (openKeys.has(key)) {
      return [];
    }
    openKeys.add(key);
    const name = baseName(path);
    const extension = normalizeExtension(name);
    return [
      {
        key,
        folderId,
        path,
        name,
        extension,
        content: "",
        isDirty: false,
        viewMode: resolveViewMode(extension, viewMode),
        diskStat: { size: 0, modifiedAt: 0 },
        hasBom: false,
        isReadOnly: false,
        externalChange: null,
        revision: 0,
        isPending: true,
      },
    ];
  });
  const active = tabs[activeIndex];
  return {
    documents: [...restored, ...state.documents],
    activeKey: state.activeKey ?? (active ? documentKey(active.folderId, active.path) : null),
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
  { folderId, fromPath, toPath }: { folderId: string; fromPath: string; toPath: string },
): DocumentsState {
  let activeKey = state.activeKey;
  const documents = state.documents.map((doc) => {
    if (doc.folderId !== folderId || !isSameOrInside(doc.path, fromPath)) {
      return doc;
    }
    const path = toPath + doc.path.slice(fromPath.length);
    const name = baseName(path);
    const extension = normalizeExtension(name);
    const key = documentKey(folderId, path);
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
