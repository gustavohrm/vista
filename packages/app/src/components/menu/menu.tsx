import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { formatShortcut } from "../../commands";

/** Minimum distance, in pixels, kept between the menu and any viewport edge. */
const VIEWPORT_MARGIN_PX = 8;

/** One action in a menu. */
export interface MenuItem {
  label: string;
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
  destructive?: boolean;
  onSelect: () => void;
}

export const MENU_SEPARATOR = "separator";

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
  /** Called with -1 or 1 for ArrowLeft or ArrowRight, so a menu bar can move to the next menu. */
  onNavigate?: (direction: -1 | 1) => void;
  /** A pointer down inside this element does not close the menu, such as the menu bar that toggles it. */
  ignorePointerDownIn?: Element | null;
}

/**
 * A floating menu of actions, used by the menu bar and every right-click menu. It takes focus when
 * it opens, moves with the arrow keys, Home, and End, and closes on Escape, Tab, a choice, or a
 * pointer down outside it. Closing by keyboard or by a choice returns focus to where it was, and
 * a chosen action runs after that, so editing actions apply to the editor the user was in.
 */
export function Menu({ label, items, x, y, onClose, returnFocusTo, onNavigate, ignorePointerDownIn }: MenuProps) {
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

  useEffect(() => {
    // With every item disabled, the menu itself takes focus so its keys still work.
    (getEnabledItems(menuRef.current)[0] ?? menuRef.current)?.focus();
  }, []);

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
    const focusAt = (next: number) => enabledItems[(next + enabledItems.length) % enabledItems.length]?.focus();
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
      case "ArrowLeft":
      case "ArrowRight":
        if (!onNavigate) {
          return;
        }
        onNavigate(event.key === "ArrowLeft" ? -1 : 1);
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
      onContextMenu={(event) => event.preventDefault()}
      style={{ top: position.top, left: position.left }}
      className="card soft floating fixed z-50 flex max-h-[calc(100vh-16px)] min-w-48 flex-col overflow-y-auto p-1 text-[13px] [--ui-radius-surface:8px]"
    >
      {items.map((item, index) =>
        item === MENU_SEPARATOR ? (
          // oxlint-disable-next-line react/no-array-index-key -- separators have no identity besides their position
          <MenuSeparator key={`separator-${index}`} />
        ) : (
          <MenuItemButton key={item.label} item={item} hasIconColumn={hasIcons} onChoose={() => choose(item)} />
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
  const icon = isCheckbox ? item.checked && <i className="ic-check" /> : item.icon;
  return (
    <button
      type="button"
      role={isCheckbox ? "menuitemcheckbox" : "menuitem"}
      aria-checked={isCheckbox ? item.checked : undefined}
      aria-disabled={item.disabled || undefined}
      aria-keyshortcuts={item.shortcut ? toAriaShortcut(item.shortcut) : undefined}
      data-menu-item
      tabIndex={-1}
      onClick={onChoose}
      onPointerMove={(event) => {
        if (!item.disabled && document.activeElement !== event.currentTarget) {
          event.currentTarget.focus();
        }
      }}
      className={`btn ghost sm min-h-7! w-full justify-start gap-2 px-2! py-0! font-normal outline-none! [--ui-radius:4px] focus:[--ui-fill:12%] ${item.destructive ? "destructive" : ""} ${
        item.disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      {hasIconColumn && (
        <span aria-hidden="true" className="flex w-4 flex-none justify-center text-sm">
          {icon}
        </span>
      )}
      <span className="flex-1 text-left whitespace-nowrap">{item.label}</span>
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

function getEnabledItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? [...menu.querySelectorAll<HTMLElement>("[data-menu-item]:not([aria-disabled])")] : [];
}

/**
 * Keeps a menu of the given size fully inside one axis of the viewport, leaving a margin at the
 * edges. Returns the requested start position unchanged when it already fits.
 */
function clampToViewport(start: number, size: number, viewportSize: number): number {
  const maxStart = viewportSize - size - VIEWPORT_MARGIN_PX;
  return Math.max(VIEWPORT_MARGIN_PX, Math.min(start, maxStart));
}
