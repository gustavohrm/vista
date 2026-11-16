import { useId, useState } from "react";

import {
  validateWorkspaceName,
  WORKSPACE_COLORS,
  WORKSPACE_ICONS,
  type WorkspaceColor,
  type WorkspaceIcon,
  type WorkspaceStorage,
} from "../../domain/workspaces";
import type { WorkspaceDetails } from "../../state/workspaces";
import { WorkspaceGlyph } from "../workspace/workspace-glyph";
import type { RecentWorkspace } from "../workspace/workspace-switcher";
import { GroupHeading, SectionHeading, SettingsGroup, SettingsRow } from "./settings-parts";

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

/** Each swatch's fill: the hue's middle step, which reads on both themes. */
const SWATCH_COLORS: Record<WorkspaceColor, string> = {
  neutral: "var(--color-neutral-500)",
  indigo: "var(--color-indigo-600)",
  emerald: "var(--color-emerald-600)",
  amber: "var(--color-amber-600)",
  rose: "var(--color-rose-600)",
};

const FOLDER_STATUS_TEXT = {
  ready: undefined,
  "needs-permission": "Needs access",
  unavailable: "Not found",
} as const;

const ICON_CHOICE_CLASS =
  "text-text-muted hover:bg-hover hover:text-text has-checked:bg-selected has-checked:text-text-strong has-checked:shadow-[inset_0_0_0_1px_var(--color-line-strong)] has-focus-visible:ring-1 has-focus-visible:ring-[var(--focus-ring)] relative flex size-8 cursor-pointer items-center justify-center rounded-[7px] transition-colors duration-100";

const SWATCH_CLASS =
  "has-checked:outline-text-strong has-focus-visible:ring-1 has-focus-visible:ring-[var(--focus-ring)] has-focus-visible:ring-offset-4 has-focus-visible:ring-offset-frame relative block size-[22px] cursor-pointer rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] outline-offset-2 has-checked:outline-2";

interface WorkspaceSectionProps {
  workspace: RecentWorkspace;
  onChange: (changes: WorkspaceDetails) => void;
  onAddFolder: () => void;
  onRemoveFolder: (folderId: string) => void;
  storage: WorkspaceStorage;
  /** Whether the details may move into the home folder, which needs write access to it. */
  canStoreInFolder: boolean;
  onChangeStorage: (storage: WorkspaceStorage) => void;
}

/**
 * The current workspace's name, icon, colour, folders, and where its details are kept. Each change
 * applies as soon as it is made and valid.
 *
 * @param props - WorkspaceSection properties.
 * @returns Section content.
 */
