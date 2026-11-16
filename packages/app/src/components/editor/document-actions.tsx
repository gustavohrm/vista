import { motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";

import { getViewer } from "../../domain/viewers";
import type { ViewMode } from "../../ports";
import type { OpenDocument } from "../../state/documents";
import { Tooltip } from "../feedback/tooltip";

interface DocumentActionsProps {
  /** The active tab's document. */
  document: OpenDocument;
  onViewModeChange: (mode: ViewMode) => void;
  /** Whether the find bar is open, which presses the Find button. */
  isFindOpen: boolean;
  onFind: () => void;
}

/**
 * What acts on the active tab, at the right end of the tabs row: the view switch and Find.
 *
 * @param props - DocumentActions properties.
 * @returns The group of buttons.
 */
export function DocumentActions({ document: doc, onViewModeChange, isFindOpen, onFind }: DocumentActionsProps) {
  const viewer = getViewer(doc.extension);
  const canToggleView = !doc.isReadOnly && viewer.hasRaw && viewer.enriched !== undefined;

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a row of buttons; a native fieldset would bring browser styling to reset
    <div role="group" aria-label="Document actions" className="flex flex-none items-center gap-1">
      {canToggleView && viewer.enriched !== undefined && (
        <ViewModeToggle viewMode={doc.viewMode} enriched={viewer.enriched} onViewModeChange={onViewModeChange} />
      )}
      <Tooltip text="Find" shortcut="Mod+F" position="bottom" align="end">
        {(bubbleId) => (
          <button
            type="button"
            onClick={onFind}
            aria-label="Find"
            aria-describedby={bubbleId}
            className={`icon-button size-7 text-base ${isFindOpen ? "bg-selected text-text-strong" : ""}`}
          >
            <i className="ic-search" aria-hidden="true" />
          </button>
        )}
      </Tooltip>
    </div>
  );
}

/** The hairline box that holds the view switch's two labelled segments. */
const VIEW_GROUP_CLASS = "border-line mr-1 flex h-[30px] flex-none items-center gap-0.5 rounded-md border p-0.5";

/** One segment; its text sits above the sliding fill, so the fill never covers it. */
const VIEW_SEGMENT_CLASS =
  "relative flex h-full items-center gap-1.5 rounded-[5px] px-2 text-xs font-medium transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]";

const EASE_MOVE = [0.4, 0, 0.2, 1] as const;

interface ViewModeToggleProps {
  /** Currently selected presentation mode. */
  viewMode: ViewMode;
  /** Which enriched presentation the format has, which picks its icon and name. */
  enriched: "markdown" | "csv-table";
  /** Callback fired when the user selects a presentation mode. */
  onViewModeChange: (mode: ViewMode) => void;
}

/**
 * The view switch: two labelled segments for the enriched and raw presentations. The fill behind
 * the pressed one slides to the other when the view changes, so the switch shows which way it went;
 * with reduced motion it moves at once.
 *
 * @param props - ViewModeToggle properties.
 * @returns The switch.
 */
function ViewModeToggle({ viewMode, enriched, onViewModeChange }: ViewModeToggleProps) {
  const indicatorId = useId();
  const isReduced = useReducedMotion() ?? false;
  const segment = (mode: ViewMode, label: string, icon: ReactNode) => {
    const isPressed = viewMode === mode;
    return (
      <button
        type="button"
        onClick={() => onViewModeChange(mode)}
        aria-pressed={isPressed}
        className={`${VIEW_SEGMENT_CLASS} ${isPressed ? "text-text-strong" : "text-text-muted hover:text-text"}`}
      >
        {isPressed && (
          <motion.span
            layoutId={indicatorId}
            transition={{ duration: isReduced ? 0 : 0.2, ease: EASE_MOVE }}
            aria-hidden="true"
            className="bg-selected absolute inset-0 rounded-[5px]"
          />
        )}
        <span className="relative flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      </button>
    );
  };
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a plain row of two toggles; a native fieldset would bring browser styling to reset
    <div role="group" aria-label="Document view mode" className={VIEW_GROUP_CLASS}>
      {segment(
        "enriched",
        enriched === "markdown" ? "Rich text" : "Table",
        enriched === "markdown" ? (
          <i className="ic-eye text-sm" aria-hidden="true" />
        ) : (
          <i className="ic-table text-sm" aria-hidden="true" />
        ),
      )}
      {segment("raw", "Raw", <i className="ic-code text-sm" aria-hidden="true" />)}
    </div>
  );
}
