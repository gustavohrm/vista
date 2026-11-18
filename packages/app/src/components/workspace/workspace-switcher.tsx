import { useRef, useState } from "react";

import type { WorkspaceColor, WorkspaceIcon } from "../../domain/workspaces";
import { Menu, MENU_SEPARATOR, type MenuEntry } from "../menu/menu";
import { WorkspaceGlyph } from "./workspace-glyph";

/** Whether Vista can read a folder now, needs the user's permission first, or can't find it. */
export type FolderStatus = "ready" | "needs-permission" | "unavailable";

/** A remembered workspace as the switcher and the start screen list it. */
export interface RecentWorkspace {
  id: string;
  name: string;
  icon: WorkspaceIcon;
  color: WorkspaceColor;
  /** Its folders, or null until Vista has looked them up. */
  folders: readonly { id: string; name: string; status: FolderStatus }[] | null;
  /** When it was last opened, in milliseconds since the epoch; 0 or absent when unknown. */
  lastOpenedAt?: number;
}

/** Space between the switcher button and its menu, in pixels. */
const MENU_OFFSET_PX = 4;

interface WorkspaceSwitcherProps {
  /** The open workspace, or null while none is. */
  current: RecentWorkspace | null;
  /** The recent workspaces, the most recent first, including the current one. */
  recents: readonly RecentWorkspace[];
  onSwitch: (workspaceId: string) => void;
  onOpenFolder: () => void;
  /** Opens the workspace manager. */
  onManage: () => void;
  /** Opens the current workspace's page in the manager. */
  onOpenSettings: () => void;
  onClose: () => void;
  /** Takes a workspace out of Recent without forgetting it. */
  onRemoveFromRecent: (workspaceId: string) => void;
  /** Whether the button is unavailable, as while the last workspace is still being restored. */
  isDisabled?: boolean;
}

/**
 * The button at the top left that shows the open workspace, and its menu: the recent workspaces to
 * switch to, then Open Folder and Manage Workspaces, then Workspace Settings and Close Workspace while
 * a workspace is open. Each recent row but the current one's can be removed from Recent, with its X
 * or the Delete key, and the menu stays open. Creating, editing, and deleting workspaces live in the
 * manager; adding a folder lives in the explorer's header, beside the folders it adds to.
 */
export function WorkspaceSwitcher({
  current,
  recents,
  onSwitch,
  onOpenFolder,
  onManage,
  onOpenSettings,
  onClose,
  onRemoveFromRecent,
  isDisabled = false,
}: WorkspaceSwitcherProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);

  const items: MenuEntry[] = [
    ...recents.map((workspace): MenuEntry => {
      const isCurrent = workspace.id === current?.id;
      return {
        id: workspace.id,
        label: workspace.name,
        icon: <WorkspaceGlyph icon={workspace.icon} color={workspace.color} isTile className="text-xs" />,
        selected: isCurrent,
        onSelect: () => {
          if (!isCurrent) {
            onSwitch(workspace.id);
          }
        },
        // The open workspace is the most recent, and would come back the next time it opens.
        remove: isCurrent
          ? undefined
          : { label: `Remove "${workspace.name}" from Recent`, onRemove: () => onRemoveFromRecent(workspace.id) },
      };
    }),
    ...(recents.length > 0 ? [MENU_SEPARATOR as MenuEntry] : []),
    { label: "Open Folder…", icon: <i className="ic-folder-open" aria-hidden="true" />, onSelect: onOpenFolder },
    { label: "Manage Workspaces…", icon: <i className="ic-layers" aria-hidden="true" />, onSelect: onManage },
    ...(current
      ? ([
          MENU_SEPARATOR,
          {
            label: "Workspace Settings…",
            icon: <i className="ic-settings-2" aria-hidden="true" />,
            onSelect: onOpenSettings,
          },
          { label: "Close Workspace", icon: <i className="ic-folder-x" aria-hidden="true" />, onSelect: onClose },
        ] satisfies MenuEntry[])
      : []),
  ];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        disabled={isDisabled}
        onClick={(event) => {
          if (open) {
            setOpen(null);
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          setOpen({ x: bounds.left, y: bounds.bottom + MENU_OFFSET_PX });
        }}
        className={`enabled:hover:bg-hover flex h-8 min-w-0 shrink items-center gap-2 rounded-md pr-2 pl-[7px] text-[13px] transition-colors duration-100 disabled:opacity-60 ${current ? "text-text-strong font-semibold" : "text-text-muted"} ${open ? "bg-selected" : ""}`}
      >
        {current ? (
          <WorkspaceGlyph icon={current.icon} color={current.color} isTile className="text-xs" />
        ) : (
          // An empty tile, dashed like a hidden panel's glyph, keeps the name where a workspace's sits.
          <span
            aria-hidden="true"
            className="size-5 flex-none rounded-[5px] border border-dashed border-current opacity-60"
          />
        )}
        <span className="max-w-48 min-w-0 truncate">{current ? current.name : "No workspace"}</span>
        <i className="ic-chevrons-up-down text-text-faint flex-none text-xs" aria-hidden="true" />
      </button>
      {open && (
        <Menu
          label="Workspaces"
          items={items}
          x={open.x}
          y={open.y}
          onClose={() => setOpen(null)}
          returnFocusTo={buttonRef.current}
          ignorePointerDownIn={buttonRef.current}
        />
      )}
    </>
  );
}
