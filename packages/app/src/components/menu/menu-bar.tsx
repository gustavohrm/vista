import { useRef, useState, type KeyboardEvent } from "react";

import { runCommand, type Command } from "../../commands";
import { Menu, MENU_SEPARATOR, type MenuEntry } from "./menu";

/** One menu of the menu bar, listing command ids and separators. */
export interface MenuBarMenu {
  label: string;
  items: readonly string[];
}

interface MenuBarProps {
  menus: readonly MenuBarMenu[];
  /** Commands the menus name by id. An id with no command is left out. */
  commands: readonly Command[];
}

interface OpenMenu {
  index: number;
  x: number;
  y: number;
  /** Where focus was before the menu bar was used, so a chosen action runs there. */
  returnFocusTo: Element | null;
}

/**
 * The application menu bar. It is one Tab stop: ArrowLeft and ArrowRight move between menus, and
 * Enter, Space, or ArrowDown opens one. A click opens a menu without moving focus first, so Edit
 * and Selection actions apply to the editor the user was typing in.
 */
export function MenuBar({ menus, commands }: MenuBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [open, setOpen] = useState<OpenMenu | null>(null);

  const getButton = (index: number) => barRef.current?.querySelectorAll<HTMLElement>("[data-menubar-item]")[index];

  const openMenu = (index: number, returnFocusTo: Element | null) => {
    const rect = getButton(index)?.getBoundingClientRect();
    setFocusIndex(index);
    setOpen({ index, x: rect?.left ?? 0, y: rect?.bottom ?? 0, returnFocusTo });
  };

  const closeMenu = (restoreFocus: boolean) => {
    if (restoreFocus && open?.returnFocusTo instanceof HTMLElement && open.returnFocusTo.isConnected) {
      open.returnFocusTo.focus();
    }
    setOpen(null);
  };

  const moveTo = (index: number) => {
    const next = (index + menus.length) % menus.length;
    if (open) {
      openMenu(next, open.returnFocusTo);
    } else {
      setFocusIndex(next);
      getButton(next)?.focus();
    }
  };

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveTo(index + (event.key === "ArrowRight" ? 1 : -1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(index, event.currentTarget);
    }
  };

  const openEntry = open === null ? undefined : menus[open.index];

  return (
    <div
      ref={barRef}
      role="menubar"
      aria-label="Application menu"
      className="border-border bg-foreground flex h-7 flex-none items-center gap-0.5 border-b px-1 text-xs"
    >
      {menus.map((menu, index) => (
        <button
          key={menu.label}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={open?.index === index}
          data-menubar-item
          tabIndex={index === focusIndex ? 0 : -1}
          // Keeps focus where it was, so the menu can return it there.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            if (open?.index === index) {
              closeMenu(true);
            } else {
              // A keyboard click (detail 0) comes from the focused button; a mouse click left focus where it was.
              openMenu(
                index,
                open?.returnFocusTo ?? (event.detail === 0 ? event.currentTarget : document.activeElement),
              );
            }
          }}
          onPointerEnter={() => {
            if (open && open.index !== index) {
              openMenu(index, open.returnFocusTo);
            }
          }}
          onKeyDown={(event) => handleButtonKeyDown(event, index)}
          className={`text-text-secondary hover:bg-surface hover:text-text rounded-sm px-2 py-0.5 outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] ${
            open?.index === index ? "bg-surface text-text" : ""
          }`}
        >
          {menu.label}
        </button>
      ))}
      {open && openEntry && (
        <Menu
          key={open.index}
          label={openEntry.label}
          items={commandMenuEntries(openEntry.items, commands)}
          x={open.x}
          y={open.y}
          returnFocusTo={open.returnFocusTo}
          ignorePointerDownIn={barRef.current}
          onNavigate={(direction) => moveTo(open.index + direction)}
          onClose={() => closeMenu(false)}
        />
      )}
    </div>
  );
}

/**
 * Lists commands as menu items, with their shortcuts, enabled states, and toggle states.
 *
 * @param ids - Command ids and `MENU_SEPARATOR`s, in menu order. An id with no command is left out.
 * @param commands - The commands to look the ids up in.
 */
export function commandMenuEntries(ids: readonly string[], commands: readonly Command[]): MenuEntry[] {
  return ids.flatMap((id): MenuEntry[] => {
    if (id === MENU_SEPARATOR) {
      return [MENU_SEPARATOR];
    }
    const command = commands.find((candidate) => candidate.id === id);
    if (!command) {
      return [];
    }
    return [
      {
        label: command.label,
        shortcut: command.shortcut ?? command.shortcutHint,
        disabled: command.isEnabled === false,
        checked: command.isChecked,
        onSelect: () => void runCommand(command),
      },
    ];
  });
}
