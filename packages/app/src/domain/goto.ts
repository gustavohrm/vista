/** Where a go-to query points: a file, a position in it, or both. */
export interface GoToTarget {
  /** File to search for; empty for the current file. */
  path: string;
  /** 1-based line, when the query names one. */
  line?: number;
  /** 1-based column, when the query names one. */
  column?: number;
}

/** A file that matches a go-to query. */
export interface FileMatch {
  path: string;
  /** Indices of the path's characters that matched, for highlighting. */
  positions: number[];
}

/** The go-to picker lists at most this many files. */
export const GO_TO_RESULT_LIMIT = 50;

/**
 * Splits a go-to query into a file query and a position: `notes/a.md:12:4`, `a.md:12`, or `:12:4`
 * for the current file. A trailing colon with no number yet, as while typing, is ignored.
 */
export function parseGoToQuery(query: string): GoToTarget {
  const match = /^(.*?)(?::(\d*)(?::(\d*))?)?$/.exec(query.trim());
  const [, path = "", line = "", column = ""] = match ?? [];
  return {
    path: path.trim(),
    ...(line ? { line: Number(line) } : {}),
    ...(line && column ? { column: Number(column) } : {}),
  };
}

/**
 * Ranks workspace files against a fuzzy query. The query's characters must appear in the path in
 * order, case ignored; matches in the file name, at word starts, and in runs rank higher.
 *
 * @param paths - Workspace-relative file paths.
 * @param query - The file part of a go-to query. Spaces are ignored.
 * @returns The best matches, best first, at most `GO_TO_RESULT_LIMIT`.
 */
export function rankFiles(paths: readonly string[], query: string): FileMatch[] {
  const needle = foldCase(query.replaceAll(" ", ""));
  if (needle === "") {
    return [...paths]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, GO_TO_RESULT_LIMIT)
      .map((path) => ({ path, positions: [] }));
  }
  const scored: { match: FileMatch; score: number }[] = [];
  for (const path of paths) {
    const result = scorePath(path, needle);
    if (result) {
      scored.push({ match: { path, positions: result.positions }, score: result.score });
    }
  }
  scored.sort(
    (a, b) =>
      b.score - a.score || a.match.path.length - b.match.path.length || a.match.path.localeCompare(b.match.path),
  );
  return scored.slice(0, GO_TO_RESULT_LIMIT).map(({ match }) => match);
}

/**
 * Lowercases each UTF-16 unit on its own, keeping the length, so match positions in the folded text
 * are positions in the original. `toLowerCase` on the whole string can change its length, as with "İ".
 */
function foldCase(text: string): string {
  let folded = "";
  for (let i = 0; i < text.length; i++) {
    const unit = text.charAt(i);
    const lower = unit.toLowerCase();
    folded += lower.length === 1 ? lower : unit;
  }
  return folded;
}

const WORD_SEPARATORS = new Set(["/", ".", "-", "_", " "]);

/** Tries each place the query's first character occurs and keeps the best-scoring match. */
function scorePath(path: string, needle: string): { score: number; positions: number[] } | null {
  const haystack = foldCase(path);
  const nameStart = path.lastIndexOf("/") + 1;
  let best: { score: number; positions: number[] } | null = null;
  const first = needle.charAt(0);
  for (let start = haystack.indexOf(first); start >= 0; start = haystack.indexOf(first, start + 1)) {
    const positions = matchFrom(haystack, needle, start);
    if (!positions) {
      break;
    }
    const score = scorePositions(path, positions, nameStart);
    if (!best || score > best.score) {
      best = { score, positions };
    }
  }
  return best;
}

/** Matches the query greedily from a start index; null when the rest of the query doesn't fit. */
function matchFrom(haystack: string, needle: string, start: number): number[] | null {
  const positions = [start];
  let index = start + 1;
  for (const char of needle.slice(1)) {
    index = haystack.indexOf(char, index);
    if (index < 0) {
      return null;
    }
    positions.push(index);
    index++;
  }
  return positions;
}

function scorePositions(path: string, positions: readonly number[], nameStart: number): number {
  let score = 0;
  positions.forEach((position, i) => {
    score += 1;
    const previous = positions[i - 1];
    if (previous !== undefined && position === previous + 1) {
      score += 5;
    } else if (previous !== undefined) {
      score -= Math.min(position - previous - 1, 3);
    }
    const before = path[position - 1];
    const isWordStart =
      before === undefined ||
      WORD_SEPARATORS.has(before) ||
      (before === before.toLowerCase() && path.charAt(position) !== path.charAt(position).toLowerCase());
    if (isWordStart) {
      score += 4;
    }
    if (position >= nameStart) {
      score += 2;
    }
  });
  return score;
}
