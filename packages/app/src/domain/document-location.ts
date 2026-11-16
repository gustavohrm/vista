/** Where a file is, as the segments of its path and the separator shown between them. */
export interface DocumentLocation {
  /** From the start of the path to the file's name. A POSIX path on disk starts with `""`. */
  segments: readonly string[];
  separator: string;
}

/**
 * Describes where a file of a folder is: its path on disk where the host has one, or the folder's
 * name followed by the path within it, as in `notes / docs / a.md`.
 *
 * @param folder - The folder the file is in.
 * @param path - The file's path within the folder, with `/` separators.
 * @param hasPathOnDisk - Whether `folder.rootPath` is a real path on disk, as on desktop.
 */
export function documentLocation(
  folder: { rootPath: string; name: string },
  path: string,
  hasPathOnDisk: boolean,
): DocumentLocation {
  const pathSegments = path.split("/");
  if (!hasPathOnDisk) {
    return { segments: [folder.name, ...pathSegments], separator: " / " };
  }
  // Only a Windows path, with a drive letter or a UNC prefix, uses backslashes as separators. In a
  // POSIX path a backslash is a character of a name, as in `/vault/notes\archive`.
  const isWindows = /^[A-Za-z]:[\\/]|^\\\\/.test(folder.rootPath);
  const separator = isWindows && folder.rootPath.includes("\\") ? "\\" : "/";
  const root = folder.rootPath.replace(isWindows ? /[\\/]+$/ : /\/+$/, "");
  return { segments: [...root.split(separator), ...pathSegments], separator };
}

/**
 * Writes a location out, with `hidden` segments from its middle replaced by `…`. The first segment
 * and the file name always stay; of the rest, the start keeps one more than the end when they
 * can't split evenly.
 *
 * @param location - The location to write.
 * @param hidden - How many segments to leave out. More than can be left out hides all it can.
 */
export function shortenPath({ segments, separator }: DocumentLocation, hidden: number): string {
  const count = Math.min(Math.max(hidden, 0), Math.max(segments.length - 2, 0));
  if (count === 0) {
    return segments.join(separator);
  }
  const visible = segments.length - count;
  const tail = Math.floor(visible / 2);
  const head = visible - tail;
  return [...segments.slice(0, head), "…", ...segments.slice(segments.length - tail)].join(separator);
}
