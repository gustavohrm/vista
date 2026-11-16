import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { formatShortcut } from "../../commands";

/** Minimum distance, in pixels, kept between the menu and any viewport edge. */
const VIEWPORT_MARGIN_PX = 8;

/** One action in a menu. */
export interface MenuItem {
  /** Tells items apart when two have the same label; the label otherwise. */
  id?: string;
  label: string;
  /** A second, quieter line under the label. */
  description?: string;
  /**
   * Icon element, such as `<i className="ic-copy" aria-hidden="true" />`. The icon transform only sees
   * a literal `ic-*` class, so callers pass the element rather than its class name.
   */
  icon?: ReactNode;
  /** Shortcut shown beside the label, such as "Mod+S". Display only; the menu does not bind it. */
  shortcut?: string;
  disabled?: boolean;
  /** Makes the item a checkbox item showing this state. */
  checked?: boolean;
  /** Makes the item one of a set of options, marked when it is the chosen one; its icon stays. */
  selected?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}

export const MENU_SEPARATOR = "separator";

/**
 * The input the user pressed last, which tells whether a menu opening now was opened with the
 * keyboard or the pointer. Watched on the whole document, so no caller has to pass it.
 */
let lastInput: "keyboard" | "pointer" = "keyboard";
if (typeof document !== "undefined") {
  document.addEventListener("keydown", () => (lastInput = "keyboard"), true);
  document.addEventListener("pointerdown", () => (lastInput = "pointer"), true);
}

export type MenuEntry = MenuItem | typeof MENU_SEPARATOR;

interface MenuProps {
  /** Accessible name of the menu. */
  label: string;
  items: readonly MenuEntry[];
  /** Viewport coordinates to open at; the menu moves inward when it would overflow. */
  x: number;
  y: number;
  onClose: () => void;
  /**
   * Element to focus when the menu closes by choice or by keyboard. Defaults to the element that
   * had focus when the menu opened, so an action chosen from the menu runs where the user was.
   */
  returnFocusTo?: Element | null;
  /** A pointer down inside this element does not close the menu, such as the button that toggles it. */
  ignorePointerDownIn?: Element | null;
}

/**
 * A floating menu of actions, used by the button menus and every right-click menu. It takes focus
 * when it opens, highlighting its first item only when opened with the keyboard, moves with the
 * arrow keys, Home, and End, and closes on Escape, Tab, a choice, or a pointer down outside it. Closing by keyboard or by a choice returns focus to where it was, and
 * a chosen action runs after that, so editing actions apply to the editor the user was in.
 */
