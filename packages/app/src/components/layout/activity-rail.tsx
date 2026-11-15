import type { ReactNode } from "react";

import { Tooltip } from "../feedback/tooltip";

interface ActivityRailProps {
  /** Whether the explorer is shown. */
  isExplorerOpen: boolean;
  onToggleExplorer: () => void;
  onOpenSettings: () => void;
}

/**
 * The narrow column at the left edge, from `md` up: Explorer, the Search and Graph places that are
 * still to come, and the Settings gear at its foot. Below `md` the explorer drawer carries the same
 * actions through `DrawerActivities`.
 *
 * @param props - ActivityRail properties.
 * @returns Rail element.
 */
export function ActivityRail({ isExplorerOpen, onToggleExplorer, onOpenSettings }: ActivityRailProps) {
  return (
    <nav aria-label="Activity bar" className="hidden w-12 flex-none flex-col items-center gap-1 pt-1 pb-2 md:flex">
      <RailButton
        label="Explorer"
        tooltip="Explorer"
        position="right"
        onClick={onToggleExplorer}
        isPressed={isExplorerOpen}
      >
        <i className="ic-files" aria-hidden="true" />
      </RailButton>
      <ComingSoonButtons position="right" />
      <div className="flex-1" />
      <RailButton label="Settings" tooltip="Settings" position="right" onClick={onOpenSettings}>
        <i className="ic-settings" aria-hidden="true" />
      </RailButton>
    </nav>
  );
}

/**
 * The rail's actions at the top of the explorer drawer, below `md`, where the rail is not shown. The
 * drawer is the explorer itself, so its toggle stays in the title bar.
 *
 * @param props - The action that opens Settings.
 * @returns Row of buttons, hidden from `md` up.
 */
export function DrawerActivities({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex flex-none items-center gap-0.5 px-1.5 pt-1 md:hidden">
      <ComingSoonButtons position="bottom" />
      <div className="flex-1" />
      <RailButton label="Settings" tooltip="Settings" position="bottom" onClick={onOpenSettings}>
        <i className="ic-settings" aria-hidden="true" />
      </RailButton>
    </div>
  );
}

/** Search and Graph, shown where they will be but not working yet. */
function ComingSoonButtons({ position }: { position: "right" | "bottom" }) {
  return (
    <>
      <RailButton label="Search" tooltip="Coming soon" position={position}>
        <i className="ic-search" aria-hidden="true" />
      </RailButton>
      <RailButton label="Graph" tooltip="Coming soon" position={position}>
        <i className="ic-waypoints" aria-hidden="true" />
      </RailButton>
    </>
  );
}

interface RailButtonProps {
  label: string;
  tooltip: string;
  position: "right" | "bottom";
  /** What the button does. Without it the button is disabled but stays focusable, so its tooltip can be read. */
  onClick?: () => void;
  /** Whether the toggle is on. Omitted for a button that is not a toggle. */
  isPressed?: boolean;
  children: ReactNode;
}

function RailButton({ label, tooltip, position, onClick, isPressed, children }: RailButtonProps) {
  return (
    <Tooltip
      text={tooltip}
      position={position}
      align={position === "bottom" ? "start" : "center"}
      className="flex flex-none"
    >
      {(bubbleId) => (
        <button
          type="button"
          aria-label={label}
          aria-describedby={bubbleId}
          aria-pressed={isPressed}
          aria-disabled={onClick ? undefined : true}
          onClick={onClick}
          className={`flex size-[34px] items-center justify-center rounded-lg text-lg transition-colors duration-100 focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none ${
            isPressed ? "bg-selected text-text-strong" : "text-text-faint"
          } ${onClick ? "hover:bg-hover hover:text-text" : "opacity-50"}`}
        >
          {children}
        </button>
      )}
    </Tooltip>
  );
}
