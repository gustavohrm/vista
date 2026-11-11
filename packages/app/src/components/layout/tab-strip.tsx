import { useRef, type KeyboardEvent, type MouseEvent } from "react";

import type { OpenDocument } from "../../state/documents";
import { FileIcon } from "./file-icon";

const MIDDLE_BUTTON = 1;

interface TabStripProps {
  documents: readonly OpenDocument[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onClose: (key: string) => void;
}

/** One tab per open document. Arrow keys move between tabs, and a middle click closes one. */
export function TabStrip({ documents, activeKey, onActivate, onClose }: TabStripProps) {
  const listRef = useRef<HTMLDivElement>(null);

  if (documents.length === 0) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) {
      return;
    }
    const currentIndex = documents.findIndex((doc) => doc.key === activeKey);
    const next = documents[(currentIndex + step + documents.length) % documents.length];
    if (!next) {
      return;
    }
    event.preventDefault();
    onActivate(next.key);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-key="${CSS.escape(next.key)}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Open files"
      className="border-border bg-foreground flex h-9 flex-none overflow-x-auto overflow-y-hidden border-b"
    >
      {documents.map((doc) => (
        <Tab
          key={doc.key}
          document={doc}
          isActive={doc.key === activeKey}
          onActivate={() => onActivate(doc.key)}
          onClose={() => onClose(doc.key)}
          onKeyDown={handleKeyDown}
        />
      ))}
    </div>
  );
}

interface TabProps {
  document: OpenDocument;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function Tab({ document: doc, isActive, onActivate, onClose, onKeyDown }: TabProps) {
  const handleAuxClick = (event: MouseEvent) => {
    if (event.button === MIDDLE_BUTTON) {
      event.preventDefault();
      onClose();
    }
  };

  // Stops the browser's middle-click autoscroll from starting before the auxclick closes the tab.
  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === MIDDLE_BUTTON) {
      event.preventDefault();
    }
  };

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- middle-click close is a mouse shortcut; keyboard users close with the tab's own Close button
    <div
      onAuxClick={handleAuxClick}
      onMouseDown={handleMouseDown}
      className={`group border-border flex max-w-56 flex-none items-center border-r ${
        isActive ? "bg-background text-text-strong" : "text-text-secondary hover:bg-surface hover:text-text"
      }`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        data-tab-key={doc.key}
        title={doc.path}
        onClick={onActivate}
        onKeyDown={onKeyDown}
        className="flex h-full min-w-0 items-center gap-1.5 pr-1 pl-3 text-xs outline-none focus-visible:underline"
      >
        <FileIcon extension={doc.extension} className="text-text-secondary flex-none" />
        <span className="min-w-0 truncate">{doc.name}</span>
        {doc.isDirty && <span className="visually-hidden">(unsaved)</span>}
      </button>
      <button
        type="button"
        aria-label={`Close ${doc.name}`}
        tabIndex={isActive ? 0 : -1}
        onClick={onClose}
        className="btn ghost icon sm mr-1 flex-none"
      >
        {doc.isDirty ? (
          <>
            <span
              aria-hidden="true"
              className="bg-text-secondary inline-block size-2 rounded-full group-hover:hidden"
            />
            <span className="hidden group-hover:inline-flex">
              <i className="ic-x" aria-hidden="true" />
            </span>
          </>
        ) : (
          <span className={isActive ? "inline-flex" : "inline-flex opacity-0 group-hover:opacity-100"}>
            <i className="ic-x" aria-hidden="true" />
          </span>
        )}
      </button>
    </div>
  );
}
