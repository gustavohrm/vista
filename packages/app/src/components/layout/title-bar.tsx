import type { ReactNode } from "react";

import { formatShortcut } from "../../commands";
import { Tooltip } from "../feedback/tooltip";

interface TitleBarProps {
  /** Whether the explorer panel is currently shown. */
  isSidebarOpen: boolean;
  /** Whether there is an explorer to show, which there is only while a workspace is open. */
  hasExplorer: boolean;
  /** Callback triggered to show or hide the explorer panel. */
  onToggleSidebar: () => void;
  /** Opens the picker on files. */
  onGoToFile: () => void;
  /** Shortcut that opens the picker on files, shown in the field. */
  goToFileShortcut: string;
  /** The workspace switcher, shown while a workspace is open. */
  switcher?: ReactNode;
}

/**
 * The bar across the top of the application shell: the workspace switcher on the left and the
 * go-to-file field in the middle. Below `md`, where there is no rail, a button at the left opens the
 * explorer drawer; the bar stays above the drawer, so the button that opened it also closes it.
 *
 * @param props - TitleBar properties.
 * @returns Title bar element.
 */
export function TitleBar({
  isSidebarOpen,
  hasExplorer,
  onToggleSidebar,
  onGoToFile,
  goToFileShortcut,
  switcher,
}: TitleBarProps) {
  const explorerLabel = isSidebarOpen ? "Close explorer" : "Open explorer";

  return (
    <header className="relative z-50 flex h-11 w-full flex-none items-center gap-1 px-2 select-none md:gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 md:gap-1">
        {hasExplorer && (
          <Tooltip text={explorerLabel} position="bottom" align="start" className="flex flex-none md:hidden">
            {(bubbleId) => (
              <button
                type="button"
                onClick={onToggleSidebar}
                aria-label={explorerLabel}
                aria-describedby={bubbleId}
                aria-pressed={isSidebarOpen}
                className="icon-button size-7 text-base"
              >
                <i className="ic-menu" aria-hidden="true" />
              </button>
            )}
          </Tooltip>
        )}
        {switcher}
      </div>

      <button
        type="button"
        onClick={onGoToFile}
        // A click does not take focus from the editor, so the picker returns focus there and an
        // Edit command chosen in it with `>` acts on the editor.
        onMouseDown={(event) => event.preventDefault()}
        aria-label="Go to file"
        className="text-text-muted hover:border-line-strong hover:text-text md:border-line md:bg-frame flex h-[30px] flex-none items-center justify-start gap-2 rounded-md px-2 text-[13px] transition-colors duration-100 md:w-80 md:border lg:w-[460px]"
      >
        <i className="ic-search text-text-faint text-sm" aria-hidden="true" />
        <span className="hidden flex-1 text-left md:inline">Go to file</span>
        <kbd aria-hidden="true" className="shortcut-key hidden md:inline-flex">
          {formatShortcut(goToFileShortcut)}
        </kbd>
      </button>

      <div className="flex-none lg:flex-1" />
    </header>
  );
}
