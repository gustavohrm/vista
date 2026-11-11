import { useCallback, useMemo, useRef, useState } from "react";

import type { EditorSettings } from "../../domain/settings";
import { getViewer } from "../../domain/viewers";
import type { FileDocument, ViewMode } from "../../ports";
import type { OpenDocument } from "../../state/documents";
import { Tooltip } from "../feedback/tooltip";
import { Menu, type MenuEntry } from "../menu/menu";
import { CsvTableEditor } from "./csv-table-editor";
import { createDomFindTarget } from "./dom-find";
import { EditorSettingsMenu } from "./editor-settings-menu";
import { FindBar, type FindMode } from "./find-bar";
import type { FindTarget } from "./find-target";
import { MarkdownEditor } from "./markdown-editor";
import { RawEditor } from "./raw-editor";
import type { CursorInfo, EditorPosition, RawEditorStateCache } from "./raw-editor";

/** An open find bar. */
export interface FindRequest {
  mode: FindMode;
  /** Bumped each time find is requested, so the bar takes focus again. */
  focusRequest: number;
}

interface EditorPaneProps {
  platform: string;
  /** The active tab's document, or null when no tab is open. */
  document: OpenDocument | null;
  onViewModeChange: (mode: ViewMode) => void;
  onContentChange: (newContent: string) => void;
  /** Called with the active tab's key when its raw editor cursor or selection moves. */
  onCursorChange: (key: string, cursor: CursorInfo) => void;
  /** Called with the active tab's key when vim's mode changes, and with null when vim goes off. */
  onVimModeChange: (key: string, mode: string | null) => void;
  onSave: () => void;
  /** Raw editor state of each open tab, kept by the owner of the tabs. */
  rawEditorStates: RawEditorStateCache;
  /** App command shortcuts that the raw editor leaves to the commands layer. */
  reservedShortcuts: readonly string[];
  editorSettings: EditorSettings;
  onEditorSettingsChange: (changes: Partial<EditorSettings>) => void;
  /** The open find bar, or null when it is closed. */
  find: FindRequest | null;
  /** Opens the find bar, from the header's find button. */
  onFind: () => void;
  onFindClose: () => void;
  /** A position in the active document to move the raw editor's cursor to. */
  pendingJump: EditorPosition | null;
  onJumpApplied: () => void;
  /** Items of the editor's right-click menu. */
  contextMenuItems: readonly MenuEntry[];
  /** Loads an image a Markdown document links to; see `MarkdownEditor`. */
  loadImage?: (src: string) => Promise<string | Blob | null>;
}

/** Hosts the document header, the find bar, and the active document's editor. */
export function EditorPane({
  platform,
  document: doc,
  onViewModeChange,
  onContentChange,
  onCursorChange,
  onVimModeChange,
  onSave,
  rawEditorStates,
  reservedShortcuts,
  editorSettings,
  onEditorSettingsChange,
  find,
  onFind,
  onFindClose,
  pendingJump,
  onJumpApplied,
  contextMenuItems,
  loadImage,
}: EditorPaneProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const rawFindTargetRef = useRef<FindTarget>(null);
  const renderedViewRef = useRef<HTMLDivElement>(null);
  const renderedFindTarget = useMemo(() => createDomFindTarget(() => renderedViewRef.current), []);
  // The Markdown editor renders its text after mounting; counting each render lets an open find bar search again.
  const [markdownRenders, setMarkdownRenders] = useState(0);
  const enriched = doc?.viewMode === "enriched" ? getViewer(doc.extension).enriched : undefined;
  const isRawShown = enriched === undefined;
  const getFindTarget = useCallback(
    () => (isRawShown ? rawFindTargetRef.current : renderedFindTarget),
    [isRawShown, renderedFindTarget],
  );

  if (!doc) {
    return <main role="main" data-platform={platform} className="bg-background text-text flex flex-1 flex-col" />;
  }

  const viewer = getViewer(doc.extension);
  const canToggleView = viewer.hasRaw && viewer.enriched !== undefined;

  return (
    <main role="main" data-platform={platform} className="bg-background text-text flex flex-1 flex-col overflow-hidden">
      <header className="border-border bg-background flex h-9 flex-none items-center justify-between gap-3 border-b px-3">
        <DocumentBreadcrumb file={doc} />
        <div className="flex flex-none items-center gap-1">
          {canToggleView && <ViewModeToggle viewMode={doc.viewMode} onViewModeChange={onViewModeChange} />}
          <Tooltip text="Find (Ctrl+F)" position="bottom" align="end">
            {(bubbleId) => (
              <button
                type="button"
                onClick={onFind}
                aria-label="Find"
                aria-describedby={bubbleId}
                className={find ? "btn soft icon sm" : "btn ghost icon sm"}
              >
                <i className="ic-search" aria-hidden="true" />
              </button>
            )}
          </Tooltip>
          <EditorSettingsMenu settings={editorSettings} onChange={onEditorSettingsChange} />
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

      <div
        className="relative flex-1 overflow-hidden"
        onContextMenu={(event) => {
          // Shift keeps the browser's own menu, for spelling suggestions and the like.
          if (event.shiftKey) {
            return;
          }
          event.preventDefault();
          // The menu acts on the focused element, so it must be the field under the pointer.
          const field = (event.target as Element).closest<HTMLElement>("input, textarea, [contenteditable='true']");
          if (field && !field.contains(document.activeElement)) {
            field.focus();
          }
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {find && (
          <FindBar
            getTarget={getFindTarget}
            targetKey={`${doc.key}:${isRawShown ? "raw" : `rendered:${markdownRenders}`}`}
            content={doc.content}
            canReplace={isRawShown}
            mode={find.mode}
            focusRequest={find.focusRequest}
            onClose={onFindClose}
          />
        )}
        {isRawShown ? (
          <RawEditor
            ref={rawFindTargetRef}
            documentKey={doc.key}
            content={doc.content}
            fileName={doc.name}
            onChange={onContentChange}
            onCursorChange={(cursor) => onCursorChange(doc.key, cursor)}
            onVimModeChange={(mode) => onVimModeChange(doc.key, mode)}
            stateCache={rawEditorStates}
            options={editorSettings}
            reservedShortcuts={reservedShortcuts}
            pendingJump={pendingJump}
            onJumpApplied={onJumpApplied}
          />
        ) : (
          <div ref={renderedViewRef} className="h-full">
            {enriched === "markdown" ? (
              // The editor owns its document once mounted, so each tab gets its own instance.
              <MarkdownEditor
                key={doc.key}
                content={doc.content}
                onChange={onContentChange}
                onReady={() => setMarkdownRenders((count) => count + 1)}
                loadImage={loadImage}
              />
            ) : (
              <CsvTableEditor content={doc.content} onChange={onContentChange} />
            )}
          </div>
        )}
      </div>
      {contextMenu && (
        <Menu
          label="Editor actions"
          items={contextMenuItems}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </main>
  );
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
