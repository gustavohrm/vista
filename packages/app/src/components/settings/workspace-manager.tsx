import { useEffect, useId, useRef, useState } from "react";

import {
  isPaletteColor,
  parseWorkspaceColor,
  validateWorkspaceName,
  WORKSPACE_COLORS,
  WORKSPACE_ICONS,
  type PaletteColor,
  type WorkspaceColor,
  type WorkspaceIcon,
  type WorkspaceStorage,
} from "../../domain/workspaces";
import type { WorkspaceDetails } from "../../state/workspaces";
import { Tooltip } from "../feedback/tooltip";
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

const COLOR_LABELS: Record<PaletteColor, string> = {
  neutral: "Neutral",
  indigo: "Indigo",
  emerald: "Emerald",
  amber: "Amber",
  rose: "Rose",
};

/** Each swatch's fill: the hue's middle step, which reads on both themes. */
const SWATCH_COLORS: Record<PaletteColor, string> = {
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

/** Whether a workspace is the open one, waits for permission, or has none of its folders found; null for none of these. */
export type ManagedWorkspaceStatus = "open" | "needs-permission" | "unavailable" | null;

/** A workspace as Settings lists it: by name, with whether it is open or can't be reached. */
export interface ManagedWorkspace extends RecentWorkspace {
  status: ManagedWorkspaceStatus;
}

/**
 * Why the details of a workspace kept in its folder can't be changed now: still being read, the home
 * folder waiting for permission, not found, or holding a file this Vista can't read. Null when they can.
 */
export type WorkspaceLock = "loading" | "needs-permission" | "unavailable" | "unreadable" | null;

interface WorkspacePageProps {
  workspace: RecentWorkspace;
  /** Whether it is the open workspace, which has no Open button. */
  isOpen: boolean;
  storage: WorkspaceStorage;
  /** Whether the details may move into the home folder, which needs write access to it. */
  canStoreInFolder: boolean;
  lock: WorkspaceLock;
  onOpen: () => void;
  /** Asks for permission to the home folder, while it waits for it. */
  onAllowAccess: () => void;
  onChange: (changes: WorkspaceDetails) => void;
  onAddFolder: () => void;
  onRemoveFolder: (folderId: string) => void;
  onChangeStorage: (storage: WorkspaceStorage) => void;
  onDelete: () => void;
}

/**
 * A workspace's page in Settings: its name, icon, colour, folders, where its details are kept, and
 * Delete Workspace. Any workspace's page can be edited, open or not, and each change applies as soon
 * as it is made and valid. While the details kept in the home folder can't be read, the fields are
 * disabled and say why, and Delete Workspace still works.
 *
 * @param props - WorkspacePage properties.
 * @returns Section content.
 */
export function WorkspacePage({
  workspace,
  isOpen,
  storage,
  canStoreInFolder,
  lock,
  onOpen,
  onAllowAccess,
  onChange,
  onAddFolder,
  onRemoveFolder,
  onChangeStorage,
  onDelete,
}: WorkspacePageProps) {
  const idPrefix = useId();
  const nameId = `${idPrefix}-name`;
  const nameHintId = `${idPrefix}-name-hint`;
  const [nameDraft, setNameDraft] = useState(workspace.name);
  const nameCheck = validateWorkspaceName(nameDraft);
  const folders = workspace.folders ?? [];
  const homeName = folders[0]?.name ?? "";
  const isLocked = lock !== null;
  // The choice is shown only when there is one: a folder that can't be written offers no other place,
  // and a home folder not reachable yet can neither take the file nor have it deleted.
  const canChooseStorage = !isLocked && folders[0]?.status === "ready" && (canStoreInFolder || storage === "folder");

  return (
    <>
      <SectionHeading
        title={workspace.name}
        icon={<WorkspaceGlyph icon={workspace.icon} color={workspace.color} isTile className="text-xs" />}
        action={
          !isOpen && (
            <button type="button" onClick={onOpen} className="btn sm flex-none">
              Open
            </button>
          )
        }
        lead="These apply to this workspace only. Vista's own settings apply to every workspace."
      />
      {lock === "needs-permission" && (
        <div className="mb-6">
          <SettingsGroup>
            <SettingsRow
              label={`"${homeName}" needs access`}
              description="The details are kept in this folder, so Vista reads them from there."
            >
              <button type="button" onClick={onAllowAccess} className="btn sm flex-none">
                Allow access
              </button>
            </SettingsRow>
          </SettingsGroup>
        </div>
      )}
      {(lock === "unavailable" || lock === "unreadable") && (
        <output className="text-text-muted mb-6 block text-[13px] leading-normal">
          {lock === "unavailable"
            ? `"${homeName}" isn't found, so the details kept in it can't be changed.`
            : `"${homeName}" holds workspace details this version of Vista can't read, so they can't be changed here.`}
        </output>
      )}
      <fieldset disabled={isLocked} className="min-w-0 disabled:opacity-60">
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
              <CustomColorSwatch color={workspace.color} onChange={(color) => onChange({ color })} />
            </div>
          </SettingsRow>
        </SettingsGroup>

        <GroupHeading
          id={`${idPrefix}-folders`}
          action={
            <Tooltip text="Add Folder to Workspace" position="bottom" className="-mr-1.5 flex flex-none">
              {(bubbleId) => (
                <button
                  type="button"
                  onClick={onAddFolder}
                  aria-label="Add Folder to Workspace"
                  aria-describedby={bubbleId}
                  className="icon-button size-7 text-base"
                >
                  <i className="ic-plus" aria-hidden="true" />
                </button>
              )}
            </Tooltip>
          }
        >
          Folders
        </GroupHeading>
        <SettingsGroup labelledBy={`${idPrefix}-folders`}>
          <ul>
            {folders.map((folder) => (
              <li
                key={folder.id}
                className="border-line flex h-11 items-center gap-2.5 px-4 text-[13px] [&+&]:border-t"
              >
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
      </fieldset>

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

      {/* Last, in its own group, so it is never mistaken for one of the details. */}
      <div className="mt-8">
        <SettingsGroup>
          <SettingsRow
            label="Delete workspace"
            description="Vista forgets this workspace and its tabs. Your folders and files aren't changed."
          >
            <button type="button" onClick={onDelete} className="btn sm destructive flex-none">
              Delete Workspace…
            </button>
          </SettingsRow>
        </SettingsGroup>
      </div>
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

/** What the custom swatch shows before a colour is picked: every hue, so it reads as "any colour". */
const CUSTOM_SWATCH_IDLE = "conic-gradient(from 90deg, #f43f5e, #f59e0b, #10b981, #0ea5e9, #6366f1, #d946ef, #f43f5e)";
/** Where the picker starts when the workspace has a palette colour. */
const CUSTOM_COLOR_START = "#7c8cff";

/**
 * The last swatch of the colour row, which opens the system colour picker. It shows every hue until
 * a custom colour is chosen, then that colour, ringed like a chosen swatch. The swatch follows the
 * picker as it moves, but the workspace takes the colour only once the picker commits it, so
 * dragging across the picker doesn't save the details on every step.
 */
function CustomColorSwatch({ color, onChange }: { color: WorkspaceColor; onChange: (color: WorkspaceColor) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isCustom = !isPaletteColor(color);
  const [preview, setPreview] = useState<string | null>(null);
  // A colour chosen otherwise, such as a palette swatch after the picker was dismissed, replaces one
  // the picker showed without committing.
  const [previewedColor, setPreviewedColor] = useState(color);
  if (color !== previewedColor) {
    setPreviewedColor(color);
    setPreview(null);
  }
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return undefined;
    }
    // React's onChange is the input event, which fires on every step; the native change event fires once.
    const handleCommit = () => {
      setPreview(null);
      onChangeRef.current(parseWorkspaceColor(input.value));
    };
    input.addEventListener("change", handleCommit);
    return () => input.removeEventListener("change", handleCommit);
  }, []);

  // Uncontrolled, so the picker can move freely; it starts from the colour the workspace has now.
  const startColor = isCustom ? color : CUSTOM_COLOR_START;
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = startColor;
    }
  }, [startColor]);

  const shown = preview ?? (isCustom ? color : null);
  return (
    <label
      title="Custom colour"
      className={`${SWATCH_CLASS} ${isCustom ? "outline-text-strong outline-2" : ""}`}
      style={{ background: shown ?? CUSTOM_SWATCH_IDLE }}
    >
      <input
        ref={inputRef}
        type="color"
        aria-label="Custom colour"
        defaultValue={startColor}
        onChange={(event) => setPreview(event.target.value)}
        className="sr-only"
      />
    </label>
  );
}