export function WorkspaceSection({
  workspace,
  onChange,
  onAddFolder,
  onRemoveFolder,
  storage,
  canStoreInFolder,
  onChangeStorage,
}: WorkspaceSectionProps) {
  const idPrefix = useId();
  const nameId = `${idPrefix}-name`;
  const nameHintId = `${idPrefix}-name-hint`;
  const [nameDraft, setNameDraft] = useState(workspace.name);
  const nameCheck = validateWorkspaceName(nameDraft);
  const folders = workspace.folders ?? [];
  const homeName = folders[0]?.name;
  // The choice is shown only when there is one: a folder that can't be written offers no other place.
  const canChooseStorage = homeName !== undefined && (canStoreInFolder || storage === "folder");

  return (
    <>
      <SectionHeading
        title={workspace.name}
        lead="These apply to this workspace only. Vista's own settings apply to every workspace."
      />
      <SettingsGroup>
        <SettingsRow
          label="Name"
          htmlFor={nameId}
          descriptionId={nameHintId}
          description={
            nameCheck.ok ? (
              "Shown in the workspace switcher and the recent list."
            ) : (
              <span role="alert" className="text-destructive">
                {nameCheck.message} The name stays &ldquo;{workspace.name}&rdquo;.
              </span>
            )
          }
        >
          <input
            id={nameId}
            type="text"
            value={nameDraft}
            aria-invalid={!nameCheck.ok || undefined}
            aria-describedby={nameHintId}
            onChange={(event) => {
              setNameDraft(event.target.value);
              const check = validateWorkspaceName(event.target.value);
              if (check.ok) {
                onChange({ name: check.name });
              }
            }}
            className="ipt w-64 max-w-full text-[13px]"
          />
        </SettingsRow>
        <SettingsRow label="Icon" labelId={`${idPrefix}-icon`}>
          <div role="radiogroup" aria-labelledby={`${idPrefix}-icon`} className="grid grid-cols-6 gap-1">
            {WORKSPACE_ICONS.map((icon) => (
              <label key={icon} title={ICON_LABELS[icon]} className={ICON_CHOICE_CLASS}>
                <input
                  type="radio"
                  name={`${idPrefix}-icon`}
                  aria-label={ICON_LABELS[icon]}
                  checked={workspace.icon === icon}
                  onChange={() => onChange({ icon })}
                  className="sr-only"
                />
                <WorkspaceGlyph icon={icon} color="neutral" className="text-base" />
              </label>
            ))}
          </div>
        </SettingsRow>
        <SettingsRow label="Colour" labelId={`${idPrefix}-color`}>
          <div role="radiogroup" aria-labelledby={`${idPrefix}-color`} className="flex gap-2">
            {WORKSPACE_COLORS.map((color) => (
              <label
                key={color}
                title={COLOR_LABELS[color]}
                className={SWATCH_CLASS}
                style={{ backgroundColor: SWATCH_COLORS[color] }}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-color`}
                  aria-label={COLOR_LABELS[color]}
                  checked={workspace.color === color}
                  onChange={() => onChange({ color })}
                  className="sr-only"
                />
              </label>
            ))}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <GroupHeading id={`${idPrefix}-folders`}>Folders</GroupHeading>
      <SettingsGroup labelledBy={`${idPrefix}-folders`}>
        <ul>
          {folders.map((folder) => (
            <li key={folder.id} className="border-line flex h-11 items-center gap-2.5 px-4 text-[13px] [&+&]:border-t">
              <i className="ic-folder text-text-faint flex-none" aria-hidden="true" />
              <span className="text-text-strong min-w-0 flex-1 truncate">{folder.name}</span>
              {FOLDER_STATUS_TEXT[folder.status] && (
                <span className="text-text-muted flex-none text-xs">{FOLDER_STATUS_TEXT[folder.status]}</span>
              )}
              {folders.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove "${folder.name}" from the workspace`}
                  title="Remove from the workspace"
                  onClick={() => onRemoveFolder(folder.id)}
                  className="icon-button -mr-1.5 size-7 text-base"
                >
                  <i className="ic-x" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </SettingsGroup>
      <button type="button" onClick={onAddFolder} className="btn sm mt-3">
        <i className="ic-folder-plus" aria-hidden="true" />
        Add Folder…
      </button>

      {canChooseStorage && (
        <>
          <GroupHeading id={`${idPrefix}-storage`}>Where its details are kept</GroupHeading>
          <SettingsGroup>
            <div
              role="radiogroup"
              aria-labelledby={`${idPrefix}-storage`}
              className="flex flex-col gap-2.5 px-4 py-3.5"
            >
              <StorageChoice
                name={`${idPrefix}-storage`}
                isChecked={storage === "device"}
                onChoose={() => onChangeStorage("device")}
                label="On this device"
                description="Nothing is written into your folders."
              />
              <StorageChoice
                name={`${idPrefix}-storage`}
                isChecked={storage === "folder"}
                onChoose={() => onChangeStorage("folder")}
                label={`In ${homeName}/.vista`}
                description="The name, icon, colour, and folder list travel with the folder, through sync or git. Your open tabs stay on this device."
              />
            </div>
          </SettingsGroup>
        </>
      )}
    </>
  );
}

interface StorageChoiceProps {
  name: string;
  isChecked: boolean;
  onChoose: () => void;
  label: string;
  description: string;
}

function StorageChoice({ name, isChecked, onChoose, label, description }: StorageChoiceProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="radio"
        name={name}
        checked={isChecked}
        onChange={onChoose}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className="radio mt-px flex-none"
      />
      <span className="min-w-0">
        <span id={labelId} className="text-text-strong block text-[13px] font-medium">
          {label}
        </span>
        <span id={descriptionId} className="text-text-muted block text-[12.5px] leading-[1.45]">
          {description}
        </span>
      </span>
    </label>
  );
}
