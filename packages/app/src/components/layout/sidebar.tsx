import { useState, type ReactNode } from "react";

import { joinWorkspacePath } from "../../domain/path-validation";
import { isDesktopViewport } from "../../domain/viewport";
import type { Workspace, WorkspaceNode } from "../../ports";
import { Tooltip } from "../feedback/tooltip";
import { FileIcon } from "./file-icon";
import { TreeContextMenu } from "./tree-context-menu";
import {
  TREE_CHEVRON_COLUMN_PX,
  TREE_INDENT_PX,
  TREE_ROW_INSET_PX,
  TreeEntryNameInput,
} from "./tree-node-rename-input";

interface ContextMenuTarget {
  /** Path of the node the menu was opened on, or an empty string for the workspace root. */
  path: string;
  /** Kind of the target, or "directory" for the workspace root. */
  kind: "file" | "directory";
  x: number;
  y: number;
}

interface PendingNewEntry {
  /** Path of the parent directory the new entry will be created in, empty string for root. */
  parentPath: string;
  kind: "file" | "directory";
}

interface SidebarProps {
  /** Active workspace descriptor, if any. */
  workspace: Workspace | null;
  /** Hierarchical tree nodes for the open workspace. */
  tree: WorkspaceNode[];
  /** Relative path of the currently active document. */
  activePath?: string;
  /** Callback triggered when a file node is clicked. */
  onSelectFile: (path: string) => void;
  /** Callback triggered when user requests to open a folder. */
  onOpenFolder: () => void;
  /** Name of a remembered folder that can be reopened with one click, or null. Shown only when no workspace is open. */
  restorableFolderName: string | null;
  /** Callback triggered when the user clicks the "Reopen <folder>" button. */
  onReopenFolder: () => void;
  /** Whether the workspace is loading. */
  isLoading?: boolean;
  /**
   * Whether the explorer panel is shown. Below the `md` breakpoint it is an overlay drawer with
   * a backdrop; at `md` and above it is a persistent in-flow column that collapses to zero width
   * when closed.
   */
  isOpen: boolean;
  /**
   * Callback triggered to close the panel, e.g. after selecting a file (below `md` only, where
   * the panel is a transient overlay rather than a persistent column) or tapping the backdrop.
   */
  onClose: () => void;
  /** Callback triggered to create a new empty file under parentPath. */
  onCreateFile: (parentPath: string, name: string) => void;
  /** Callback triggered to create a new empty directory under parentPath. */
  onCreateDirectory: (parentPath: string, name: string) => void;
  /** Callback triggered to rename or move an entry from one path to another. */
  onRename: (fromPath: string, toPath: string) => void;
  /** Callback triggered immediately when "Delete" is chosen for an entry. The caller owns any confirmation. */
  onDelete: (path: string) => void;
}

/** Icon classes for file and folder glyphs in the tree, matching the row text color. */
const TREE_ICON_CLASS = "flex-none text-sm text-text-secondary";
/** Layout shared by every tree row: a full-width, fixed-height button with a visible keyboard focus ring. */
const TREE_ROW_CLASS =
  "flex h-6 w-full items-center gap-1 rounded-sm pr-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]";
const TREE_ROW_IDLE_CLASS = "text-text-secondary hover:bg-surface hover:text-text";
const TREE_ROW_ACTIVE_CLASS = "bg-surface text-text-strong";
/** Indent guide line; pointer-events-none keeps it from intercepting clicks on the rows beneath. */
const INDENT_GUIDE_CLASS = "pointer-events-none absolute inset-y-0 w-px";
const INDENT_GUIDE_COLOR_CLASS = "bg-border";
const ACTIVE_INDENT_GUIDE_COLOR_CLASS = "bg-text-secondary/50";

