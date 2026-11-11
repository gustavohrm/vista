import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import type { OpenDocument } from "../../state/documents";
import { Menu, MENU_SEPARATOR, type MenuEntry } from "../menu/menu";
import { FileIcon } from "./file-icon";

const MIDDLE_BUTTON = 1;

interface TabStripProps {
  documents: readonly OpenDocument[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  /** Closes a tab, resolving to false when the user cancelled at the unsaved-changes prompt. */
  onClose: (key: string) => Promise<boolean>;
  /** Closes several tabs at once, from the tab menu. The caller asks about unsaved changes. */
  onCloseMany: (keys: string[]) => Promise<boolean>;
  onCopyRelativePath: (path: string) => void;
}

/**
 * One tab per open document. Arrow keys move between tabs, a middle click closes one, and a right
 * click opens a menu of close and copy actions.
 */
export function TabStrip({
  documents,
  activeKey,
  onActivate,
  onClose,
  onCloseMany,
  onCopyRelativePath,
}: TabStripProps) {
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Set when a tab is closed from its focused Close button or from its menu. Closing removes the
  // focused element, so focus follows the newly active tab once the close completes; a cancelled
  // close keeps it.
  const keyboardClosedKeyRef = useRef<string | null>(null);

  const closeTabs = async (focusedKey: string | null, close: () => Promise<boolean>) => {
    keyboardClosedKeyRef.current = focusedKey;
    // A cancelled close must not move focus later, when that tab goes some other way.
    if (!(await close()) && keyboardClosedKeyRef.current === focusedKey) {
      keyboardClosedKeyRef.current = null;
    }
  };

  useEffect(() => {
    const closedKey = keyboardClosedKeyRef.current;
    if (closedKey === null || documents.some((doc) => doc.key === closedKey)) {
      return;
    }
    keyboardClosedKeyRef.current = null;
    if (activeKey !== null) {
      focusTab(activeKey);
    }
  });

  const focusTab = (key: string) => {
    listRef.current?.querySelector<HTMLElement>(`[data-tab-key="${CSS.escape(key)}"]`)?.focus();
  };

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
    focusTab(next.key);
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
          onClose={(event) => {
            // A click with no pointer detail came from the keyboard (Enter or Space).
            void closeTabs(event.detail === 0 ? doc.key : null, () => onClose(doc.key));
          }}
          onKeyDown={handleKeyDown}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ key: doc.key, x: event.clientX, y: event.clientY });
          }}
        />
      ))}
      {menu && (
        <Menu
          label="Tab actions"
          items={buildTabMenu(documents, menu.key, {
            onClose: (key) => void closeTabs(key, () => onClose(key)),
            onCloseMany: (keys) => void closeTabs(keys.includes(menu.key) ? menu.key : null, () => onCloseMany(keys)),
            onCopyRelativePath,
          })}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/** Lists the close actions for a tab, each disabled when it would close nothing, then Copy Relative Path. */
function buildTabMenu(
  documents: readonly OpenDocument[],
  key: string,
  actions: {
    onClose: (key: string) => void;
    onCloseMany: (keys: string[]) => void;
    onCopyRelativePath: (path: string) => void;
  },
): MenuEntry[] {
  const index = documents.findIndex((doc) => doc.key === key);
  const target = documents[index];
  if (!target) {
    return [];
  }
  const keysOf = (docs: readonly OpenDocument[]) => docs.map((doc) => doc.key);
  const others = keysOf(documents.filter((doc) => doc.key !== key));
  const toTheRight = keysOf(documents.slice(index + 1));
  const saved = keysOf(documents.filter((doc) => !doc.isDirty));
  return [
    { label: "Close", icon: <i className="ic-x" aria-hidden="true" />, onSelect: () => actions.onClose(key) },
    { label: "Close Others", disabled: others.length === 0, onSelect: () => actions.onCloseMany(others) },
    { label: "Close to the Right", disabled: toTheRight.length === 0, onSelect: () => actions.onCloseMany(toTheRight) },
    { label: "Close Saved", disabled: saved.length === 0, onSelect: () => actions.onCloseMany(saved) },
    { label: "Close All", onSelect: () => actions.onCloseMany(keysOf(documents)) },
    MENU_SEPARATOR,
    {
      label: "Copy Relative Path",
      icon: <i className="ic-copy" aria-hidden="true" />,
      onSelect: () => actions.onCopyRelativePath(target.path),
    },
  ];
}

interface TabProps {
  document: OpenDocument;
  isActive: boolean;
  onActivate: () => void;
  onClose: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onContextMenu: (event: MouseEvent) => void;
}

function Tab({ document: doc, isActive, onActivate, onClose, onKeyDown, onContextMenu }: TabProps) {
  const handleAuxClick = (event: MouseEvent) => {
    if (event.button === MIDDLE_BUTTON) {
      event.preventDefault();
      onClose(event);
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
      onContextMenu={onContextMenu}
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
