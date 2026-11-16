import type { FolderRelation } from "@vista/app";

const DRIVE_ROOT = /^[A-Za-z]:\/$/;
const WINDOWS_PATH = /^([A-Za-z]:\/|\/\/)/;

/**
 * Uses `/` separators, without repeated or trailing ones, keeping a UNC path's leading `//`. A
 * backslash is a separator only in a Windows path; elsewhere it is part of a name.
 */
export function normalizeFolderPath(path: string): string {
  const forward = /^([A-Za-z]:|\\\\)/.test(path) ? path.replace(/\\/g, "/") : path;
  const isUnc = forward.startsWith("//");
  let normalized = (isUnc ? "/" : "") + forward.replace(/\/{2,}/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/") && !DRIVE_ROOT.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  return /^[A-Za-z]:$/.test(normalized) ? `${normalized}/` : normalized;
}

// Windows paths compare without letter case, as the file system does there.
function comparable(path: string): string {
  const normalized = normalizeFolderPath(path);
  return WINDOWS_PATH.test(normalized) ? normalized.toLowerCase() : normalized;
}

function isWithin(parent: string, child: string): boolean {
  const prefix = parent.endsWith("/") ? parent : `${parent}/`;
  return child.startsWith(prefix);
}

export function relateFolderPaths(a: string, b: string): FolderRelation {
  const left = comparable(a);
  const right = comparable(b);
  if (left === right) {
    return "same";
  }
  if (isWithin(left, right)) {
    return "contains";
  }
  return isWithin(right, left) ? "inside" : "separate";
}

function splitRoot(path: string): { root: string; segments: string[] } {
  const normalized = normalizeFolderPath(path);
  const unc = /^\/\/[^/]+\/[^/]+/.exec(normalized);
  const root = unc ? unc[0] : (/^[A-Za-z]:\//.exec(normalized)?.[0] ?? "/");
  return { root, segments: normalized.slice(root.length).split("/").filter(Boolean) };
}

/** The absolute path a relative location names from a folder, or null when it climbs above the root. */
export function resolveRelativePath(from: string, location: string): string | null {
  const { root, segments } = splitRoot(from);
  for (const part of location.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  const separator = root.endsWith("/") || segments.length === 0 ? "" : "/";
  return `${root}${separator}${segments.join("/")}`;
}

/** Where `to` is from `from`, such as `../sources`, or null when they are on different roots. */
export function relativeFolderPath(from: string, to: string): string | null {
  const source = splitRoot(comparable(from));
  const target = splitRoot(normalizeFolderPath(to));
  const targetKey = splitRoot(comparable(to));
  const targetKeys = targetKey.segments;
  if (source.root !== targetKey.root) {
    return null;
  }
  let shared = 0;
  while (
    shared < source.segments.length &&
    shared < targetKeys.length &&
    source.segments[shared] === targetKeys[shared]
  ) {
    shared += 1;
  }
  const parts = [...source.segments.slice(shared).map(() => ".."), ...target.segments.slice(shared)];
  return parts.length === 0 ? "." : parts.join("/");
}

export function folderNameFromPath(folderPath: string): string {
  return splitRoot(folderPath).segments.pop() ?? "Workspace";
}
