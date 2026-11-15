import type { ViewMode } from "../ports";

/** Icons a workspace can show. Each needs a literal `ic-*` class where it renders. */
export const WORKSPACE_ICONS = [
  "folder",
  "book-open",
  "notebook-pen",
  "briefcase",
  "code",
  "house",
  "star",
  "heart",
  "flask-conical",
  "graduation-cap",
  "pen-line",
  "globe",
] as const;
export type WorkspaceIcon = (typeof WORKSPACE_ICONS)[number];
export const DEFAULT_WORKSPACE_ICON: WorkspaceIcon = "folder";

/** The design-system palette's hues. */
export const WORKSPACE_COLORS = ["neutral", "indigo", "emerald", "amber", "rose"] as const;
export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];
export const DEFAULT_WORKSPACE_COLOR: WorkspaceColor = "neutral";

export const MAX_WORKSPACE_NAME_LENGTH = 80;
const FALLBACK_WORKSPACE_NAME = "Untitled workspace";

/** Where a workspace's details live: Vista's own storage, or `.vista/workspace.json` in its home folder. */
export type WorkspaceStorage = "device" | "folder";

export interface WorkspaceRecord {
  id: string;
  name: string;
  icon: WorkspaceIcon;
  color: WorkspaceColor;
  /** The workspace's folders, in order; the first is the home folder. Never empty. */
  folderIds: string[];
  storage: WorkspaceStorage;
  /** Milliseconds since the epoch, or 0 when unknown. */
  lastOpenedAt: number;
}

export interface WorkspaceList {
  version: 1;
  lastWorkspaceId: string | null;
  workspaces: WorkspaceRecord[];
}

export const WORKSPACES_STORAGE_KEY = "vista.workspaces";
export const EMPTY_WORKSPACE_LIST: WorkspaceList = { version: 1, lastWorkspaceId: null, workspaces: [] };

export interface WorkspaceListRead {
  list: WorkspaceList;
  /**
   * Whether the stored text held something this read could not keep, such as a corrupt list or a
   * workspace without folders. Saving over it loses that data, so the caller keeps a copy first.
   */
  isDamaged: boolean;
}

export function parseWorkspaceList(stored: string | null): WorkspaceListRead {
  if (stored === null) {
    return { list: EMPTY_WORKSPACE_LIST, isDamaged: false };
  }
  const value = parseJson(stored);
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.workspaces)) {
    return { list: EMPTY_WORKSPACE_LIST, isDamaged: true };
  }
  const workspaces: WorkspaceRecord[] = [];
  let isDamaged = false;
  for (const entry of value.workspaces) {
    const workspace = parseWorkspaceRecord(entry);
    if (!workspace || workspaces.some((kept) => kept.id === workspace.id)) {
      isDamaged = true;
      continue;
    }
    workspaces.push(workspace);
  }
  const lastWorkspaceId =
    typeof value.lastWorkspaceId === "string" && workspaces.some((w) => w.id === value.lastWorkspaceId)
      ? value.lastWorkspaceId
      : null;
  return { list: { version: 1, lastWorkspaceId, workspaces }, isDamaged };
}

function parseWorkspaceRecord(value: unknown): WorkspaceRecord | null {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isFolderIdList(value.folderIds)) {
    return null;
  }
  return {
    id: value.id,
    name: parseName(value.name) ?? FALLBACK_WORKSPACE_NAME,
    icon: parseIcon(value.icon),
    color: parseColor(value.color),
    folderIds: [...value.folderIds],
    storage: value.storage === "folder" ? "folder" : "device",
    lastOpenedAt:
      typeof value.lastOpenedAt === "number" && Number.isFinite(value.lastOpenedAt) && value.lastOpenedAt >= 0
        ? value.lastOpenedAt
        : 0,
  };
}

function isFolderIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString) && new Set(value).size === value.length
  );
}

/**
 * Finds the workspace that is exactly one folder, the one Open Folder reopens instead of creating
 * a duplicate. With several, the most recently opened wins.
 */
export function findWorkspaceForFolder(list: WorkspaceList, folderId: string): WorkspaceRecord | null {
  let found: WorkspaceRecord | null = null;
  for (const workspace of list.workspaces) {
    const isExactly = workspace.folderIds.length === 1 && workspace.folderIds[0] === folderId;
    if (isExactly && (!found || workspace.lastOpenedAt > found.lastOpenedAt)) {
      found = workspace;
    }
  }
  return found;
}

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

export function validateWorkspaceName(name: string): NameCheck {
  const trimmed = name.trim();
  if (trimmed === "") {
    return { ok: false, message: "Enter a name." };
  }
  if (trimmed.length > MAX_WORKSPACE_NAME_LENGTH) {
    return { ok: false, message: `Use at most ${MAX_WORKSPACE_NAME_LENGTH} characters.` };
  }
  return { ok: true, name: trimmed };
}

