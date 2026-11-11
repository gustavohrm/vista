/** A single replacement that turns one text into another, in UTF-16 offsets of the old text. */
export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * Finds the smallest single replacement that turns `before` into `after`, by trimming their common
 * prefix and suffix. Editors apply it instead of replacing the whole text, so cursors and undo
 * history outside the changed range keep their positions.
 *
 * @returns The replacement, or null when the texts are equal.
 */
export function findTextChange(before: string, after: string): TextChange | null {
  if (before === after) {
    return null;
  }
  const maxShared = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < maxShared && before.charCodeAt(prefix) === after.charCodeAt(prefix)) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < maxShared - prefix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix++;
  }
  return { from: prefix, to: before.length - suffix, insert: after.slice(prefix, after.length - suffix) };
}
