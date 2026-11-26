import { t } from "../i18n";

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
 * @returns A human-readable error message, in the interface language, if the name is invalid, or null if it is valid.
 */
export function validateEntryName(name: string, siblingNames: readonly string[]): string | null {
  if (name.length === 0) {
    return t("pathValidation.empty");
  }
  if (name.trim() !== name) {
    return t("pathValidation.surroundingSpace");
  }
  if (name === "." || name === "..") {
    return t("pathValidation.reserved");
  }
  if (name.endsWith(".")) {
    return t("pathValidation.trailingPeriod");
  }
  if (RESERVED_CHARACTERS.test(name) || CONTROL_CHARACTERS.test(name)) {
    return t("pathValidation.reservedCharacters", {
      characters: '" * / : < > ? \\ |',
    });
  }
  const lowerName = name.toLowerCase();
  if (siblingNames.some((sibling) => sibling.toLowerCase() === lowerName)) {
    return t("pathValidation.exists", { name });
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
