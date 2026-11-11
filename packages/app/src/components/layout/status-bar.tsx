import { useMemo } from "react";

import { getFileKind } from "../../domain/file-types";
import { lineSeparatorOf } from "../../domain/line-endings";
import type { FileDocument } from "../../ports";
import type { CursorInfo } from "../editor/raw-editor";

interface StatusBarProps {
  /** Currently active file document, if one is open. */
  activeFile?: FileDocument | null;
  /** Cursor of the raw editor, or null when the active document isn't shown raw. */
  cursor?: CursorInfo | null;
  /** Vim's mode in the raw editor, or null when vim is off or the document isn't shown raw. */
  vimMode?: string | null;
  /** Opens go-to-line; the cursor position is a button for it when set. */
  onGoToLine?: () => void;
}

/**
 * Renders the bottom status bar: the raw editor's cursor position and vim mode, and the active
 * document's line count, size, line endings, format, and word count for Markdown. The bar stays
 * empty when no document is open.
 *
 * @param props - StatusBar properties.
 * @returns Status bar element.
 */
export function StatusBar({ activeFile, cursor, vimMode, onGoToLine }: StatusBarProps) {
  return (
    <footer
      aria-label="Status Bar"
      className="border-border bg-foreground text-text-secondary flex h-6 items-center justify-end border-t px-3 text-[11px] select-none"
    >
      {activeFile && (
        <div className="flex min-w-0 [scrollbar-width:none] items-center gap-4 overflow-x-auto whitespace-nowrap">
          {vimMode && <span className="text-text font-medium">{vimMode.toUpperCase()}</span>}
          {cursor &&
            (onGoToLine ? (
              <button
                type="button"
                onClick={onGoToLine}
                aria-label={`${describeCursor(cursor)}. Go to line`}
                className="hover:text-text cursor-pointer"
              >
                {describeCursor(cursor)}
              </button>
            ) : (
              <span>{describeCursor(cursor)}</span>
            ))}
          <DocumentFacts file={activeFile} />
        </div>
      )}
    </footer>
  );
}

function DocumentFacts({ file }: { file: FileDocument }) {
  const { content, extension } = file;
  const facts = useMemo(() => describeDocument(content, extension), [content, extension]);
  // oxlint-disable-next-line react/no-array-index-key -- the list has a fixed order, and two facts can read the same, such as LF and an .lf file's format
  return facts.map((fact, index) => <span key={`${index}:${fact}`}>{fact}</span>);
}

function describeCursor({ line, column, selectionLength }: CursorInfo): string {
  const position = `Ln ${line}, Col ${column}`;
  return selectionLength > 0 ? `${position} (${selectionLength} selected)` : position;
}

/**
 * Lists what the status bar says about a document.
 *
 * @param content - The document's text.
 * @param extension - Normalized file extension.
 * @returns Facts such as "12 lines", "1.2 KB", "LF", "Markdown", and "340 words".
 */
function describeDocument(content: string, extension: string): string[] {
  const lineCount = content.split("\n").length;
  const facts = [
    `${lineCount} ${lineCount === 1 ? "line" : "lines"}`,
    formatBytes(new TextEncoder().encode(content).length),
    lineSeparatorOf(content) === "\r\n" ? "CRLF" : "LF",
    describeFormat(extension),
  ];
  if (getFileKind(extension) === "markdown") {
    const wordCount = content.split(/\s+/).filter((word) => word.length > 0).length;
    facts.push(`${wordCount} ${wordCount === 1 ? "word" : "words"}`);
  }
  return facts;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Names the document format for display, using a readable label for known kinds and the
 * uppercased extension for everything else.
 *
 * @param extension - Normalized file extension.
 * @returns Display name of the format.
 */
function describeFormat(extension: string): string {
  switch (getFileKind(extension)) {
    case "markdown":
      return "Markdown";
    case "csv":
      return "CSV";
    case "text":
      return "Plain Text";
    case "unknown":
      return extension.toUpperCase();
  }
}
