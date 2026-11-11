import { getViewer } from "../../domain/viewers";
import type { FileDocument, ViewMode } from "../../ports";
import type { OpenDocument } from "../../state/documents";
import { Tooltip } from "../feedback/tooltip";
import { CsvTableEditor } from "./csv-table-editor";
import { MarkdownEditor } from "./markdown-editor";
import { RawEditor } from "./raw-editor";

interface EditorPaneProps {
  platform: string;
  /** The active tab's document, or null when no tab is open. */
  document: OpenDocument | null;
  onViewModeChange: (mode: ViewMode) => void;
  onContentChange: (newContent: string) => void;
  onSave: () => void;
}

/** Hosts the document header, the view mode toggle, and the active document's editor. */
export function EditorPane({ platform, document: doc, onViewModeChange, onContentChange, onSave }: EditorPaneProps) {
  if (!doc) {
    return <main role="main" data-platform={platform} className="bg-background text-text flex flex-1 flex-col" />;
  }

  const viewer = getViewer(doc.extension);
  const canToggleView = viewer.hasRaw && viewer.enriched !== undefined;

  return (
    <main role="main" data-platform={platform} className="bg-background text-text flex flex-1 flex-col overflow-hidden">
      <header className="border-border bg-background flex h-9 flex-none items-center justify-between gap-3 border-b px-3">
        <DocumentBreadcrumb file={doc} />
        <div className="flex flex-none items-center gap-2">
          {canToggleView && <ViewModeToggle viewMode={doc.viewMode} onViewModeChange={onViewModeChange} />}
          <Tooltip text="Save (Ctrl+S)" position="bottom" align="end">
            {(bubbleId) => (
              <button
                type="button"
                onClick={onSave}
                disabled={!doc.isDirty}
                aria-label="Save file"
                aria-describedby={bubbleId}
                className="btn ghost icon sm"
              >
                <i className="ic-save" aria-hidden="true" />
              </button>
            )}
          </Tooltip>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <DocumentView document={doc} onContentChange={onContentChange} />
      </div>
    </main>
  );
}

interface DocumentViewProps {
  document: OpenDocument;
  onContentChange: (newContent: string) => void;
}

function DocumentView({ document: doc, onContentChange }: DocumentViewProps) {
  const enriched = doc.viewMode === "enriched" ? getViewer(doc.extension).enriched : undefined;
  switch (enriched) {
    case "markdown":
      // The editor owns its document once mounted, so each tab gets its own instance.
      return <MarkdownEditor key={doc.key} content={doc.content} onChange={onContentChange} />;
    case "csv-table":
      return <CsvTableEditor content={doc.content} onChange={onContentChange} />;
    case undefined:
      return <RawEditor content={doc.content} onChange={onContentChange} fileName={doc.name} />;
  }
}

interface DocumentBreadcrumbProps {
  /** Document whose path is shown. */
  file: FileDocument;
}

/**
 * Shows the document's location as a breadcrumb trail. Only the nearest folder stays visible on
 * narrow screens, so the file name keeps its room.
 *
 * @param props - DocumentBreadcrumb properties.
 * @returns Breadcrumb navigation element.
 */
function DocumentBreadcrumb({ file }: DocumentBreadcrumbProps) {
  const folderNames = file.path.split("/").slice(0, -1);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
      <ol className="flex min-w-0 items-center gap-1 text-xs">
        {folderNames.map((folderName, index) => {
          const isNearestFolder = index === folderNames.length - 1;
          return (
            <li
              key={folderNames.slice(0, index + 1).join("/")}
              className={`text-text-secondary min-w-0 items-center gap-1 ${isNearestFolder ? "flex" : "hidden sm:flex"}`}
            >
              <span className="min-w-0 truncate">{folderName}</span>
              <i className="ic-chevron-right text-text-secondary shrink-0 text-[10px]" aria-hidden="true" />
            </li>
          );
        })}
        <li aria-current="page" className="text-text flex min-w-0 items-center gap-1.5 font-medium">
          <FileTypeIcon extension={file.extension} />
          <span className="min-w-0 truncate">{file.name}</span>
          {file.isDirty && (
            <>
              <span
                title="Unsaved changes"
                className="bg-text-secondary inline-block size-1.5 flex-none rounded-full"
              />
              <span className="visually-hidden">Unsaved changes</span>
            </>
          )}
        </li>
      </ol>
    </nav>
  );
}

interface FileTypeIconProps {
  /** Normalized extension of the document. */
  extension: string;
}

/**
 * Renders the icon representing a document's file type in the breadcrumb.
 *
 * @param props - FileTypeIcon properties.
 * @returns Icon element for the file type.
 */
function FileTypeIcon({ extension }: FileTypeIconProps) {
  if (extension === "csv") {
    return <i className="ic-file-spreadsheet text-text-secondary shrink-0 text-xs" aria-hidden="true" />;
  }
  return <i className="ic-file-text text-text-secondary shrink-0 text-xs" aria-hidden="true" />;
}

interface ViewModeToggleProps {
  /** Currently selected presentation mode. */
  viewMode: ViewMode;
  /** Callback fired when the user selects a presentation mode. */
  onViewModeChange: (mode: ViewMode) => void;
}

/**
 * Compact segmented control for switching between the raw and enriched presentations.
 *
 * @param props - ViewModeToggle properties.
 * @returns Segmented control element.
 */
function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the segmented control is styled by its `panel` class; a native fieldset would bring browser styling the class does not reset
    <div role="group" aria-label="Document view mode" className="panel p-xs flex flex-none items-center gap-0.5">
      <Tooltip text="Show raw text" position="bottom" align="end">
        {(bubbleId) => (
          <button
            type="button"
            onClick={() => onViewModeChange("raw")}
            aria-pressed={viewMode === "raw"}
            aria-label="Raw"
            aria-describedby={bubbleId}
            className={viewMode === "raw" ? "btn soft icon sm p-sm" : "btn ghost icon sm p-sm"}
          >
            <i className="ic-code" aria-hidden="true" />
          </button>
        )}
      </Tooltip>
      <Tooltip text="Show rendered view" position="bottom" align="end">
        {(bubbleId) => (
          <button
            type="button"
            onClick={() => onViewModeChange("enriched")}
            aria-pressed={viewMode === "enriched"}
            aria-label="View"
            aria-describedby={bubbleId}
            className={viewMode === "enriched" ? "btn soft icon sm p-sm" : "btn ghost icon sm p-sm"}
          >
            <i className="ic-eye" aria-hidden="true" />
          </button>
        )}
      </Tooltip>
    </div>
  );
}