/**
 * Sidebar component that presents the file explorer tree for the active workspace, with a
 * header of explorer actions, a right-click context menu for creating, renaming, and deleting
 * files and folders, and welcome and loading states when no workspace is ready. Its visibility
 * is controlled by `isOpen` at every breakpoint: below `md` it is a dismissible overlay drawer
 * with a backdrop, and at `md` and above it is a persistent in-flow column that collapses to
 * zero width rather than overlaying content.
 *
 * @param props - Sidebar properties.
 * @returns Sidebar element.
 */
export function Sidebar({
  workspace,
  tree,
  activePath,
  onSelectFile,
  onOpenFolder,
  restorableFolderName,
  onReopenFolder,
  isLoading,
  isOpen,
  onClose,
  onCreateFile,
  onCreateDirectory,
  onRename,
  onDelete,
}: SidebarProps) {
  // Directories start collapsed, as in VS Code, Zed, and Obsidian; only expanded ones are tracked.
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [pendingNewEntry, setPendingNewEntry] = useState<PendingNewEntry | null>(null);

  const handleSelectFile = (path: string) => {
    onSelectFile(path);
    // Below `md` the panel is a transient overlay, so picking a file dismisses it to reveal the
    // document underneath. At `md` and above it is a persistent column and stays open.
    if (!isDesktopViewport()) {
      onClose();
    }
  };

  const handleToggleCollapse = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCollapseAll = () => {
    setExpandedPaths(new Set());
  };

  const handleContextMenu = (path: string, kind: "file" | "directory", x: number, y: number) => {
    setContextMenu({ path, kind, x, y });
  };

  const handleNewFile = (parentPath: string) => {
    expandDirectory(parentPath);
    setPendingNewEntry({ parentPath, kind: "file" });
  };

  const handleNewFolder = (parentPath: string) => {
    expandDirectory(parentPath);
    setPendingNewEntry({ parentPath, kind: "directory" });
  };

  const expandDirectory = (path: string) => {
    setExpandedPaths((prev) => {
      if (path === "" || prev.has(path)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  };

  const handleCommitNewEntry = (name: string) => {
    if (!pendingNewEntry) {
      return;
    }
    if (pendingNewEntry.kind === "file") {
      onCreateFile(pendingNewEntry.parentPath, name);
    } else {
      onCreateDirectory(pendingNewEntry.parentPath, name);
    }
    setPendingNewEntry(null);
  };

  const handleCommitRename = (path: string, name: string) => {
    onRename(path, joinWorkspacePath(getParentPath(path), name));
    setRenamingPath(null);
  };

  return (
    <>
      {isOpen && <div aria-hidden="true" onClick={onClose} className="bg-background/70 fixed inset-0 z-30 md:hidden" />}
      <nav
        aria-label="File Explorer"
        className={`panel flush text-text fixed inset-y-0 left-12 z-40 flex w-[85vw] max-w-72 min-w-0 flex-col overflow-hidden rounded-none transition-[width,transform] duration-200 select-none md:static md:z-auto md:max-w-none ${
          isOpen
            ? "border-r-border translate-x-0 md:w-56 lg:w-64"
            : "-translate-x-full md:w-0 md:translate-x-0 md:border-none"
        }`}
      >
        <div className="border-border flex h-9 flex-none items-center justify-between gap-2 border-b px-3">
          <span className="text-text-secondary min-w-0 truncate text-xs font-semibold">
            {workspace ? workspace.name : "Explorer"}
          </span>
          {workspace && (
            <div className="flex flex-none items-center gap-0.5">
              <ExplorerActionButton label="New File" onClick={() => handleNewFile("")}>
                <i className="ic-file-plus text-sm" aria-hidden="true" />
              </ExplorerActionButton>
              <ExplorerActionButton label="New Folder" onClick={() => handleNewFolder("")}>
                <i className="ic-folder-plus text-sm" aria-hidden="true" />
              </ExplorerActionButton>
              <ExplorerActionButton label="Collapse All" onClick={handleCollapseAll}>
                <i className="ic-chevrons-down-up text-sm" aria-hidden="true" />
              </ExplorerActionButton>
              <ExplorerActionButton label="Open Another Folder" onClick={onOpenFolder}>
                <i className="ic-folder-input text-sm" aria-hidden="true" />
              </ExplorerActionButton>
            </div>
          )}
        </div>

        <div
          className="flex-1 overflow-y-auto p-1"
          onContextMenu={(event) => {
            if (!workspace) {
              return;
            }
            event.preventDefault();
            handleContextMenu("", "directory", event.clientX, event.clientY);
          }}
        >
          {isLoading ? (
            <LoadingIndicator />
          ) : !workspace ? (
            <WelcomeState
              restorableFolderName={restorableFolderName}
              onReopenFolder={onReopenFolder}
              onOpenFolder={onOpenFolder}
            />
          ) : (
            <div className="flex flex-col gap-0.5">
              {pendingNewEntry?.parentPath === "" && (
                <TreeEntryNameInput
                  level={0}
                  initialValue=""
                  icon={<EntryIcon kind={pendingNewEntry.kind} isCollapsed />}
                  siblingNames={tree.map((node) => node.name)}
                  onCommit={handleCommitNewEntry}
                  onCancel={() => setPendingNewEntry(null)}
                />
              )}
              {tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  siblings={tree}
                  level={0}
                  activePath={activePath}
                  onSelectFile={handleSelectFile}
                  expandedPaths={expandedPaths}
                  onToggleCollapse={handleToggleCollapse}
                  onContextMenu={handleContextMenu}
                  renamingPath={renamingPath}
                  onCommitRename={handleCommitRename}
                  onCancelRename={() => setRenamingPath(null)}
                  pendingNewEntry={pendingNewEntry}
                  onCommitNewEntry={handleCommitNewEntry}
                  onCancelNewEntry={() => setPendingNewEntry(null)}
                />
              ))}
            </div>
          )}
        </div>
      </nav>

      {contextMenu && (
        <TreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canCreateChildren={contextMenu.kind === "directory"}
          canRenameOrDelete={contextMenu.path !== ""}
          onNewFile={() => handleNewFile(contextMenu.path)}
          onNewFolder={() => handleNewFolder(contextMenu.path)}
          onRename={() => setRenamingPath(contextMenu.path)}
          onDelete={() => onDelete(contextMenu.path)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

interface ExplorerActionButtonProps {
  /** Accessible name and tooltip for the icon-only button. */
  label: string;
  /** Callback triggered when the button is activated. */
  onClick: () => void;
  /** Icon element displayed inside the button. */
  children: ReactNode;
}

/**
 * Icon-only button in the explorer header. Icon-only controls need an accessible name and a
 * tooltip, so both are derived from `label`.
 *
 * @param props - ExplorerActionButton properties.
 * @returns Icon button element.
 */
function ExplorerActionButton({ label, onClick, children }: ExplorerActionButtonProps) {
  return (
    <Tooltip text={label} position="bottom" align="end" className="flex flex-none">
      {(bubbleId) => (
        <button
          type="button"
          aria-label={label}
          aria-describedby={bubbleId}
          onClick={onClick}
          className="btn ghost icon sm p-sm"
        >
          {children}
        </button>
      )}
    </Tooltip>
  );
}

/**
 * Subtle centered spinner shown while the workspace tree is loading. The text is visually
 * hidden so the state is announced without adding visible copy.
 *
 * @returns Loading indicator element.
 */
function LoadingIndicator() {
  return (
    <div className="text-text-secondary flex items-center justify-center p-3">
      <span className="loader sm" aria-hidden="true" />
      <span className="visually-hidden">Loading…</span>
    </div>
  );
}

interface WelcomeStateProps {
  /** Name of a remembered folder that can be reopened, or null. */
  restorableFolderName: string | null;
  /** Callback triggered when the user clicks the reopen button. */
  onReopenFolder: () => void;
  /** Callback triggered when the user clicks the open folder button. */
  onOpenFolder: () => void;
}

/**
 * Compact explorer content shown when no workspace is open. It offers reopening the last folder
 * when one is remembered, and always offers opening a folder.
 *
 * @param props - WelcomeState properties.
 * @returns Welcome state element.
 */
function WelcomeState({ restorableFolderName, onReopenFolder, onOpenFolder }: WelcomeStateProps) {
  const openFolderClass = restorableFolderName ? "btn sm w-full" : "btn primary sm w-full";
  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-text-secondary text-xs">No folder open</p>
      {restorableFolderName && (
        <button type="button" onClick={onReopenFolder} className="btn primary sm w-full">
          <i className="ic-history" aria-hidden="true" />
          Reopen {restorableFolderName}
        </button>
      )}
      <button type="button" onClick={onOpenFolder} className={openFolderClass}>
        <i className="ic-folder-input" aria-hidden="true" />
        Open Folder
      </button>
    </div>
  );
}

interface EntryIconProps {
  /** Whether the entry is a folder or a file. */
  kind: "file" | "directory";
  /** Normalized extension of a file entry, used to choose its icon. */
  extension?: string;
  /** Whether a folder is collapsed, which selects the closed or open folder glyph. */
  isCollapsed?: boolean;
}

/**
 * Icon for a tree entry: a folder glyph reflecting its collapsed state, or a file glyph chosen
 * by extension.
 *
 * @param props - EntryIcon properties.
 * @returns Entry icon element.
 */
function EntryIcon({ kind, extension, isCollapsed = false }: EntryIconProps) {
  if (kind === "file") {
    return <FileIcon extension={extension ?? ""} className={TREE_ICON_CLASS} />;
  }
  return isCollapsed ? (
    <i className="ic-folder text-text-secondary flex-none text-sm" aria-hidden="true" />
  ) : (
    <i className="ic-folder-open text-text-secondary flex-none text-sm" aria-hidden="true" />
  );
}

interface DisclosureChevronProps {
  /** Whether the directory is collapsed, which selects a right or down chevron. */
  isCollapsed: boolean;
}

/**
 * Expand or collapse chevron for a directory row, centered in the fixed-width chevron column.
 *
 * @param props - DisclosureChevron properties.
 * @returns Chevron element.
 */
function DisclosureChevron({ isCollapsed }: DisclosureChevronProps) {
  return (
    <span aria-hidden="true" className="text-text-secondary flex w-3 flex-none items-center justify-center">
      {isCollapsed ? (
        <i className="ic-chevron-right text-xs" aria-hidden="true" />
      ) : (
        <i className="ic-chevron-down text-xs" aria-hidden="true" />
      )}
    </span>
  );
}

interface TreeNodeProps {
  node: WorkspaceNode;
  /** All sibling nodes at this level, including node itself, for rename collision checks. */
  siblings: WorkspaceNode[];
  level: number;
  activePath?: string;
  onSelectFile: (path: string) => void;
  expandedPaths: Set<string>;
  onToggleCollapse: (path: string) => void;
  onContextMenu: (path: string, kind: "file" | "directory", x: number, y: number) => void;
  renamingPath: string | null;
  onCommitRename: (path: string, name: string) => void;
  onCancelRename: () => void;
  pendingNewEntry: PendingNewEntry | null;
  onCommitNewEntry: (name: string) => void;
  onCancelNewEntry: () => void;
}

/**
 * Recursive tree row for a file or directory, including its inline rename input, pending
 * new-entry input, and the indent guide that connects an expanded directory to its children.
 *
 * @param props - TreeNode properties.
 * @returns Tree row element.
 */
function TreeNode({
  node,
  siblings,
  level,
  activePath,
  onSelectFile,
  expandedPaths,
  onToggleCollapse,
  onContextMenu,
  renamingPath,
  onCommitRename,
  onCancelRename,
  pendingNewEntry,
  onCommitNewEntry,
  onCancelNewEntry,
}: TreeNodeProps) {
  const siblingNames = siblings.filter((sibling) => sibling.path !== node.path).map((sibling) => sibling.name);
  const rowPaddingLeft = level * TREE_INDENT_PX + TREE_ROW_INSET_PX;

  if (renamingPath === node.path) {
    const isDirectory = node.kind === "directory";
    return (
      <TreeEntryNameInput
        level={level}
        initialValue={node.name}
        icon={<EntryIcon kind={node.kind} extension={node.extension} isCollapsed={!expandedPaths.has(node.path)} />}
        disclosure={isDirectory ? <DisclosureChevron isCollapsed={!expandedPaths.has(node.path)} /> : undefined}
        siblingNames={siblingNames}
        onCommit={(name) => onCommitRename(node.path, name)}
        onCancel={onCancelRename}
      />
    );
  }

  if (node.kind === "directory") {
    const children = node.children ?? [];
    const isCollapsed = !expandedPaths.has(node.path);
    const showPendingEntry = pendingNewEntry?.parentPath === node.path;
    const showChildren = !isCollapsed && (children.length > 0 || showPendingEntry);
    const isActiveFileParent = activePath !== undefined && getParentPath(activePath) === node.path;
    const guideLeft = level * TREE_INDENT_PX + TREE_ROW_INSET_PX + TREE_CHEVRON_COLUMN_PX / 2;

    return (
      <div className="flex flex-col">
        <button
          type="button"
          aria-expanded={!isCollapsed}
          onClick={() => onToggleCollapse(node.path)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onContextMenu(node.path, "directory", event.clientX, event.clientY);
          }}
          style={{ paddingLeft: rowPaddingLeft }}
          className={`${TREE_ROW_CLASS} ${TREE_ROW_IDLE_CLASS}`}
        >
          <DisclosureChevron isCollapsed={isCollapsed} />
          <EntryIcon kind="directory" isCollapsed={isCollapsed} />
          <span className="truncate">{node.name}</span>
        </button>
        {showChildren && (
          <div className="relative flex flex-col">
            <span
              aria-hidden="true"
              style={{ left: guideLeft }}
              className={`${INDENT_GUIDE_CLASS} ${isActiveFileParent ? ACTIVE_INDENT_GUIDE_COLOR_CLASS : INDENT_GUIDE_COLOR_CLASS}`}
            />
            {showPendingEntry && (
              <TreeEntryNameInput
                level={level + 1}
                initialValue=""
                icon={<EntryIcon kind={pendingNewEntry.kind} isCollapsed />}
                siblingNames={children.map((child) => child.name)}
                onCommit={onCommitNewEntry}
                onCancel={onCancelNewEntry}
              />
            )}
            {children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                siblings={children}
                level={level + 1}
                activePath={activePath}
                onSelectFile={onSelectFile}
                expandedPaths={expandedPaths}
                onToggleCollapse={onToggleCollapse}
                onContextMenu={onContextMenu}
                renamingPath={renamingPath}
                onCommitRename={onCommitRename}
                onCancelRename={onCancelRename}
                pendingNewEntry={pendingNewEntry}
                onCommitNewEntry={onCommitNewEntry}
                onCancelNewEntry={onCancelNewEntry}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activePath === node.path;

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.path)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(node.path, "file", event.clientX, event.clientY);
      }}
      style={{ paddingLeft: rowPaddingLeft }}
      className={`${TREE_ROW_CLASS} ${isActive ? TREE_ROW_ACTIVE_CLASS : TREE_ROW_IDLE_CLASS}`}
    >
      <span aria-hidden="true" className="w-3 flex-none" />
      <EntryIcon kind="file" extension={node.extension} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

/**
 * Returns the workspace-relative path of the directory that contains `path`.
 *
 * @param path - Workspace-relative path of a file or directory.
 * @returns The parent directory path, or an empty string for entries at the workspace root.
 */
function getParentPath(path: string): string {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex === -1 ? "" : path.slice(0, separatorIndex);
}
