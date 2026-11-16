import { useId } from "react";

import { formatShortcut } from "../../commands";
import { VistaLoader, VistaLogo } from "../brand/vista-logo";
import { WorkspaceGlyph } from "../workspace/workspace-glyph";
import { describeRecentFolders, type RecentWorkspace } from "../workspace/workspace-switcher";

/** A key hint on the empty frame of an open workspace: what a shortcut does, and the shortcut. */
export interface StartHint {
  label: string;
  /** Shortcut in the `Mod+P` notation. */
  shortcut: string;
}

interface StartScreenProps {
  /** Whether a workspace is open, so the frame shows hints instead of the start list. */
  hasWorkspace: boolean;
  /** Whether a folder is still being opened or restored, so nothing is offered yet. */
  isLoading: boolean;
  /** The remembered workspaces, the most recent first. */
  recents: readonly RecentWorkspace[];
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  /** Shortcut that opens Settings, in the `Mod+,` notation. */
  settingsShortcut: string;
  onOpenRecent: (workspaceId: string) => void;
  onRemoveRecent: (workspaceId: string) => void;
  /** Key hints shown while a workspace is open and no file is. */
  hints: readonly StartHint[];
}

/** A row of the start screen's lists: icon, text, and an optional detail at the right end. */
const ROW_CLASS =
  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[13px] text-text transition-colors duration-100 hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]";
/** A list heading; it shares the left edge of the rows' icons. */
const HEADING_CLASS = "text-text-faint text-xs font-medium";

/**
 * Fills the editor area while no file is open. While a folder is being opened or restored it shows
 * the loader. Without a workspace it shows the logo, the Start list (Open Folder and Settings), and
 * the recent workspaces. With a workspace it shows only a few key hints: every action already has
 * its home in the shell, so the empty frame repeats none of them.
 *
 * @param props - StartScreen properties.
 * @returns Start screen element.
 */
export function StartScreen({
  hasWorkspace,
  isLoading,
  recents,
  onOpenFolder,
  onOpenSettings,
  settingsShortcut,
  onOpenRecent,
  onRemoveRecent,
  hints,
}: StartScreenProps) {
  const openFolderLabelId = useId();
  const openFolderHintId = useId();

  if (!hasWorkspace && isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <VistaLoader label="Opening folder…" className="h-10 w-12" />
      </div>
    );
  }

  if (hasWorkspace) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <dl className="text-text-faint grid grid-cols-[auto_auto] items-center gap-x-6 gap-y-2 text-[13px]">
          {hints.map((hint) => (
            <div key={hint.label} className="contents">
              <dt className="text-right">{hint.label}</dt>
              <dd>
                <kbd className="shortcut-key">{formatShortcut(hint.shortcut)}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto p-6">
      <div className="my-auto flex w-full max-w-md flex-col gap-10">
        <h1 className="flex">
          <VistaLogo className="h-8 w-auto" />
        </h1>
        <section aria-labelledby="start-list" className="flex flex-col gap-1.5">
          <h2 id="start-list" className={HEADING_CLASS}>
            Start
          </h2>
          <ul className="-mx-2 flex flex-col gap-px">
            <li>
              <button
                type="button"
                onClick={onOpenFolder}
                aria-labelledby={openFolderLabelId}
                aria-describedby={openFolderHintId}
                className={`${ROW_CLASS} items-start`}
              >
                <i className="ic-folder-open text-text-muted mt-0.5 flex-none text-base" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span id={openFolderLabelId} className="text-text-strong">
                    Open Folder…
                  </span>
                  <span id={openFolderHintId} aria-hidden="true" className="text-text-muted text-xs">
                    The folder becomes a workspace. You can add more folders to it later.
                  </span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" onClick={onOpenSettings} className={ROW_CLASS}>
                <i className="ic-settings text-text-muted flex-none text-base" aria-hidden="true" />
                <span className="text-text-strong flex-1">Settings</span>
                <kbd aria-hidden="true" className="shortcut-key flex-none">
                  {formatShortcut(settingsShortcut)}
                </kbd>
              </button>
            </li>
          </ul>
        </section>
        {recents.length > 0 && (
          <section aria-labelledby="recent-workspaces" className="flex flex-col gap-1.5">
            <h2 id="recent-workspaces" className={HEADING_CLASS}>
              Recent workspaces
            </h2>
            <ul className="-mx-2 flex flex-col gap-px">
              {recents.map((workspace) => (
                <RecentEntry
                  key={workspace.id}
                  workspace={workspace}
                  onOpen={() => onOpenRecent(workspace.id)}
                  onRemove={() => onRemoveRecent(workspace.id)}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * When a workspace was last opened, as a short date: "Today", "Yesterday", the month and day this
 * year, or the full date before that.
 */
export function formatLastOpened(timestamp: number, now = Date.now()): string {
  const day = new Date(timestamp);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (timestamp >= startOfToday) {
    return "Today";
  }
  if (timestamp >= startOfToday - 24 * 60 * 60 * 1000) {
    return "Yesterday";
  }
  return day.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: day.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

interface RecentEntryProps {
  workspace: RecentWorkspace;
  onOpen: () => void;
  onRemove: () => void;
}

function RecentEntry({ workspace, onOpen, onRemove }: RecentEntryProps) {
  const descriptionId = useId();
  const dateId = useId();
  const needsPermission = workspace.folders?.some((folder) => folder.status === "needs-permission") ?? false;
  const description = needsPermission ? "Click to allow access" : describeRecentFolders(workspace);
  const lastOpened =
    workspace.lastOpenedAt !== undefined && workspace.lastOpenedAt > 0
      ? formatLastOpened(workspace.lastOpenedAt)
      : null;
  const describedBy = [description === undefined ? null : descriptionId, lastOpened === null ? null : dateId]
    .filter((id) => id !== null)
    .join(" ");
  return (
    <li className="relative flex items-center">
      <button
        type="button"
        onClick={onOpen}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        className={`${ROW_CLASS} pr-10`}
      >
        <WorkspaceGlyph icon={workspace.icon} color={workspace.color} isTile className="text-xs" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-text-strong truncate">{workspace.name}</span>
          {description !== undefined && (
            <span id={descriptionId} aria-hidden="true" className="text-text-muted truncate text-xs">
              {description}
            </span>
          )}
        </span>
        {lastOpened !== null && (
          <span id={dateId} aria-hidden="true" className="text-text-faint flex-none text-xs">
            {lastOpened}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove "${workspace.name}" from Recent`}
        title="Remove from Recent"
        className="icon-button text-text-faint absolute right-1.5 size-6"
      >
        <i className="ic-x" aria-hidden="true" />
      </button>
    </li>
  );
}
