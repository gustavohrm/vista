import { motion, useAnimate } from "motion/react";
import { useId, type ReactNode } from "react";

import type { DesktopDownload } from "../../domain/desktop-download";
import { useReducedMotion } from "../../theme/appearance";
import { Tooltip } from "../feedback/tooltip";

interface ActivityRailProps {
  /** Whether the frame shows the workspace's files rather than Settings, which marks Explorer as the current place, whether or not its panel is collapsed. */
  isExplorerCurrent: boolean;
  /** Shows the explorer, closing Settings if it is open. */
  onShowExplorer: () => void;
  /** Whether Settings is shown, which presses the gear. */
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  /** The desktop installer to offer in the browser, above the gear, or null where there is none to offer. */
  desktopDownload?: DesktopDownload | null;
}

/**
 * The narrow column at the left edge, from `md` up: Explorer, the Search and Graph places that are
 * still to come, and at its foot the desktop download in the browser, then the Settings gear. One background marks the place the frame shows,
 * so one button is always marked, and slides from one button to the other as it changes. Explorer only goes
 * to the explorer, never hides it; the title bar's panel toggle does that. Below `md` the explorer
 * drawer carries the same actions through `DrawerActivities`.
 *
 * @param props - ActivityRail properties.
 * @returns Rail element.
 */
export function ActivityRail({
  isExplorerCurrent,
  onShowExplorer,
  isSettingsOpen,
  onToggleSettings,
  desktopDownload = null,
}: ActivityRailProps) {
  const indicatorId = useId();
  return (
    <nav aria-label="Activity bar" className="hidden w-11 flex-none flex-col items-center gap-1 pt-1 pb-2 md:flex">
      <RailButton
        label="Explorer"
        tooltip="Explorer"
        position="right"
        onClick={onShowExplorer}
        isCurrent={isExplorerCurrent}
        indicatorId={indicatorId}
      >
        <i className="ic-files" aria-hidden="true" />
      </RailButton>
      <ComingSoonButtons position="right" />
      <div className="flex-1" />
      {desktopDownload && <DownloadLink download={desktopDownload} position="right" />}
      <RailButton
        label="Settings"
        tooltip="Settings"
        position="right"
        onClick={onToggleSettings}
        isPressed={isSettingsOpen}
        indicatorId={indicatorId}
      >
        <i className="ic-settings" aria-hidden="true" />
      </RailButton>
    </nav>
  );
}

/**
 * The rail's actions at the top of the explorer drawer, below `md`, where the rail is not shown. The
 * drawer is the explorer itself, so its toggle stays in the title bar.
 *
 * @param props - Whether Settings is shown, the action that opens or closes it, and the desktop
 *   download to offer in the browser, if any.
 * @returns Row of buttons, hidden from `md` up.
 */
export function DrawerActivities({
  isSettingsOpen,
  onToggleSettings,
  desktopDownload = null,
}: {
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  desktopDownload?: DesktopDownload | null;
}) {
  return (
    <div className="flex flex-none items-center gap-0.5 px-1.5 pt-1 md:hidden">
      <ComingSoonButtons position="bottom" />
      <div className="flex-1" />
      {desktopDownload && <DownloadLink download={desktopDownload} position="bottom" />}
      <RailButton
        label="Settings"
        tooltip="Settings"
        position="bottom"
        onClick={onToggleSettings}
        isPressed={isSettingsOpen}
      >
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

/**
 * The desktop download: a link, since it leaves for the installer rather than acting in the app. `download`
 * keeps the click from navigating away from the app when the host answers with a page instead of the installer.
 */
function DownloadLink({ download, position }: { download: DesktopDownload; position: "right" | "bottom" }) {
  const label = download.label.replace("Download", "Download Vista");
  return (
    <Tooltip text={label} position={position} className="flex flex-none">
      {(bubbleId) => (
        <a
          href={download.href}
          download
          aria-label={label}
          aria-describedby={bubbleId}
          className={`${RAIL_BUTTON_CLASS} text-text-faint hover:text-text hover:bg-hover`}
        >
          <i className="ic-monitor-down" aria-hidden="true" />
        </a>
      )}
    </Tooltip>
  );
}

const RAIL_BUTTON_CLASS =
  "relative flex size-[34px] items-center justify-center rounded-lg text-lg transition-colors duration-100 focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none";

interface RailButtonProps {
  label: string;
  tooltip: string;
  position: "right" | "bottom";
  /** What the button does. Without it the button is disabled but stays focusable, so its tooltip can be read. */
  onClick?: () => void;
  /** Whether the toggle is on. Omitted for a button that is not a toggle. */
  isPressed?: boolean;
  /** Whether the button's place is shown, for a button that goes to a place rather than toggling it. */
  isCurrent?: boolean;
  /** Shared by the buttons whose one background slides between them; without it the background just shows. */
  indicatorId?: string;
  children: ReactNode;
}

function RailButton({
  label,
  tooltip,
  position,
  onClick,
  isPressed,
  isCurrent,
  indicatorId,
  children,
}: RailButtonProps) {
  const isReduced = useReducedMotion();
  const isActive = isPressed === true || isCurrent === true;
  return (
    <Tooltip text={tooltip} position={position} className="flex flex-none">
      {(bubbleId) => (
        <button
          type="button"
          aria-label={label}
          aria-describedby={bubbleId}
          aria-pressed={isPressed}
          aria-current={isCurrent ? "true" : undefined}
          aria-disabled={onClick ? undefined : true}
          onClick={onClick}
          className={`${RAIL_BUTTON_CLASS} ${
            isActive ? "text-text-strong" : "text-text-faint"
          } ${onClick ? `hover:text-text ${isActive ? "" : "hover:bg-hover"}` : "opacity-50"}`}
        >
          {isActive && <RailIndicator layoutId={indicatorId} isReduced={isReduced} />}
          <span className="relative flex">{children}</span>
        </button>
      )}
    </Tooltip>
  );
}

/**
 * How the marked button's background travels, which a spring carries. On the way it draws in to a
 * small round drop and stretches a little along its path, then swells just past its size as it
 * lands and settles, so it reads as one fluid thing moving rather than a box sliding.
 */
const INDICATOR_TRAVEL = { type: "spring", visualDuration: 0.5, bounce: 0.18 } as const;
const INDICATOR_DROP = {
  scaleX: [1, 0.42, 0.42, 1.08, 1],
  scaleY: [1, 0.5, 0.62, 1.04, 1],
  borderRadius: ["8px", "17px", "17px", "10px", "8px"],
};
const INDICATOR_DROP_TIMING = { duration: 0.6, times: [0, 0.22, 0.6, 0.82, 1], ease: "easeInOut" as const };

/**
 * The background behind the marked rail button. The outer element moves between buttons; the inner
 * one, which is the fill, changes shape only while that move runs, so a background that simply
 * appears, such as on first showing, doesn't wobble.
 */
function RailIndicator({ layoutId, isReduced }: { layoutId?: string; isReduced: boolean }) {
  const [fill, animate] = useAnimate<HTMLSpanElement>();
  return (
    <motion.span
      layoutId={layoutId}
      transition={isReduced ? { duration: 0 } : INDICATOR_TRAVEL}
      onLayoutAnimationStart={() => {
        if (!isReduced && fill.current) {
          void animate(fill.current, INDICATOR_DROP, INDICATOR_DROP_TIMING);
        }
      }}
      aria-hidden="true"
      className="absolute inset-0"
    >
      <span ref={fill} className="bg-selected absolute inset-0 rounded-lg" />
    </motion.span>
  );
}
