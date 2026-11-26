import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { MAX_TABLE_CELLS } from "../../domain/csv";
import { shortenPath, type DocumentLocation } from "../../domain/document-location";
import { getFileKind } from "../../domain/file-types";
import { lineSeparatorOf } from "../../domain/line-endings";
import { canShowEnriched, getViewer } from "../../domain/viewers";
import { i18n, t, useLocale } from "../../i18n";
import type { FileDocument } from "../../ports";
import type { OpenDocument } from "../../state/documents";
import type { CursorInfo } from "../editor/raw-editor";
import { Tooltip } from "../feedback/tooltip";

/** Icon buttons sized to fit the bar's 30px height. */
const PATH_BUTTON_CLASS = "icon-button size-6 text-sm";

interface StatusBarProps {
  /** Currently active file document, if one is open. */
  activeFile?: OpenDocument | null;
  /** Where the active file is, shown on the left. */
  location?: DocumentLocation | null;
  /** Copies the active file's path: the full path on desktop, the path within its folder on the web. */
  onCopyPath?: () => Promise<boolean>;
  /** Names the copy button after what it copies, in the interface language; Copy Path by default. */
  copyPathLabel?: string;
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
  copyPathLabel,
  onReveal,
  cursor,
  vimMode,
  onGoToLine,
}: StatusBarProps) {
  return (
    <footer
      aria-label={t("statusBar.label")}
      className="text-text-faint flex h-[30px] flex-none items-center justify-between gap-4 px-1 text-xs tabular-nums select-none"
    >
      {activeFile && location && (
        // The path comes first, so it keeps most of a narrow bar and the facts scroll instead.
        <div className="flex max-w-[65%] min-w-0 flex-none items-center gap-1 whitespace-nowrap">
          <PathText location={location} />
          {onCopyPath && <CopyPathButton label={copyPathLabel ?? t("common.copyPath")} onCopy={onCopyPath} />}
          {onReveal && (
            <PathButton label={t("common.revealInFileExplorer")} onClick={onReveal}>
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
                aria-label={t("statusBar.goToLine", {
                  position: describeCursor(cursor),
                })}
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

  // Runs before paint, so a path that overflows never shows. The shorter candidates are measured in a
  // hidden copy of the text, one more segment hidden each time, and only the first that fits is
  // rendered: rendering each candidate in turn would be one nested update per segment, and React
  // stops a path deeper than about 50 folders with "Maximum update depth exceeded". The search
  // stops at the first segment and the file name.
  const maxHidden = location.segments.length - 2;
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text || text.scrollWidth <= text.clientWidth || hidden >= maxHidden) {
      return;
    }
    const probe = text.cloneNode(true) as HTMLSpanElement;
    const name = probe.lastElementChild;
    probe.removeAttribute("aria-describedby");
    probe.setAttribute("aria-hidden", "true");
    Object.assign(probe.style, {
      position: "absolute",
      visibility: "hidden",
      width: `${text.clientWidth}px`,
    });
    text.after(probe);
    let fits = maxHidden;
    for (let candidate = hidden + 1; candidate < maxHidden; candidate += 1) {
      const path = shortenPath(location, candidate);
      const prefix = document.createTextNode(path.slice(0, path.length - (name?.textContent?.length ?? 0)));
      probe.replaceChildren(...(name ? [prefix, name] : [prefix]));
      if (probe.scrollWidth <= probe.clientWidth) {
        fits = candidate;
        break;
      }
    }
    probe.remove();
    setHidden(fits);
  }, [hidden, fitKey, maxHidden, location]);

  return (
    <Tooltip text={full} position="top" className="flex min-w-0">
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

/** How long the copy button shows its check after a copy, in milliseconds. */
export const COPIED_MS = 1500;

/**
 * The copy button. After a copy that worked it shows a check for a moment, and says "Copied" to
 * assistive technology, so the copy is confirmed where it was asked for; a failed copy says so in
 * a toast instead and keeps the copy icon.
 */
function CopyPathButton({ label, onCopy }: { label: string; onCopy: () => Promise<boolean> }) {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleClick = async () => {
    if (await onCopy()) {
      window.clearTimeout(timerRef.current);
      setIsCopied(true);
      timerRef.current = window.setTimeout(() => setIsCopied(false), COPIED_MS);
    }
  };

  return (
    <>
      <PathButton label={label} onClick={() => void handleClick()}>
        {isCopied ? (
          <i className="ic-check vista-pop text-text-strong" aria-hidden="true" />
        ) : (
          <i className="ic-copy" aria-hidden="true" />
        )}
      </PathButton>
      <output className="visually-hidden">{isCopied ? t("statusBar.copied") : ""}</output>
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

/**
 * Says when the buffer can't be saved as is: read-only, or changed or deleted by another program, and
 * when a CSV has too many cells for the table, which is why it shows no view switch.
 */
function DocumentNotes({ file }: { file: OpenDocument }) {
  const { content, extension } = file;
  const isRawOnly = useMemo(
    () => getViewer(extension).enriched === "csv-table" && !canShowEnriched(extension, content),
    [content, extension],
  );
  return (
    <>
      {file.isReadOnly && <DocumentNote text={t("statusBar.readOnly.text")} title={t("statusBar.readOnly.title")} />}
      {!file.isReadOnly && isRawOnly && (
        <DocumentNote
          text={t("statusBar.rawOnly.text")}
          title={t("statusBar.rawOnly.title", { count: MAX_TABLE_CELLS })}
        />
      )}
      {file.externalChange === "changed" && (
        <DocumentNote text={t("statusBar.changedOnDisk.text")} title={t("statusBar.changedOnDisk.title")} />
      )}
      {file.externalChange === "deleted" && (
        <DocumentNote text={t("statusBar.deletedOnDisk.text")} title={t("statusBar.deletedOnDisk.title")} />
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
  // The facts are text, so they are built again in a new language.
  const locale = useLocale();
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- the locale changes the text describeDocument writes
  const facts = useMemo(() => describeDocument(content, extension), [content, extension, locale]);
  // oxlint-disable-next-line react/no-array-index-key -- the list has a fixed order, and two facts can read the same, such as LF and an .lf file's format
  return facts.map((fact, index) => <span key={`${index}:${fact}`}>{fact}</span>);
}

function describeCursor({ line, column, selectionLength }: CursorInfo): string {
  return selectionLength > 0
    ? t("statusBar.positionWithSelection", {
        line,
        column,
        count: selectionLength,
      })
    : t("statusBar.position", { line, column });
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
    t("statusBar.lines", { count: lineCount }),
    formatBytes(new TextEncoder().encode(content).length),
    lineSeparatorOf(content) === "\r\n" ? "CRLF" : "LF",
    describeFormat(extension),
  ];
  if (getFileKind(extension) === "markdown") {
    const wordCount = content.split(/\s+/).filter((word) => word.length > 0).length;
    facts.push(t("statusBar.words", { count: wordCount }));
  }
  return facts;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return t("statusBar.bytes", { size: i18n.formatNumber(bytes) });
  }
  const oneDecimal = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  if (bytes < 1024 * 1024) {
    return t("statusBar.kilobytes", {
      size: i18n.formatNumber(bytes / 1024, oneDecimal),
    });
  }
  return t("statusBar.megabytes", {
    size: i18n.formatNumber(bytes / (1024 * 1024), oneDecimal),
  });
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
      return t("statusBar.plainText");
    case "unknown":
      return extension.toUpperCase();
  }
}
