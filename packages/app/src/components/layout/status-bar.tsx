import { getFileKind } from "../../domain/file-types";
import type { FileDocument } from "../../ports";
import type { CursorInfo } from "../editor/raw-editor";

interface StatusBarProps {
  /** Currently active file document, if one is open. */
  activeFile?: FileDocument | null;
  /** Cursor of the raw editor, or null when the active document isn't shown raw. */
  cursor?: CursorInfo | null;
}

/**
 * Renders the bottom status bar with the raw editor's cursor position, and the active document's
 * size and format. The bar stays empty when no document is open.
 *
 * @param props - StatusBar properties.
 * @returns Status bar element.
 */
export function StatusBar({ activeFile, cursor }: StatusBarProps) {
  return (
    <footer
      aria-label="Status Bar"
      className="border-border bg-foreground text-text-secondary flex h-6 items-center justify-end border-t px-3 text-[11px] select-none"
    >
      {activeFile && (
        <div className="flex items-center gap-4">
          {cursor && <span>{describeCursor(cursor)}</span>}
          <span>{describeSize(activeFile)}</span>
          <span>{describeFormat(activeFile.extension)}</span>
        </div>
      )}
    </footer>
  );
}

function describeCursor({ line, column, selectionLength }: CursorInfo): string {
  const position = `Ln ${line}, Col ${column}`;
  return selectionLength > 0 ? `${position} (${selectionLength} selected)` : position;
}

/**
 * Counts words for Markdown documents and lines for everything else.
 *
 * @param file - The active document.
 * @returns A human-readable size such as "1 word" or "12 lines".
 */
function describeSize(file: FileDocument): string {
  if (getFileKind(file.extension) === "markdown") {
    const wordCount = file.content.split(/\s+/).filter((word) => word.length > 0).length;
    return `${wordCount} ${wordCount === 1 ? "word" : "words"}`;
  }
  const lineCount = file.content.split("\n").length;
  return `${lineCount} ${lineCount === 1 ? "line" : "lines"}`;
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
