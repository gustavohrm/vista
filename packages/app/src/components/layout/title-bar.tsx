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
    <header className="bg-foreground relative z-50 flex h-10 flex-none items-center gap-1 px-1 select-none md:gap-2">
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
                className={isSidebarOpen ? "btn soft icon sm" : "btn ghost icon sm"}
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
        className="btn soft sm text-text-secondary flex-none justify-start gap-2 font-normal md:w-72 lg:w-96"
      >
        <i className="ic-search" aria-hidden="true" />
        <span className="hidden flex-1 text-left md:inline">Go to file</span>
        <kbd aria-hidden="true" className="kbd hidden text-[11px] md:inline-flex">
          {formatShortcut(goToFileShortcut)}
        </kbd>
      </button>

      <div className="flex-none lg:flex-1" />
    </header>
  );
}
