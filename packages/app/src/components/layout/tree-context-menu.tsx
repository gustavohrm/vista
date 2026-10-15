import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Minimum distance, in pixels, kept between the menu and any viewport edge. */
const VIEWPORT_MARGIN_PX = 8;

interface TreeContextMenuProps {
  /** Viewport x coordinate to position the menu at. */
  x: number;
  /** Viewport y coordinate to position the menu at. */
  y: number;
  /** Whether to show "New File" and "New Folder" items (directories and the workspace root). */
  canCreateChildren: boolean;
  /** Whether to show "Rename" and "Delete" items (false for the workspace root, which is neither). */
  canRenameOrDelete: boolean;
  /** Callback fired when "New File" is chosen. */
  onNewFile: () => void;
  /** Callback fired when "New Folder" is chosen. */
  onNewFolder: () => void;
  /** Callback fired when "Rename" is chosen. */
  onRename: () => void;
  /** Callback fired when "Delete" is chosen. The caller is responsible for confirming the deletion. */
  onDelete: () => void;
  /** Callback fired to close the menu, e.g. on outside click, Escape, or after an action. */
  onClose: () => void;
}

/**
 * Floating context menu for file and folder actions in the workspace tree, positioned at a
 * given viewport coordinate. The menu is shifted inward when it would overflow the viewport.
 * Closes on outside click, Escape, or after any action is chosen.
 *
 * @param props - TreeContextMenu properties.
 * @returns Context menu element.
 */
export function TreeContextMenu({
  x,
  y,
  canCreateChildren,
  canRenameOrDelete,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onClose,
}: TreeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: clampToViewport(x, width, window.innerWidth),
      top: clampToViewport(y, height, window.innerHeight),
    });
  }, [x, y]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="File actions"
      style={{ top: position.top, left: position.left }}
      className="card soft floating fixed z-50 flex min-w-40 flex-col overflow-hidden p-1 text-[13px]"
    >
      {canCreateChildren && (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onNewFile();
              onClose();
            }}
            className="btn ghost sm w-full justify-start"
          >
            <i className="ic-file-plus text-sm" aria-hidden="true" />
            New File
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onNewFolder();
              onClose();
            }}
            className="btn ghost sm w-full justify-start"
          >
            <i className="ic-folder-plus text-sm" aria-hidden="true" />
            New Folder
          </button>
        </>
      )}
      {canRenameOrDelete && (
        <>
          {canCreateChildren && (
            <div role="separator" className="divider my-1 [--divider-color:var(--intent-border)]" />
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onRename();
              onClose();
            }}
            className="btn ghost sm w-full justify-start"
          >
            <i className="ic-pencil text-sm" aria-hidden="true" />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="btn ghost sm destructive w-full justify-start"
          >
            <i className="ic-trash-2 text-sm" aria-hidden="true" />
            Delete
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Keeps a menu of the given size fully inside one axis of the viewport, leaving a margin at the
 * edges. Returns the requested start position unchanged when it already fits.
 *
 * @param start - Requested coordinate along the axis.
 * @param size - Measured size of the menu along the same axis.
 * @param viewportSize - Size of the viewport along the same axis.
 * @returns The clamped coordinate.
 */
function clampToViewport(start: number, size: number, viewportSize: number): number {
  const maxStart = viewportSize - size - VIEWPORT_MARGIN_PX;
  return Math.max(VIEWPORT_MARGIN_PX, Math.min(start, maxStart));
}
