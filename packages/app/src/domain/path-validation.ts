const RESERVED_CHARACTERS = /["*/:<>?\\|]/;
// oxlint-disable-next-line no-control-regex -- intentionally matching ASCII control characters, which are invalid in file names on every supported platform
const CONTROL_CHARACTERS = /[\x00-\x1f]/;

/**
 * Validates a candidate file or directory name for creation or rename within a workspace.
 * Expects `name` to already be trimmed; a name with leading/trailing whitespace is rejected
 * as ending in a space rather than being silently trimmed, so the caller's input and the
 * validated result never silently diverge.
 *
 * @param name - Candidate entry name (not a path; must not contain a path separator).
 * @param siblingNames - Names already present in the same parent directory, excluding the
 *   entry being renamed (if any). Compared case-insensitively.
 * @returns A human-readable error message if the name is invalid, or null if it is valid.
 */
export function validateEntryName(name: string, siblingNames: readonly string[]): string | null {
  if (name.length === 0) {
    return "Name cannot be empty.";
  }
  if (name.trim() !== name) {
    return "Name cannot start or end with a space.";
  }
  if (name === "." || name === "..") {
    return "This name is reserved.";
  }
  if (name.endsWith(".")) {
    return "Name cannot end with a period.";
  }
  if (RESERVED_CHARACTERS.test(name) || CONTROL_CHARACTERS.test(name)) {
    return `Name cannot contain any of: ${'" * / : < > ? \\ |'}`;
  }
  const lowerName = name.toLowerCase();
  if (siblingNames.some((sibling) => sibling.toLowerCase() === lowerName)) {
    return `"${name}" already exists here.`;
  }
  return null;
}

/**
 * Joins a parent directory path and an entry name into a workspace-relative path.
 *
 * @param parentPath - Relative path of the parent directory, or an empty string for the workspace root.
 * @param name - File or directory name to append.
 * @returns The combined relative path.
 */
export function joinWorkspacePath(parentPath: string, name: string): string {
  return parentPath === "" ? name : `${parentPath}/${name}`;
}
