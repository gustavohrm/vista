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
  current: RecentWorkspace;
  /** Every remembered workspace, the most recent first, including the current one. */
  recents: readonly RecentWorkspace[];
  onSwitch: (workspaceId: string) => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

/**
 * The button at the top left that shows the open workspace, and its menu: the recent workspaces to
 * switch to, then Open Folder, Workspace Settings, and Close Workspace. Adding a folder to the workspace lives in the
 * explorer's header, beside the folders it adds to.
 */
export function WorkspaceSwitcher({
  current,
  recents,
  onSwitch,
  onOpenFolder,
  onOpenSettings,
  onClose,
}: WorkspaceSwitcherProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);

  const items: MenuEntry[] = [
    ...recents.map((workspace): MenuEntry => ({
      id: workspace.id,
      label: workspace.name,
      icon: <WorkspaceGlyph icon={workspace.icon} color={workspace.color} isTile className="text-xs" />,
      selected: workspace.id === current.id,
      onSelect: () => {
        if (workspace.id !== current.id) {
          onSwitch(workspace.id);
        }
      },
    })),
    MENU_SEPARATOR,
    { label: "Open Folder…", icon: <i className="ic-folder-open" aria-hidden="true" />, onSelect: onOpenFolder },
    MENU_SEPARATOR,
    {
      label: "Workspace Settings…",
      icon: <i className="ic-settings-2" aria-hidden="true" />,
      onSelect: onOpenSettings,
    },
    { label: "Close Workspace", icon: <i className="ic-folder-x" aria-hidden="true" />, onSelect: onClose },
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
        className={`text-text-strong hover:bg-hover flex h-8 min-w-0 shrink items-center gap-2 rounded-md pr-2 pl-1.5 text-[13px] font-semibold transition-colors duration-100 ${open ? "bg-selected" : ""}`}
      >
        <WorkspaceGlyph icon={current.icon} color={current.color} isTile className="text-xs" />
        <span className="max-w-48 min-w-0 truncate">{current.name}</span>
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