function parseName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const check = validateWorkspaceName(value);
  return check.ok ? check.name : null;
}

function parseIcon(value: unknown): WorkspaceIcon {
  return WORKSPACE_ICONS.find((icon) => icon === value) ?? DEFAULT_WORKSPACE_ICON;
}

function parseColor(value: unknown): WorkspaceColor {
  return WORKSPACE_COLORS.find((color) => color === value) ?? DEFAULT_WORKSPACE_COLOR;
}

export interface SessionTab {
  folderId: string;
  /** Path within the folder, with `/` separators. */
  path: string;
  viewMode: ViewMode;
}

export interface Session {
  version: 1;
  tabs: SessionTab[];
  /** Index into `tabs`, or -1 when there are none. */
  activeIndex: number;
  /** Expanded directory paths, by folder id. */
  expanded: Record<string, string[]>;
}

export const sessionStorageKey = (workspaceId: string): string => `vista.session.${workspaceId}`;

export function parseSession(stored: string | null): Session {
  const value = stored === null ? null : parseJson(stored);
  if (!isRecord(value) || value.version !== 1) {
    return { version: 1, tabs: [], activeIndex: -1, expanded: {} };
  }
  const tabs = Array.isArray(value.tabs) ? value.tabs.flatMap((tab) => parseSessionTab(tab) ?? []) : [];
  const storedIndex = value.activeIndex;
  const activeIndex =
    tabs.length === 0
      ? -1
      : Number.isInteger(storedIndex) && (storedIndex as number) >= 0 && (storedIndex as number) < tabs.length
        ? (storedIndex as number)
        : 0;
  return { version: 1, tabs, activeIndex, expanded: parseExpanded(value.expanded) };
}

function parseSessionTab(value: unknown): SessionTab | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.folderId) ||
    !isNonEmptyString(value.path) ||
    (value.viewMode !== "raw" && value.viewMode !== "enriched")
  ) {
    return null;
  }
  return { folderId: value.folderId, path: value.path, viewMode: value.viewMode };
}

function parseExpanded(value: unknown): Record<string, string[]> {
  const expanded: Record<string, string[]> = {};
  if (!isRecord(value)) {
    return expanded;
  }
  for (const [folderId, paths] of Object.entries(value)) {
    // Assigning `__proto__` would replace the object's prototype instead of adding a key.
    if (folderId === "__proto__" || !Array.isArray(paths)) {
      continue;
    }
    expanded[folderId] = paths.filter(isNonEmptyString);
  }
  return expanded;
}

/** The details `.vista/workspace.json` carries. Folder locations are relative to the home folder. */
export interface WorkspaceFileDetails {
  name: string;
  icon: WorkspaceIcon;
  color: WorkspaceColor;
  /** Relative locations with `/` separators; the first is always `.`, the home folder. */
  folders: string[];
}

export const WORKSPACE_FILE_DIRECTORY = ".vista";
export const WORKSPACE_FILE_PATH = ".vista/workspace.json";
export const HOME_FOLDER_LOCATION = ".";

export type WorkspaceFileRead = { status: "ok"; details: WorkspaceFileDetails } | { status: "unreadable" };

/**
 * Reads `.vista/workspace.json`. A file that isn't JSON, or whose version this Vista doesn't know,
 * is unreadable and must be left as it is; a bad field falls back on its own.
 */
export function parseWorkspaceFile(text: string, homeFolderName: string): WorkspaceFileRead {
  const value = parseJson(text);
  if (!isRecord(value) || value.version !== 1) {
    return { status: "unreadable" };
  }
  const locations = Array.isArray(value.folders) ? value.folders.filter(isRelativeLocation) : [];
  const folders = [HOME_FOLDER_LOCATION, ...new Set(locations.filter((l) => l !== HOME_FOLDER_LOCATION))];
  return {
    status: "ok",
    details: {
      name: parseName(value.name) ?? parseName(homeFolderName) ?? FALLBACK_WORKSPACE_NAME,
      icon: parseIcon(value.icon),
      color: parseColor(value.color),
      folders,
    },
  };
}

export function serializeWorkspaceFile(details: WorkspaceFileDetails): string {
  const { name, icon, color, folders } = details;
  return `${JSON.stringify({ version: 1, name, icon, color, folders }, null, 2)}\n`;
}

/** A location the file may name: relative, with `/` separators, and not a drive or absolute path. */
function isRelativeLocation(value: unknown): value is string {
  return isNonEmptyString(value) && !value.startsWith("/") && !value.includes("\\") && !/^[A-Za-z]:/.test(value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
