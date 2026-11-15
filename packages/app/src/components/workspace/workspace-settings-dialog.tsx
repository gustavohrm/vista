import { useId, useState } from "react";

import {
  validateWorkspaceName,
  WORKSPACE_COLORS,
  WORKSPACE_ICONS,
  type WorkspaceColor,
  type WorkspaceIcon,
} from "../../domain/workspaces";
import type { WorkspaceDetails } from "../../state/workspaces";
import { HelpDialog } from "../help/help-dialog";
import { WorkspaceGlyph } from "./workspace-glyph";
import type { RecentWorkspace } from "./workspace-switcher";

const ICON_LABELS: Record<WorkspaceIcon, string> = {
  folder: "Folder",
  "book-open": "Book",
  "notebook-pen": "Notebook",
  briefcase: "Briefcase",
  code: "Code",
  house: "House",
  star: "Star",
  heart: "Heart",
  "flask-conical": "Flask",
  "graduation-cap": "Graduation cap",
  "pen-line": "Pen",
  globe: "Globe",
};

const COLOR_LABELS: Record<WorkspaceColor, string> = {
  neutral: "Neutral",
  indigo: "Indigo",
  emerald: "Emerald",
  amber: "Amber",
  rose: "Rose",
};

const FOLDER_STATUS_TEXT = {
  ready: undefined,
  "needs-permission": "Needs access",
  unavailable: "Not found",
} as const;

const CHOICE_CLASS =
  "flex size-8 cursor-pointer items-center justify-center rounded-md border border-transparent hover:bg-surface has-checked:border-border has-checked:bg-surface has-focus-visible:ring-1 has-focus-visible:ring-[var(--focus-ring)]";

interface WorkspaceSettingsDialogProps {
  workspace: RecentWorkspace;
  onChange: (changes: WorkspaceDetails) => void;
  onAddFolder: () => void;
  onRemoveFolder: (folderId: string) => void;
  onClose: () => void;
}

/** The current workspace's name, icon, colour, and folders. Each change applies as soon as it is made and valid. */
export function WorkspaceSettingsDialog({
  workspace,
  onChange,
  onAddFolder,
  onRemoveFolder,
  onClose,
}: WorkspaceSettingsDialogProps) {
  const nameId = useId();
  const nameHintId = useId();
  const [nameDraft, setNameDraft] = useState(workspace.name);
  const nameCheck = validateWorkspaceName(nameDraft);
  const folders = workspace.folders ?? [];

  return (
    <HelpDialog title="Workspace Settings" onClose={onClose}>
      <div className="pt-3">
        <label htmlFor={nameId} className="text-text-secondary block pb-1 text-xs font-medium">
          Name
        </label>
        <input
          id={nameId}
          type="text"
          value={nameDraft}
          aria-invalid={!nameCheck.ok || undefined}
          aria-describedby={nameCheck.ok ? undefined : nameHintId}
          onChange={(event) => {
            setNameDraft(event.target.value);
            const check = validateWorkspaceName(event.target.value);
            if (check.ok) {
              onChange({ name: check.name });
            }
          }}
          className="ipt w-full text-[13px]"
        />
        {!nameCheck.ok && (
          <p id={nameHintId} role="alert" className="hint destructive pt-1 text-xs">
            {nameCheck.message} The name stays &ldquo;{workspace.name}&rdquo;.
          </p>
        )}
      </div>
      <fieldset className="pt-4">
        <legend className="text-text-secondary pb-1 text-xs font-medium">Icon</legend>
        <div className="flex flex-wrap gap-1">
          {WORKSPACE_ICONS.map((icon) => (
            <label key={icon} title={ICON_LABELS[icon]} className={CHOICE_CLASS}>
              <input
                type="radio"
                name="workspace-icon"
                aria-label={ICON_LABELS[icon]}
                checked={workspace.icon === icon}
                onChange={() => onChange({ icon })}
                className="sr-only"
              />
              <WorkspaceGlyph icon={icon} color={workspace.color} className="text-base" />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="pt-4">
        <legend className="text-text-secondary pb-1 text-xs font-medium">Colour</legend>
        <div className="flex flex-wrap gap-1">
          {WORKSPACE_COLORS.map((color) => (
            <label key={color} title={COLOR_LABELS[color]} className={CHOICE_CLASS}>
              <input
                type="radio"
                name="workspace-color"
                aria-label={COLOR_LABELS[color]}
                checked={workspace.color === color}
                onChange={() => onChange({ color })}
                className="sr-only"
              />
              <WorkspaceGlyph icon={workspace.icon} color={color} className="text-base" />
            </label>
          ))}
        </div>
      </fieldset>
      <section className="pt-4" aria-labelledby={`${nameId}-folders`}>
        <h3 id={`${nameId}-folders`} className="text-text-secondary pb-1 text-xs font-medium">
          Folders
        </h3>
        <ul className="flex flex-col">
          {folders.map((folder) => (
            <li key={folder.id} className="text-body text-text flex items-center gap-2 py-1">
              <i className="ic-folder text-text-secondary flex-none" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              {FOLDER_STATUS_TEXT[folder.status] && (
                <span className="text-text-secondary flex-none text-xs">{FOLDER_STATUS_TEXT[folder.status]}</span>
              )}
              {folders.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove "${folder.name}" from the workspace`}
                  title="Remove from the workspace"
                  onClick={() => onRemoveFolder(folder.id)}
                  className="btn ghost icon sm flex-none"
                >
                  <i className="ic-x" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={onAddFolder} className="btn sm mt-2">
          <i className="ic-folder-input" aria-hidden="true" />
          Add Folder…
        </button>
      </section>
    </HelpDialog>
  );
}
