import type { ReactNode } from "react";

import { formatShortcut } from "../../commands";
import { Tooltip } from "../feedback/tooltip";

interface TitleBarProps {
  /** Whether the explorer panel is currently shown. */
  isSidebarOpen: boolean;
  /**
   * Whether a workspace is open. Without one there is no explorer, no file to go to, and no panel to
   * toggle, so the bar holds only the switcher and the notice.
   */
  hasWorkspace: boolean;
  /** Callback triggered to show or hide the explorer panel. */
  onToggleSidebar: () => void;
  /** Opens the picker on files. */
  onGoToFile: () => void;
  /** Shortcut that opens the picker on files, shown in the field. */
  goToFileShortcut: string;
  /** The workspace switcher. */
  switcher?: ReactNode;
  /** The panel toggles at the right end, from `md` up. */
  panels?: readonly PanelToggle[];
  /** A quiet notice at the right end, before the panel toggles, such as a newer version being out. */
  notice?: ReactNode;
}

/** One of the title bar's panel toggles, which shows or hides a bar around the frame. */
export interface PanelToggle {
  /** The toggle's name and tooltip. */
  label: string;
  /**
   * The panel's glyph, solid-edged while it shows and dashed while it is hidden, so the pair reads
   * as the layout without a pressed fill on every toggle.
   */
  icon: ReactNode;
  /** Whether the panel shows. */
  isShown: boolean;
  /** Whether the panel can show now; a disabled toggle stays focusable, so its tooltip can be read. */
  isEnabled: boolean;
  onToggle: () => void;
}

/** A panel toggle: an icon button whose state shows in its glyph rather than in a pressed fill. */
const PANEL_TOGGLE_CLASS =
  "text-text-muted inline-flex size-7 flex-none items-center justify-center rounded-md text-base transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]";

/**
 * The bar across the top of the application shell, shown with or without a workspace: the
 * workspace switcher on the left, while a workspace is open the go-to-file field in the middle, and
 * on the right any notice, then from `md` up the panel toggles, one for each bar
 * around the frame. Below `md`, where there is no rail, a button at the left opens the explorer
 * drawer instead; the bar stays above the drawer, so the button that opened it also closes it.
 *
 * @param props - TitleBar properties.
 * @returns Title bar element.
 */
export function TitleBar({
  isSidebarOpen,
  hasWorkspace,
  onToggleSidebar,
  onGoToFile,
  goToFileShortcut,
  switcher,
  panels = [],
  notice,
}: TitleBarProps) {
  const explorerLabel = isSidebarOpen ? "Close explorer" : "Open explorer";

  return (
    <header className="relative z-50 flex h-11 w-full flex-none items-center gap-1 px-2 select-none md:gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 md:gap-1">
        {hasWorkspace && (
          <Tooltip text={explorerLabel} position="bottom" className="flex flex-none md:hidden">
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

      {hasWorkspace && (
        <button
          type="button"
          onClick={onGoToFile}
          // A click does not take focus from the editor, so the picker returns focus there and an
          // Edit command chosen in it with `>` acts on the editor.
          onMouseDown={(event) => event.preventDefault()}
          aria-label="Go to file"
          className="text-text-muted hover:border-line-strong hover:text-text md:border-line md:bg-frame flex h-[30px] flex-none items-center justify-start gap-2 rounded-md px-2 text-[13px] transition-colors duration-100 md:w-80 md:border md:pr-1 lg:w-[460px]"
        >
          <i className="ic-file-search text-text-faint text-sm" aria-hidden="true" />
          <span className="hidden flex-1 text-left md:inline">Go to file</span>
          <kbd aria-hidden="true" className="shortcut-key hidden md:inline-flex">
            {formatShortcut(goToFileShortcut)}
          </kbd>
        </button>
      )}

      <div className="flex flex-none items-center justify-end gap-0.5 lg:flex-1">
        {notice && <div className="mr-1 flex flex-none">{notice}</div>}
        {hasWorkspace &&
          panels.map((panel) => (
            <Tooltip key={panel.label} text={panel.label} position="bottom" className="hidden flex-none md:flex">
              {(bubbleId) => (
                <button
                  type="button"
                  onClick={panel.isEnabled ? panel.onToggle : undefined}
                  aria-label={panel.label}
                  aria-describedby={bubbleId}
                  aria-pressed={panel.isShown}
                  aria-disabled={panel.isEnabled ? undefined : true}
                  className={`${PANEL_TOGGLE_CLASS} ${
                    panel.isEnabled ? "hover:bg-hover hover:text-text cursor-pointer" : "cursor-default opacity-40"
                  }`}
                >
                  {panel.icon}
                </button>
              )}
            </Tooltip>
          ))}
      </div>
    </header>
  );
}
