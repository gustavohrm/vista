import { AnimatePresence, motion } from "motion/react";
import { useId, useMemo, type ReactNode } from "react";

import type { EditorSettings } from "../../domain/settings";
import { canShowEnriched, getViewer } from "../../domain/viewers";
import { t } from "../../i18n";
import type { ViewMode } from "../../ports";
import type { OpenDocument } from "../../state/documents";
import { useReducedMotion } from "../../theme/appearance";
import { Tooltip } from "../feedback/tooltip";
import { EditorSettingsMenu } from "./editor-settings-menu";

interface DocumentActionsProps {
  /** The active tab's document. */
  document: OpenDocument;
  onViewModeChange: (mode: ViewMode) => void;
  /** Whether the find bar is open, which presses the Find button. */
  isFindOpen: boolean;
  onFind: () => void;
  /** Find's first key, shown in its tooltip; none when the user removed it. */
  findShortcut?: string;
  editorSettings: EditorSettings;
  onEditorSettingsChange: (changes: Partial<EditorSettings>) => void;
  /** Opens the Editor section of Settings, from the editor settings menu. */
  onOpenEditorSettings: () => void;
}

/** The gear's box and the group's gap, which open together as it comes in, in pixels. */
const GEAR_WIDTH_PX = 28;
const GROUP_GAP_PX = 4;

/**
 * What acts on the active tab, at the right end of the tabs row: the view switch, Find, and, while
 * the raw editor shows, the editor settings gear. The gear's settings apply to the raw editor only,
 * so it comes and goes with it: the buttons before it slide left to make room, then it grows in;
 * leaving, it shrinks away before they slide back. With reduced motion it appears at once.
 *
 * @param props - DocumentActions properties.
 * @returns The group of buttons.
 */
export function DocumentActions({
  document: doc,
  onViewModeChange,
  isFindOpen,
  onFind,
  findShortcut,
  editorSettings,
  onEditorSettingsChange,
  onOpenEditorSettings,
}: DocumentActionsProps) {
  const isReduced = useReducedMotion();
  const viewer = getViewer(doc.extension);
  const isRawShown = doc.viewMode !== "enriched" || viewer.enriched === undefined;
  // A CSV with too many cells for the table shows only raw, as the status bar notes.
  const fitsEnriched = useMemo(() => canShowEnriched(doc.extension, doc.content), [doc.content, doc.extension]);
  const canToggleView = !doc.isReadOnly && viewer.hasRaw && viewer.enriched !== undefined && fitsEnriched;

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a row of buttons; a native fieldset would bring browser styling to reset
    <div role="group" aria-label={t("editor.documentActions")} className="flex flex-none items-center gap-1">
      {canToggleView && viewer.enriched !== undefined && (
        <ViewModeToggle viewMode={doc.viewMode} enriched={viewer.enriched} onViewModeChange={onViewModeChange} />
      )}
      <Tooltip text={t("editor.find")} shortcut={findShortcut} position="bottom">
        {(bubbleId) => (
          <button
            type="button"
            onClick={onFind}
            aria-label={t("editor.find")}
            aria-describedby={bubbleId}
            className={`icon-button size-7 text-base ${isFindOpen ? "bg-selected text-text-strong" : ""}`}
          >
            <i className="ic-text-search" aria-hidden="true" />
          </button>
        )}
      </Tooltip>
      <AnimatePresence initial={false}>
        {isRawShown && (
          <motion.div
            key="editor-settings"
            // The negative margin takes back the group's gap, so the row moves by the gear's width and
            // the gap together, smoothly, instead of jumping by the gap first.
            initial={{ width: 0, marginLeft: -GROUP_GAP_PX }}
            animate={{ width: GEAR_WIDTH_PX, marginLeft: 0 }}
            exit={{
              width: 0,
              marginLeft: -GROUP_GAP_PX,
              transition: { duration: isReduced ? 0 : 0.16, ease: EASE_MOVE, delay: isReduced ? 0 : 0.08 },
            }}
            transition={{ duration: isReduced ? 0 : 0.18, ease: EASE_MOVE }}
            className="flex flex-none justify-end"
          >
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                transition: { duration: isReduced ? 0 : 0.16, ease: EASE_ENTER, delay: isReduced ? 0 : 0.14 },
              }}
              exit={{ scale: 0.4, opacity: 0, transition: { duration: isReduced ? 0 : 0.1, ease: EASE_EXIT } }}
              className="flex flex-none"
            >
              <EditorSettingsMenu
                settings={editorSettings}
                onChange={onEditorSettingsChange}
                onOpenSettings={onOpenEditorSettings}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The hairline box that holds the view switch's two labelled segments. */
const VIEW_GROUP_CLASS = "border-line mr-1 flex h-[30px] flex-none items-center gap-0.5 rounded-md border p-0.5";

/** One segment; its text sits above the sliding fill, so the fill never covers it. */
const VIEW_SEGMENT_CLASS =
  "relative flex h-full items-center gap-1.5 rounded-[5px] px-2 text-xs font-medium transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]";

const EASE_MOVE = [0.4, 0, 0.2, 1] as const;
const EASE_ENTER = [0.2, 0, 0, 1] as const;
const EASE_EXIT = [0.3, 0, 1, 1] as const;

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
  const isReduced = useReducedMotion();
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
    <div role="group" aria-label={t("editor.viewMode")} className={VIEW_GROUP_CLASS}>
      {segment(
        "enriched",
        enriched === "markdown" ? t("editor.richText") : t("editor.table"),
        enriched === "markdown" ? (
          <i className="ic-eye text-sm" aria-hidden="true" />
        ) : (
          <i className="ic-table text-sm" aria-hidden="true" />
        ),
      )}
      {segment("raw", t("editor.raw"), <i className="ic-code text-sm" aria-hidden="true" />)}
    </div>
  );
}
