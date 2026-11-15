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
}

/** Space between the switcher button and its menu, in pixels. */
const MENU_OFFSET_PX = 4;

/** The folder names of a workspace, as the second line of its entry. */
export function describeRecentFolders(workspace: RecentWorkspace): string | undefined {
  return workspace.folders?.map((folder) => folder.name).join(", ");
}

interface WorkspaceSwitcherProps {
  current: RecentWorkspace;
  /** Every remembered workspace, the most recent first, including the current one. */
  recents: readonly RecentWorkspace[];
  onSwitch: (workspaceId: string) => void;
  onOpenFolder: () => void;
  onAddFolder: () => void;
}

/**
 * The button at the top left that shows the open workspace, and its menu: the recent workspaces to
 * switch to, then Open Folder and Add Folder to Workspace.
 */
export function WorkspaceSwitcher({ current, recents, onSwitch, onOpenFolder, onAddFolder }: WorkspaceSwitcherProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);

  const items: MenuEntry[] = [
    ...recents.map((workspace): MenuEntry => ({
      id: workspace.id,
      label: workspace.name,
      description: describeRecentFolders(workspace),
      icon: <WorkspaceGlyph icon={workspace.icon} color={workspace.color} />,
      selected: workspace.id === current.id,
      onSelect: () => {
        if (workspace.id !== current.id) {
          onSwitch(workspace.id);
        }
      },
    })),
    MENU_SEPARATOR,
    { label: "Open Folder…", icon: <i className="ic-folder-open" aria-hidden="true" />, onSelect: onOpenFolder },
    {
      label: "Add Folder to Workspace…",
      icon: <i className="ic-folder-input" aria-hidden="true" />,
      onSelect: onAddFolder,
    },
  ];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        onClick={(event) => {
          if (open) {
            setOpen(null);
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          setOpen({ x: bounds.left, y: bounds.bottom + MENU_OFFSET_PX });
        }}
        className={`btn ghost sm min-w-0 flex-none gap-1.5 px-2! font-medium ${open ? "bg-surface" : ""}`}
      >
        <WorkspaceGlyph icon={current.icon} color={current.color} className="text-sm" />
        <span className="max-w-48 truncate">{current.name}</span>
        <i className="ic-chevron-down text-text-secondary text-xs" aria-hidden="true" />
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
