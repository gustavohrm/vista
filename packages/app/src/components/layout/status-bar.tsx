import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { shortenPath, type DocumentLocation } from "../../domain/document-location";
import { getFileKind } from "../../domain/file-types";
import { lineSeparatorOf } from "../../domain/line-endings";
import type { FileDocument } from "../../ports";
import type { OpenDocument } from "../../state/documents";
import type { CursorInfo } from "../editor/raw-editor";
import { Tooltip } from "../feedback/tooltip";

/** Icon buttons sized to fit the bar's 30px height. */
const PATH_BUTTON_CLASS =
  "btn ghost icon sm size-6! min-h-0! min-w-0! p-0! text-xs text-text-faint hover:text-text [--ui-radius:6px]";

interface StatusBarProps {
  /** Currently active file document, if one is open. */
  activeFile?: OpenDocument | null;
  /** Where the active file is, shown on the left. */
  location?: DocumentLocation | null;
  /** Copies the active file's path: the full path on desktop, the path within its folder on the web. */
  onCopyPath?: () => void;
  /** Names the copy button after what it copies. */
  copyPathLabel?: "Copy Path" | "Copy Relative Path";
  /** Shows the active file in the operating system's file manager, where the host has one. */
  onReveal?: () => void;
  /** Cursor of the raw editor, or null when the active document isn't shown raw. */
  cursor?: CursorInfo | null;
  /** Vim's mode in the raw editor, or null when vim is off or the document isn't shown raw. */
  vimMode?: string | null;
  /** Opens go-to-line; the cursor position is a button for it when set. */
  onGoToLine?: () => void;
}

/**
 * Renders the bottom path and status bar. On the left: where the active file is, with Copy, Reveal
 * where the host can, and notes such as Read-only. On the right: the raw editor's cursor position
 * and vim mode, and the document's line count, size, line endings, format, and word count for
 * Markdown. The shell shows the bar only while a document is.
 *
 * @param props - StatusBar properties.
 * @returns Status bar element.
 */
export function StatusBar({
  activeFile,
  location,
  onCopyPath,
  copyPathLabel = "Copy Path",
  onReveal,
  cursor,
  vimMode,
  onGoToLine,
}: StatusBarProps) {
  return (
    <footer
      aria-label="Status Bar"
      className="text-text-faint flex h-[30px] flex-none items-center justify-between gap-4 px-1 text-xs tabular-nums select-none"
    >
      {activeFile && location && (
        // The path comes first, so it keeps most of a narrow bar and the facts scroll instead.
        <div className="flex max-w-[65%] min-w-0 flex-none items-center gap-1 whitespace-nowrap">
          <PathText location={location} />
          {onCopyPath && (
            <PathButton label={copyPathLabel} onClick={onCopyPath}>
              <i className="ic-copy" aria-hidden="true" />
            </PathButton>
          )}
          {onReveal && (
            <PathButton label="Reveal in File Explorer" onClick={onReveal}>
              <i className="ic-folder-open" aria-hidden="true" />
            </PathButton>
          )}
          <DocumentNotes file={activeFile} />
        </div>
      )}
      {activeFile && (
        <div className="ml-auto flex min-w-0 [scrollbar-width:none] items-center gap-4 overflow-x-auto whitespace-nowrap">
          {vimMode && <span className="text-text-strong font-medium">{vimMode.toUpperCase()}</span>}
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

/**
 * The path, with segments from its middle replaced by `…` one at a time until it fits, and the
 * whole path in its tooltip.
 */
function PathText({ location }: { location: DocumentLocation }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState(0);
  const [hidden, setHidden] = useState(0);
  const full = shortenPath(location, 0);
  // Fitting starts over whenever the path or the room for it changes.
  const fitKey = `${full}\n${room}`;
  const [fittedKey, setFittedKey] = useState(fitKey);
  if (fittedKey !== fitKey) {
    setFittedKey(fitKey);
    setHidden(0);
  }

  useEffect(() => {
    // The bar's width, not the path's own, which changes as the path is shortened.
    const bar = textRef.current?.closest("footer");
    if (!bar || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setRoom(Math.round(entry?.contentRect.width ?? 0)));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  // Runs before paint, so each segment hidden while the text overflows never shows. Each pass hides
  // one more, and stops once the text fits or only the first segment and the file name are left.
  const maxHidden = location.segments.length - 2;
  useLayoutEffect(() => {
    const text = textRef.current;
    if (text && text.scrollWidth > text.clientWidth && hidden < maxHidden) {
      setHidden(hidden + 1);
    }
  }, [hidden, fitKey, maxHidden]);

  return (
    <Tooltip text={full} position="top" align="start" className="flex min-w-0">
      {(bubbleId) => (
        <span ref={textRef} aria-describedby={bubbleId} className="text-text-muted min-w-0 truncate">
          {splitFileName(shortenPath(location, hidden), location)}
        </span>
      )}
    </Tooltip>
  );
}

/** Sets the file name apart from the folders before it, which only say where it is. */
function splitFileName(path: string, location: DocumentLocation): ReactNode {
  const name = location.segments.at(-1) ?? "";
  return (
    <>
      {path.slice(0, path.length - name.length)}
      <span className="text-text-strong font-medium">{name}</span>
    </>
  );
}

function PathButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip text={label} position="top" className="flex flex-none">
      {(bubbleId) => (
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-describedby={bubbleId}
          className={PATH_BUTTON_CLASS}
        >
          {children}
        </button>
      )}
    </Tooltip>
  );
}

/** Says when the buffer can't be saved as is: read-only, or changed or deleted by another program. */
function DocumentNotes({ file }: { file: OpenDocument }) {
  return (
    <>
      {file.isReadOnly && <DocumentNote text="Read-only" title="This file isn't UTF-8 text, so Vista won't save it." />}
      {file.externalChange === "changed" && (
        <DocumentNote
          text="Changed on disk"
          title="Another program changed this file. Saving asks before overwriting it."
        />
      )}
      {file.externalChange === "deleted" && (
        <DocumentNote
          text="Deleted on disk"
          title="Another program deleted this file. Saving asks before creating it again."
        />
      )}
    </>
  );
}

function DocumentNote({ text, title }: { text: string; title: string }) {
  return (
    <span className="text-text-muted ml-1 flex-none" title={title}>
      {text}
    </span>
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
