import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent } from "react";
import { createPortal } from "react-dom";

import { TOOLTIP_DELAY_MS } from "../feedback/tooltip";
import { WorkspaceGlyph } from "../workspace/workspace-glyph";
import type { ManagedWorkspace } from "./workspace-manager";

const FOLDER_STATUS_TEXT = {
  ready: null,
  "needs-permission": "Needs access",
  unavailable: "Not found",
} as const;

/** The gap between the item and its popover, and the least room the popover keeps from the window's edge, in pixels. */
const POPOVER_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 8;
/** The popover's widest, `max-w-72`, so it opens below an item with no room for it to the right. */
const POPOVER_MAX_WIDTH_PX = 288;

interface WorkspaceNavItemProps {
  workspace: ManagedWorkspace;
  isCurrent: boolean;
  onSelect: () => void;
}

/**
 * A workspace in Settings' navigation: its tile and name, a dot while it is the open workspace, and
 * faded while none of its folders is found. While its page isn't shown, resting the pointer on it,
 * or reaching it with the keyboard, shows its folders in a popover beside it, each with why it can't
 * be reached, when the name alone doesn't say which folders it holds. The popover is drawn over the
 * page, since the navigation scrolls and would cut it off.
 *
 * @param props - WorkspaceNavItem properties.
 * @returns Navigation item.
 */
export function WorkspaceNavItem({ workspace, isCurrent, onSelect }: WorkspaceNavItemProps) {
  const popoverId = useId();
  const statusId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef(0);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const folders = workspace.folders ?? [];
  const onlyFolder = folders.length === 1 ? folders[0] : undefined;
  // One folder named like the workspace says nothing the name doesn't, unless it can't be reached.
  const hasPopover =
    !isCurrent &&
    folders.length > 0 &&
    (folders.length > 1 || onlyFolder?.name !== workspace.name || onlyFolder.status !== "ready");
  const statusText = workspace.status === "open" ? "Open" : workspace.status === "unavailable" ? "Not found" : null;

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  useEffect(() => {
    if (!hasPopover) {
      window.clearTimeout(timerRef.current);
      setPosition(null);
    }
  }, [hasPopover]);
  // Placed by its item, it moves up as far as needed to end inside the window, as measured once shown.
  useLayoutEffect(() => {
    const height = popoverRef.current?.offsetHeight ?? 0;
    const lowest = Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - VIEWPORT_MARGIN_PX - height);
    if (position !== null && position.top > lowest) {
      setPosition({ ...position, top: lowest });
    }
  }, [position]);
  useEffect(() => {
    if (position === null) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPosition(null);
      }
    };
    // The navigation scrolls under it, so it hides rather than drift away from its item.
    const hide = () => setPosition(null);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [position]);

  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    // Beside the item where it fits, as in the navigation on the left; below it in the row across the top.
    const fitsBeside = rect.right + POPOVER_GAP_PX + POPOVER_MAX_WIDTH_PX <= window.innerWidth - VIEWPORT_MARGIN_PX;
    setPosition(
      fitsBeside
        ? { left: rect.right + POPOVER_GAP_PX, top: rect.top }
        : {
            left: Math.max(
              VIEWPORT_MARGIN_PX,
              Math.min(rect.left, window.innerWidth - VIEWPORT_MARGIN_PX - POPOVER_MAX_WIDTH_PX),
            ),
            top: rect.bottom + POPOVER_GAP_PX,
          },
    );
  };
  const hide = () => {
    window.clearTimeout(timerRef.current);
    setPosition(null);
  };

  const handlePointerEnter = () => {
    if (hasPopover) {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(show, TOOLTIP_DELAY_MS);
    }
  };
  const handleFocus = (event: FocusEvent<HTMLButtonElement>) => {
    if (hasPopover && isFocusVisible(event.currentTarget)) {
      show();
    }
  };

  const describedBy = [statusText ? statusId : null, hasPopover ? popoverId : null].filter(Boolean).join(" ");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-workspace-id={workspace.id}
        aria-current={isCurrent ? "page" : undefined}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        onClick={() => {
          hide();
          onSelect();
        }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={hide}
        onFocus={handleFocus}
        onBlur={hide}
        className={`flex h-7 max-w-56 min-w-0 flex-none cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] md:w-full md:max-w-none ${
          isCurrent ? "bg-selected text-text-strong font-medium" : "text-text hover:bg-hover"
        }`}
      >
        <span
          className={`flex min-w-0 flex-1 items-center gap-2.5 ${workspace.status === "unavailable" ? "opacity-50" : ""}`}
        >
          <WorkspaceGlyph icon={workspace.icon} color={workspace.color} isTile className="text-xs" />
          <span className="truncate">{workspace.name}</span>
        </span>
        {workspace.status === "open" && (
          <span className="bg-text-muted size-1.5 flex-none rounded-full" aria-hidden="true" />
        )}
        {statusText && (
          // Out of the name, which is the workspace's alone; the description reads it.
          <span id={statusId} className="visually-hidden" aria-hidden="true">
            {statusText}
          </span>
        )}
      </button>
      {hasPopover &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            id={popoverId}
            style={position ? positionStyle(position) : undefined}
            className={`bg-pop border-line-strong text-text-strong shadow-float fixed z-50 flex max-w-72 flex-col gap-1 overflow-y-auto rounded-md border px-2.5 py-2 text-xs leading-4 transition-opacity duration-100 motion-reduce:transition-none ${
              position ? "visible opacity-100" : "invisible opacity-0"
            }`}
          >
            <ul className="flex flex-col gap-1">
              {folders.map((folder) => (
                <li key={folder.id} className="flex min-w-0 items-center gap-2">
                  <i className="ic-folder text-text-faint flex-none" aria-hidden="true" />
                  <span className="truncate">{folder.name}</span>
                  {FOLDER_STATUS_TEXT[folder.status] && (
                    <span className="text-text-muted flex-none">
                      <span className="visually-hidden">, </span>
                      {FOLDER_STATUS_TEXT[folder.status]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Where it was placed, no taller than the window, scrolling past that. */
function positionStyle({ left, top }: { left: number; top: number }) {
  return {
    left,
    top: Math.max(VIEWPORT_MARGIN_PX, top),
    maxHeight: `calc(100vh - ${VIEWPORT_MARGIN_PX * 2}px)`,
  };
}

/** Whether focus on the element came from the keyboard, as the browser judges it. */
function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}
