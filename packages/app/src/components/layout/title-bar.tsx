import { formatShortcut, type Command } from "../../commands";
import type { ThemeCapability } from "../../ports";
import { Tooltip } from "../feedback/tooltip";
import { MenuBar, type MenuBarMenu } from "../menu/menu-bar";

interface TitleBarProps {
  /** The application menus, by command id. */
  menus: readonly MenuBarMenu[];
  /** Commands the menus name by id. */
  commands: readonly Command[];
  /** Theme capability for toggling light/dark mode. */
  theme: ThemeCapability;
  /** Whether the explorer panel is currently shown. */
  isSidebarOpen: boolean;
  /** Callback triggered to show or hide the explorer panel. */
  onToggleSidebar: () => void;
  /** Opens the picker that finds files and commands. */
  onSearch: () => void;
  /** Shortcut that opens the picker, shown in the search field. */
  searchShortcut: string;
}

/**
 * The bar across the top of the application shell: the explorer toggle and the menus on the left,
 * the search field that opens the picker in the middle, and the theme toggle on the right. It
 * stays above the explorer drawer on narrow screens, so the toggle that opened the drawer also
 * closes it.
 *
 * @param props - TitleBar properties.
 * @returns Title bar element.
 */
export function TitleBar({
  menus,
  commands,
  theme,
  isSidebarOpen,
  onToggleSidebar,
  onSearch,
  searchShortcut,
}: TitleBarProps) {
  const explorerLabel = isSidebarOpen ? "Close explorer" : "Open explorer";
  const themeLabel = `Switch to ${theme.theme === "dark" ? "light" : "dark"} theme`;

  return (
    <header className="bg-foreground relative z-50 flex h-10 flex-none items-center gap-1 px-1 select-none md:gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 md:gap-1">
        <Tooltip text={explorerLabel} position="bottom" align="start" className="flex flex-none">
          {(bubbleId) => (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label={explorerLabel}
              aria-describedby={bubbleId}
              aria-pressed={isSidebarOpen}
              className={isSidebarOpen ? "btn soft icon sm" : "btn ghost icon sm"}
            >
              <i className="ic-panel-left" aria-hidden="true" />
            </button>
          )}
        </Tooltip>
        <MenuBar menus={menus} commands={commands} />
      </div>

      <button
        type="button"
        onClick={onSearch}
        // A click does not take focus from the editor, so the picker returns focus there and an
        // Edit command chosen in it acts on the editor, as with the menu bar.
        onMouseDown={(event) => event.preventDefault()}
        aria-label="Search files and commands"
        className="btn soft sm text-text-secondary flex-none justify-start gap-2 font-normal md:w-72 lg:w-96"
      >
        <i className="ic-search" aria-hidden="true" />
        <span className="hidden flex-1 text-left md:inline">Search files and commands</span>
        <kbd aria-hidden="true" className="kbd hidden text-[11px] md:inline-flex">
          {formatShortcut(searchShortcut)}
        </kbd>
      </button>

      <div className="flex flex-none items-center justify-end lg:flex-1">
        <Tooltip text={themeLabel} position="bottom" align="end" className="flex flex-none">
          {(bubbleId) => (
            <button
              type="button"
              onClick={theme.toggleTheme}
              aria-label={themeLabel}
              aria-describedby={bubbleId}
              className="btn ghost icon sm"
            >
              {theme.theme === "dark" ? (
                <i className="ic-sun" aria-hidden="true" />
              ) : (
                <i className="ic-moon" aria-hidden="true" />
              )}
            </button>
          )}
        </Tooltip>
      </div>
    </header>
  );
}
