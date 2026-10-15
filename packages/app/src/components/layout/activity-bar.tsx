import type { ReactNode } from "react";

import type { ThemeCapability } from "../../ports";
import { Tooltip } from "../feedback/tooltip";

interface ActivityBarProps {
  /** Theme capability for toggling light/dark mode. */
  theme: ThemeCapability;
  /** Whether the explorer panel is currently shown. */
  isSidebarOpen: boolean;
  /** Callback triggered to show or hide the explorer panel. */
  onToggleSidebar: () => void;
}

/**
 * Renders the vertical activity bar on the left edge of the application shell.
 *
 * @param props - ActivityBar properties.
 * @returns Activity bar component.
 */
export function ActivityBar({ theme, isSidebarOpen, onToggleSidebar }: ActivityBarProps) {
  const themeLabel = `Switch to ${theme.theme === "dark" ? "light" : "dark"} theme`;

  return (
    <aside
      aria-label="Activity Bar"
      className="border-border bg-foreground text-text-secondary relative z-50 flex w-12 flex-none flex-col items-center justify-between border-r py-3 select-none"
    >
      <div className="flex flex-col items-center gap-3">
        <ActivityBarButton
          label={isSidebarOpen ? "Close explorer" : "Open explorer"}
          onClick={onToggleSidebar}
          isPressed={isSidebarOpen}
        >
          {isSidebarOpen ? (
            <i className="ic-folder-open text-xl" aria-hidden="true" />
          ) : (
            <i className="ic-folder text-xl" aria-hidden="true" />
          )}
        </ActivityBarButton>
      </div>

      <div className="flex flex-col items-center gap-3">
        <ActivityBarButton label={themeLabel} onClick={theme.toggleTheme}>
          {theme.theme === "dark" ? (
            <i className="ic-sun text-xl" aria-hidden="true" />
          ) : (
            <i className="ic-moon text-xl" aria-hidden="true" />
          )}
        </ActivityBarButton>
      </div>
    </aside>
  );
}

interface ActivityBarButtonProps {
  /** Accessible name of the icon-only button, also the text of its tooltip. */
  label: string;
  /** Callback triggered when the button is activated. */
  onClick: () => void;
  /** Toggle state of the button; omit for a button that is not a toggle. */
  isPressed?: boolean;
  /** Icon element displayed inside the button. */
  children: ReactNode;
}

/**
 * Icon-only activity bar button with a tooltip placed to its right, so the bubble stays inside
 * the viewport at the left edge. A pressed toggle swaps `ghost` for `soft` to show its active
 * state, because the package styles no `aria-pressed` look of its own.
 *
 * @param props - ActivityBarButton properties.
 * @returns Icon button with its tooltip.
 */
function ActivityBarButton({ label, onClick, isPressed, children }: ActivityBarButtonProps) {
  return (
    <Tooltip text={label} position="right" className="flex">
      {(bubbleId) => (
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-describedby={bubbleId}
          aria-pressed={isPressed}
          className={isPressed ? "btn soft icon" : "btn ghost icon"}
        >
          {children}
        </button>
      )}
    </Tooltip>
  );
}
