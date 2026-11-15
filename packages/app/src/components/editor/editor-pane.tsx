import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import type { EditorSettings } from "../../domain/settings";
import { getViewer } from "../../domain/viewers";
import type { OpenDocument } from "../../state/documents";
import { Menu, type MenuEntry } from "../menu/menu";
import { CsvTableEditor } from "./csv-table-editor";
import { createDomFindTarget } from "./dom-find";
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
  onContentChange: (newContent: string) => void;
  /** Called with the active tab's key when its raw editor cursor or selection moves. */
  onCursorChange: (key: string, cursor: CursorInfo) => void;
  /** Called with the active tab's key when vim's mode changes, and with null when vim goes off. */
  onVimModeChange: (key: string, mode: string | null) => void;
  /** Raw editor state of each open tab, kept by the owner of the tabs. */
  rawEditorStates: RawEditorStateCache;
  /** App command shortcuts that the raw editor leaves to the commands layer. */
  reservedShortcuts: readonly string[];
  editorSettings: EditorSettings;
  /** The open find bar, or null when it is closed. */
  find: FindRequest | null;
  onFindClose: () => void;
  /** A position in the active document to move the raw editor's cursor to. */
  pendingJump: EditorPosition | null;
  onJumpApplied: () => void;
  /** Items of the editor's right-click menu. */
  contextMenuItems: readonly MenuEntry[];
  /** Loads an image a Markdown document links to; see `MarkdownEditor`. */
  loadImage?: (src: string) => Promise<string | Blob | null>;
  /** Shown in place of an editor while no tab is open. */
  emptyState?: ReactNode;
}

/** Hosts the find bar and the active document's editor. */
export function EditorPane({
  platform,
  document: doc,
  onContentChange,
  onCursorChange,
  onVimModeChange,
  rawEditorStates,
  reservedShortcuts,
  editorSettings,
  find,
  onFindClose,
  pendingJump,
  onJumpApplied,
  contextMenuItems,
  loadImage,
  emptyState,
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
    return (
      <main
        role="main"
        data-platform={platform}
        className="bg-background text-text flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {emptyState}
      </main>
    );
  }

  return (
    <main role="main" data-platform={platform} className="bg-background text-text flex flex-1 flex-col overflow-hidden">
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
            canReplace={isRawShown && !doc.isReadOnly}
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
            readOnly={doc.isReadOnly}
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
              // The editor owns its document once mounted, so each tab, and each reload from disk, gets its own instance.
              <MarkdownEditor
                key={`${doc.key}:${doc.revision}`}
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
