import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { shortenPath, type DocumentLocation } from "../../domain/document-location";
import type { OpenDocument } from "../../state/documents";
import { Menu, MENU_SEPARATOR, type MenuEntry } from "../menu/menu";
import { FileIcon } from "./file-icon";
import { useTabDrag } from "./use-tab-drag";

const MIDDLE_BUTTON = 1;

interface TabStripProps {
  documents: readonly OpenDocument[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  /** Moves a tab to another place in the row. */
  onReorder: (key: string, toIndex: number) => void;
  /** Closes a tab, resolving to false when the user cancelled at the unsaved-changes prompt. */
  onClose: (key: string) => Promise<boolean>;
  /** Closes several tabs at once, from the tab menu. The caller asks about unsaved changes. */
  onCloseMany: (keys: string[]) => Promise<boolean>;
  onCopyRelativePath: (path: string) => void;
  /** Copies a tab's full path on disk. Omitted where there is none, such as in the browser. */
  onCopyPath?: (doc: OpenDocument) => void;
  /** Shows a tab's file in the operating system's file manager. Omitted where there is none. */
  onReveal?: (doc: OpenDocument) => void;
  /** What acts on the active tab, at the row's right end. */
  actions?: ReactNode;
  /** Where a tab's file is, as the path bar shows it. */
  locate?: (doc: OpenDocument) => DocumentLocation | null;
}

/**
 * The tabs row: one tab per open document, then the active tab's actions. Arrow keys move between
 * tabs, a middle click closes one, and a right click opens a menu of close and copy actions.
 */
export function TabStrip({
  documents,
  activeKey,
  onActivate,
  onReorder,
  onClose,
  onCloseMany,
  onCopyRelativePath,
  onCopyPath,
  onReveal,
  actions,
  locate,
}: TabStripProps) {
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Set when a tab is closed from its focused Close button or from its menu. Closing removes the
  // focused element, so focus follows the newly active tab once the close completes; a cancelled
  // close keeps it.
  const keyboardClosedKeyRef = useRef<string | null>(null);
  // Set when a tab is moved from the keyboard, so it takes focus again once the row has its new
  // order. Chromium keeps focus on an element React moves, so the e2e tests pass without this; the
  // HTML focus fixup rule drops focus from a removed element, which other engines may apply to a move.
  const movedKeyRef = useRef<string | null>(null);
  const isReducedMotion = useReducedMotion() ?? false;
  const { drag, startDrag } = useTabDrag(listRef, onReorder, isReducedMotion);

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

  useEffect(() => {
    if (movedKeyRef.current !== null) {
      focusTab(movedKeyRef.current);
      movedKeyRef.current = null;
    }
  }, [documents]);

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
    if (event.shiftKey) {
      // Moves the focused tab one place, stopping at the ends of the row.
      const key = event.currentTarget.dataset.tabKey;
      const index = documents.findIndex((doc) => doc.key === key);
      event.preventDefault();
      if (key !== undefined && index >= 0) {
        onReorder(key, index + step);
        movedKeyRef.current = key;
      }
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
    <div className="flex h-10 flex-none items-center gap-2 pr-1.5">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Open files"
        className="relative flex h-full min-w-0 flex-1 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto overflow-y-hidden pl-1.5"
      >
        <AnimatePresence initial={false}>
          {documents.map((doc) => (
            <Tab
              key={doc.key}
              document={doc}
              {...describeTab(doc, documents, locate)}
              isActive={doc.key === activeKey}
              isDragged={drag?.key === doc.key}
              dragOffset={drag?.offsets[doc.key]}
              isSettling={drag?.isSettling ?? false}
              isRowDragging={drag !== null}
              onActivate={() => onActivate(doc.key)}
              onPointerDown={(event) => startDrag(doc.key, event)}
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
        </AnimatePresence>
        {menu && (
          <Menu
            label="Tab actions"
            items={buildTabMenu(documents, menu.key, {
              onClose: (key) => void closeTabs(key, () => onClose(key)),
              onCloseMany: (keys) => void closeTabs(keys.includes(menu.key) ? menu.key : null, () => onCloseMany(keys)),
              onCopyRelativePath,
              onCopyPath,
              onReveal,
            })}
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
      {actions}
    </div>
  );
}

/**
 * Lists the close actions for a tab, each disabled when it would close nothing, then the path
 * actions: Copy Path and Reveal where the host has them, and Copy Relative Path.
 */
function buildTabMenu(
  documents: readonly OpenDocument[],
  key: string,
  actions: {
    onClose: (key: string) => void;
    onCloseMany: (keys: string[]) => void;
    onCopyRelativePath: (path: string) => void;
    onCopyPath?: (doc: OpenDocument) => void;
    onReveal?: (doc: OpenDocument) => void;
  },
): MenuEntry[] {
  const index = documents.findIndex((doc) => doc.key === key);
  const target = documents[index];
  if (!target) {
    return [];
  }
  const { onCopyPath, onReveal } = actions;
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
    ...(onCopyPath
      ? [
          {
            label: "Copy Path",
            icon: <i className="ic-clipboard" aria-hidden="true" />,
            onSelect: () => onCopyPath(target),
          },
        ]
      : []),
    {
      label: "Copy Relative Path",
      icon: <i className="ic-copy" aria-hidden="true" />,
      onSelect: () => actions.onCopyRelativePath(target.path),
    },
    ...(onReveal
      ? [
          {
            label: "Reveal in File Explorer",
            icon: <i className="ic-folder-open" aria-hidden="true" />,
            onSelect: () => onReveal(target),
          },
        ]
      : []),
  ];
}

/**
 * Names a tab after its file, adding the folder the file is in when another open tab has the same
 * file name, and gives it the path bar's path as its tooltip.
 */
function describeTab(
  doc: OpenDocument,
  documents: readonly OpenDocument[],
  locate: TabStripProps["locate"],
): { label: string; folderHint: string | null; title: string } {
  const location = locate?.(doc) ?? null;
  const parent = location?.segments.at(-2);
  const folderHint =
    parent && documents.some((other) => other.key !== doc.key && other.name === doc.name) ? parent : null;
  return {
    label: folderHint ? `${doc.name} · ${folderHint}` : doc.name,
    folderHint,
    title: location ? shortenPath(location, 0) : doc.path,
  };
}

interface TabProps {
  document: OpenDocument;
  /** The tab's name: the file name, with its folder when another tab has the same file name. */
  label: string;
  /** The folder the file is in, shown fainter after its name, when another tab has the same file name. */
  folderHint: string | null;
  /** The tab's tooltip. */
  title: string;
  isActive: boolean;
  /** Whether the tab is being dragged to another place. */
  isDragged: boolean;
  /** How far a drag has moved the tab from its place, in pixels: under the pointer, or aside for it. */
  dragOffset: number | undefined;
  /** Whether a drag has ended and the tabs are sliding into their places. */
  isSettling: boolean;
  /** Whether any tab in the row is being dragged, which lets the others slide aside. */
  isRowDragging: boolean;
  onActivate: () => void;
  onPointerDown: (event: PointerEvent) => void;
  onClose: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onContextMenu: (event: MouseEvent) => void;
}

/** How long a new tab takes to grow in, and a closed one to shrink away, in seconds. */
const TAB_GROW_SECONDS = 0.15;
const TAB_SHRINK_SECONDS = 0.1;
const EASE_MOVE = [0.4, 0, 0.2, 1] as const;

/**
 * The dragged tab: above the tabs it passes, and filled opaquely with the selected tint over the
 * frame, so a tab under it does not show through. No shadow: it stays in the row, not above it.
 */
const DRAGGED_TAB_CLASS =
  "relative z-10 bg-frame! bg-[image:linear-gradient(var(--color-selected),var(--color-selected))] text-text-strong!";

function Tab({
  document: doc,
  label,
  folderHint,
  title,
  isActive,
  isDragged,
  dragOffset,
  isSettling,
  isRowDragging,
  onActivate,
  onPointerDown,
  onClose,
  onKeyDown,
  onContextMenu,
}: TabProps) {
  // A closed tab stays a moment while it shrinks away; meanwhile it is not a tab any more, so the
  // row's keys, focus, and drag measure only the tabs that remain.
  const isPresent = useIsPresent();
  const isReduced = useReducedMotion() ?? false;

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
    // A new tab grows in from nothing, pushing the tabs after it aside, and a closed one shrinks
    // away as they close the gap. Clipped only while it grows or shrinks, so a drag can move it.
    <motion.div
      initial={{ width: 0, opacity: 0, overflow: "hidden" }}
      animate={{
        width: "auto",
        opacity: 1,
        transition: { duration: isReduced ? 0 : TAB_GROW_SECONDS, ease: EASE_MOVE },
        transitionEnd: { overflow: "visible" },
      }}
      exit={{
        width: 0,
        opacity: 0,
        overflow: "hidden",
        transition: { duration: isReduced ? 0 : TAB_SHRINK_SECONDS, ease: EASE_MOVE },
      }}
      inert={!isPresent}
      className="flex flex-none"
    >
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- middle-click close is a mouse shortcut; keyboard users close with the tab's own Close button */}
      <div
        onAuxClick={handleAuxClick}
        onMouseDown={handleMouseDown}
        onContextMenu={onContextMenu}
        data-tab-dragging={isDragged ? "" : undefined}
        style={dragOffset ? { transform: `translateX(${dragOffset}px)` } : undefined}
        // The dragged tab stays under the pointer and above the tabs it passes; the others, and the
        // dragged one once released, slide. Outside a drag nothing slides, so keyboard moves are instant.
        className={`group flex h-7 max-w-56 flex-none items-center rounded-md ease-(--ease-move) motion-reduce:transition-none ${
          isDragged ? DRAGGED_TAB_CLASS : ""
        } ${
          isRowDragging && (!isDragged || isSettling)
            ? "transition-[transform,background-color,color] duration-150"
            : "transition-colors duration-100"
        } ${isActive ? "bg-selected text-text-strong" : "text-text-muted hover:bg-hover hover:text-text"}`}
      >
        <button
          type="button"
          role="tab"
          aria-selected={isActive}
          tabIndex={isActive ? 0 : -1}
          // Named in full, so a screen reader hears the folder that tells two same-named tabs apart.
          aria-label={doc.isDirty ? `${label} (unsaved)` : label}
          data-tab-key={isPresent ? doc.key : undefined}
          title={title}
          onClick={onActivate}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          className="flex h-full min-w-0 items-center gap-1.5 rounded-md pr-1 pl-2.5 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-inset"
        >
          <FileIcon extension={doc.extension} className="text-text-faint flex flex-none text-sm" />
          <span className="min-w-0 truncate">{doc.name}</span>
          {folderHint && <span className="text-text-faint min-w-0 truncate">{folderHint}</span>}
          {doc.isDirty && <span className="visually-hidden">(unsaved)</span>}
        </button>
        <button
          type="button"
          aria-label={`Close ${label}`}
          tabIndex={isActive ? 0 : -1}
          onClick={onClose}
          className="btn ghost icon sm mr-1 size-5! min-h-0! min-w-0! flex-none p-0! text-[11px] [--ui-radius:4px]"
        >
          {doc.isDirty ? (
            <>
              <span
                aria-hidden="true"
                className="bg-text-muted inline-block size-1.5 rounded-full group-hover:hidden"
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
    </motion.div>
  );
}
