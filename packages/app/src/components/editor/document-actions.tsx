import { formatShortcut } from "../../commands/shortcuts";
import type { EditorSettings } from "../../domain/settings";
import { getViewer } from "../../domain/viewers";
import type { ViewMode } from "../../ports";
import type { OpenDocument } from "../../state/documents";
import { Tooltip } from "../feedback/tooltip";
import { EditorSettingsMenu } from "./editor-settings-menu";

interface DocumentActionsProps {
  /** The active tab's document. */
  document: OpenDocument;
  onViewModeChange: (mode: ViewMode) => void;
  /** Whether the find bar is open, which presses the Find button. */
  isFindOpen: boolean;
  onFind: () => void;
  editorSettings: EditorSettings;
  onEditorSettingsChange: (changes: Partial<EditorSettings>) => void;
  /** Opens the Editor section of Settings, from the editor settings menu. */
  onOpenSettings: () => void;
}

/**
 * What acts on the active tab, at the right end of the tabs row: the view switch, Find, and the
 * editor settings gear.
 *
 * @param props - DocumentActions properties.
 * @returns The group of buttons.
 */
export function DocumentActions({
  document: doc,
  onViewModeChange,
  isFindOpen,
  onFind,
  editorSettings,
  onEditorSettingsChange,
  onOpenSettings,
}: DocumentActionsProps) {
  const viewer = getViewer(doc.extension);
  const canToggleView = !doc.isReadOnly && viewer.hasRaw && viewer.enriched !== undefined;

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a row of buttons; a native fieldset would bring browser styling to reset
    <div role="group" aria-label="Document actions" className="flex flex-none items-center gap-1">
      {canToggleView && viewer.enriched !== undefined && (
        <ViewModeToggle viewMode={doc.viewMode} enriched={viewer.enriched} onViewModeChange={onViewModeChange} />
      )}
      <Tooltip text={`Find (${formatShortcut("Mod+F")})`} position="bottom" align="end">
        {(bubbleId) => (
          <button
            type="button"
            onClick={onFind}
            aria-label="Find"
            aria-describedby={bubbleId}
            className={isFindOpen ? "btn soft icon sm" : "btn ghost icon sm"}
          >
            <i className="ic-search" aria-hidden="true" />
          </button>
        )}
      </Tooltip>
      <EditorSettingsMenu settings={editorSettings} onChange={onEditorSettingsChange} onOpenSettings={onOpenSettings} />
    </div>
  );
}

/** Buttons of the view switch: smaller than a row button, so the group around them is as tall as one. */
const VIEW_BUTTON_CLASS = "size-7! min-h-0! min-w-0! p-0! [--ui-radius:4px]";

/** The tinted box that makes the two view buttons read as one control. */
const VIEW_GROUP_CLASS = "bg-surface/60 mr-1 flex flex-none items-center gap-0.5 rounded-md p-0.5";

interface ViewModeToggleProps {
  /** Currently selected presentation mode. */
  viewMode: ViewMode;
  /** Which enriched presentation the format has, which picks its icon and name. */
  enriched: "markdown" | "csv-table";
  /** Callback fired when the user selects a presentation mode. */
  onViewModeChange: (mode: ViewMode) => void;
}

/**
 * Two icon buttons for switching between the enriched and raw presentations, named in tooltips.
 *
 * @param props - ViewModeToggle properties.
 * @returns The pair of toggle buttons.
 */
function ViewModeToggle({ viewMode, enriched, onViewModeChange }: ViewModeToggleProps) {
  const enrichedLabel = enriched === "markdown" ? "Rich text" : "Table";
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a plain row of two toggles; a native fieldset would bring browser styling to reset
    <div role="group" aria-label="Document view mode" className={VIEW_GROUP_CLASS}>
      <Tooltip text={enrichedLabel} position="bottom" align="end">
        {(bubbleId) => (
          <button
            type="button"
            onClick={() => onViewModeChange("enriched")}
            aria-label={enrichedLabel}
            aria-describedby={bubbleId}
            aria-pressed={viewMode === "enriched"}
            className={`btn icon sm ${VIEW_BUTTON_CLASS} ${viewMode === "enriched" ? "soft" : "ghost"}`}
          >
            {enriched === "markdown" ? (
              <i className="ic-eye" aria-hidden="true" />
            ) : (
              <i className="ic-table" aria-hidden="true" />
            )}
          </button>
        )}
      </Tooltip>
      <Tooltip text="Raw" position="bottom" align="end">
        {(bubbleId) => (
          <button
            type="button"
            onClick={() => onViewModeChange("raw")}
            aria-label="Raw"
            aria-describedby={bubbleId}
            aria-pressed={viewMode === "raw"}
            className={`btn icon sm ${VIEW_BUTTON_CLASS} ${viewMode === "raw" ? "soft" : "ghost"}`}
          >
            <i className="ic-code" aria-hidden="true" />
          </button>
        )}
      </Tooltip>
    </div>
  );
}