export function Menu({ label, items, x, y, onClose, returnFocusTo, ignorePointerDownIn }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  // Captured during the first render, before the menu takes focus.
  const [returnTarget] = useState(() => (returnFocusTo === undefined ? document.activeElement : returnFocusTo));

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

  // The highlight is the focused item. Set when the pointer gave it, so leaving the menu clears it,
  // and dropped when the keyboard moves it, so leaving then keeps it.
  const isPointerHighlightRef = useRef(false);

  useEffect(() => {
    // Opened with the pointer, nothing is highlighted until the pointer moves over an item. With
    // every item disabled, the menu itself takes focus too, so its keys still work.
    const firstItem = lastInput === "keyboard" ? getEnabledItems(menuRef.current)[0] : undefined;
    (firstItem ?? menuRef.current)?.focus();
  }, []);

  const clearPointerHighlight = () => {
    if (isPointerHighlightRef.current) {
      isPointerHighlightRef.current = false;
      menuRef.current?.focus();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const item = (event.target as Element).closest<HTMLElement>(ENABLED_ITEM_SELECTOR);
    if (!item) {
      clearPointerHighlight();
      return;
    }
    isPointerHighlightRef.current = true;
    if (document.activeElement !== item) {
      item.focus();
    }
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || ignorePointerDownIn?.contains(target)) {
        return;
      }
      onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [ignorePointerDownIn, onClose]);

  const closeAndReturnFocus = () => {
    onClose();
    if (returnTarget instanceof HTMLElement && returnTarget.isConnected) {
      returnTarget.focus();
    }
  };

  const choose = (item: MenuItem) => {
    if (item.disabled) {
      return;
    }
    closeAndReturnFocus();
    item.onSelect();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabledItems = getEnabledItems(menuRef.current);
    const index = enabledItems.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => {
      isPointerHighlightRef.current = false;
      enabledItems[(next + enabledItems.length) % enabledItems.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index < 0 ? -1 : index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(-1);
        break;
      case "Escape":
        closeAndReturnFocus();
        break;
      case "Tab":
        // Focus goes back first, so the browser's Tab then moves on from there in either direction.
        closeAndReturnFocus();
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const hasIcons = items.some((item) => item !== MENU_SEPARATOR && (item.icon || item.checked !== undefined));

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={clearPointerHighlight}
      onContextMenu={(event) => event.preventDefault()}
      // Grows from the point it was opened at, even when the viewport edge pushed it aside.
      style={{
        top: position.top,
        left: position.left,
        transformOrigin: `${x - position.left}px ${y - position.top}px`,
      }}
      className="vista-pop card soft floating fixed z-50 flex max-h-[calc(100vh-16px)] min-w-48 flex-col overflow-y-auto p-1 text-[13px] [--ui-radius-surface:8px]"
    >
      {items.map((item, index) =>
        item === MENU_SEPARATOR ? (
          // oxlint-disable-next-line react/no-array-index-key -- separators have no identity besides their position
          <MenuSeparator key={`separator-${index}`} />
        ) : (
          <MenuItemButton
            key={item.id ?? item.label}
            item={item}
            hasIconColumn={hasIcons}
            onChoose={() => choose(item)}
          />
        ),
      )}
    </div>,
    document.body,
  );
}

function MenuSeparator() {
  // oxlint-disable-next-line jsx-a11y/control-has-associated-label, jsx-a11y/prefer-tag-over-role -- a styled divider with no label, not a control; `divider` styles a div, and a native hr would bring browser styling the class does not reset
  return <div role="separator" className="divider my-1 [--divider-color:var(--color-surface)]" />;
}

interface MenuItemButtonProps {
  item: MenuItem;
  /** Whether to keep a column for icons and check marks, so labels line up. */
  hasIconColumn: boolean;
  onChoose: () => void;
}

function MenuItemButton({ item, hasIconColumn, onChoose }: MenuItemButtonProps) {
  const isCheckbox = item.checked !== undefined;
  const isOption = item.selected !== undefined;
  const icon = isCheckbox ? item.checked && <i className="ic-check" /> : item.icon;
  const descriptionId = useId();
  return (
    <button
      type="button"
      role={isCheckbox ? "menuitemcheckbox" : isOption ? "menuitemradio" : "menuitem"}
      aria-checked={isCheckbox ? item.checked : isOption ? item.selected : undefined}
      aria-describedby={item.description === undefined ? undefined : descriptionId}
      aria-disabled={item.disabled || undefined}
      aria-keyshortcuts={item.shortcut ? toAriaShortcut(item.shortcut) : undefined}
      data-menu-item
      tabIndex={-1}
      onClick={onChoose}
      // Focus is the one highlight: the menu moves it under the pointer, and there is no separate
      // hover fill to add to it.
      className={`focus:bg-surface flex min-h-7 w-full flex-none cursor-pointer items-center gap-2 rounded px-2 text-left outline-none ${
        item.destructive ? "text-destructive" : "text-text"
      } ${item.disabled ? "pointer-events-none opacity-40" : ""}`}
    >
      {hasIconColumn && (
        <span aria-hidden="true" className="flex w-4 flex-none justify-center text-sm">
          {icon}
        </span>
      )}
      {item.description === undefined ? (
        <span className="flex-1 text-left whitespace-nowrap">{item.label}</span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col py-1 text-left">
          <span className="truncate">{item.label}</span>
          <span id={descriptionId} aria-hidden="true" className="text-text-secondary truncate text-xs">
            {item.description}
          </span>
        </span>
      )}
      {item.selected && <i className="ic-check ml-4 flex-none text-sm" aria-hidden="true" />}
      {item.shortcut && (
        <kbd aria-hidden="true" className="text-text-secondary ml-6 flex-none font-sans text-xs">
          {formatShortcut(item.shortcut)}
        </kbd>
      )}
    </button>
  );
}

/** Writes a shortcut in the form `aria-keyshortcuts` takes, such as "Control+Alt+ArrowUp". */
function toAriaShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => ({ Mod: "Control", Up: "ArrowUp", Down: "ArrowDown" })[part] ?? part)
    .join("+");
}

const ENABLED_ITEM_SELECTOR = "[data-menu-item]:not([aria-disabled])";

function getEnabledItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? [...menu.querySelectorAll<HTMLElement>(ENABLED_ITEM_SELECTOR)] : [];
}

/**
 * Keeps a menu of the given size fully inside one axis of the viewport, leaving a margin at the
 * edges. Returns the requested start position unchanged when it already fits.
 */
function clampToViewport(start: number, size: number, viewportSize: number): number {
  const maxStart = viewportSize - size - VIEWPORT_MARGIN_PX;
  return Math.max(VIEWPORT_MARGIN_PX, Math.min(start, maxStart));
}
