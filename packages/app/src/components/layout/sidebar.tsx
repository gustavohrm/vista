import { useEffect, useState, type ReactNode } from "react";

import { joinWorkspacePath } from "../../domain/path-validation";
import { isDesktopViewport } from "../../domain/viewport";
import type { Workspace, WorkspaceNode } from "../../ports";
import { Tooltip } from "../feedback/tooltip";
import { Menu, MENU_SEPARATOR, type MenuEntry } from "../menu/menu";
import { FileIcon } from "./file-icon";
import { TREE_ICON_PX, TREE_INDENT_PX, TREE_ROW_INSET_PX, TreeEntryNameInput } from "./tree-node-rename-input";

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

/** A request from outside the explorer, such as the File menu, to name a new entry at the workspace root. */
export interface NewEntryRequest {
  kind: "file" | "directory";
  /** Bumped for each request, so asking twice for the same kind starts a new entry each time. */
  serial: number;
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
  /** Workspace-relative paths of the open documents with unsaved changes, marked in the tree. */
  dirtyPaths?: ReadonlySet<string>;
  /** Callback triggered when user requests to open a folder. */
  onOpenFolder: () => void;
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
  /** Copies an entry's workspace-relative path. */
  onCopyRelativePath: (path: string) => void;
  /** Copies an entry's full path on disk. Omitted where there is none, such as in the browser. */
  onCopyPath?: (path: string) => void;
  /** Starts naming a new entry at the workspace root. */
  newEntryRequest?: NewEntryRequest | null;
}

/** Icon classes for file and folder glyphs in the tree, matching the row text color. */
const TREE_ICON_CLASS = "flex-none text-sm text-text-secondary";
/** Layout shared by every tree row: a full-width, fixed-height button with a visible keyboard focus ring. */
const TREE_ROW_CLASS =
  "flex h-7 w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]";
const TREE_ROW_IDLE_CLASS = "text-text-secondary hover:bg-surface/60 hover:text-text";
const TREE_ROW_ACTIVE_CLASS = "bg-surface text-text-strong font-medium";
const NO_DIRTY_PATHS: ReadonlySet<string> = new Set();
/**
 * Indent guide beside one child of an expanded directory. It runs the child's full height, and one
 * pixel more to cross the gap to the next child. Beside the last child it stops at the middle of
 * that child's row and curves in toward it. pointer-events-none keeps it from intercepting clicks.
 */
const INDENT_GUIDE_CLASS = "pointer-events-none absolute top-0 -bottom-px border-l";
const INDENT_GUIDE_END_CLASS = "pointer-events-none absolute top-0 h-3.5 rounded-bl-md border-b border-l";
const INDENT_GUIDE_COLOR_CLASS = "border-surface";
const ACTIVE_INDENT_GUIDE_COLOR_CLASS = "border-border";
/** How far the curve under the last child reaches toward that child's icon, in pixels. */
const INDENT_GUIDE_END_WIDTH_PX = TREE_INDENT_PX - TREE_ICON_PX / 2 - 3;

/**
 * Sidebar component that presents the file explorer tree for the active workspace, with a
 * header of explorer actions, a right-click context menu for creating, renaming, and deleting
 * files and folders, and empty and loading states when no workspace is ready. It keeps the active
 * document's folders expanded, and marks documents with unsaved changes. Its visibility
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
  dirtyPaths = NO_DIRTY_PATHS,
  onSelectFile,
  onOpenFolder,
  isLoading,
  isOpen,
  onClose,
  onCreateFile,
  onCreateDirectory,
  onRename,
  onDelete,
  onCopyRelativePath,
  onCopyPath,
  newEntryRequest,
}: SidebarProps) {
  // Directories start collapsed, as in VS Code, Zed, and Obsidian; only expanded ones are tracked.
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [pendingNewEntry, setPendingNewEntry] = useState<PendingNewEntry | null>(null);

  useEffect(() => {
    if (newEntryRequest) {
      setPendingNewEntry({ parentPath: "", kind: newEntryRequest.kind });
    }
  }, [newEntryRequest]);

  // Reveals the active document, which may have been opened from the picker or a tab.
  useEffect(() => {
    if (activePath === undefined) {
      return;
    }
    const ancestors = getAncestorPaths(activePath);
    setExpandedPaths((prev) => (ancestors.every((path) => prev.has(path)) ? prev : new Set([...prev, ...ancestors])));
  }, [activePath]);

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
      {isOpen && <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-30 bg-black/40 md:hidden" />}
      <nav
        aria-label="File Explorer"
        className={`bg-foreground text-text fixed top-10 bottom-0 left-0 z-40 flex w-[85vw] max-w-72 min-w-0 flex-none flex-col overflow-hidden transition-[width,transform] duration-200 select-none md:static md:z-auto md:max-w-none ${
          isOpen ? "translate-x-0 md:w-60 lg:w-64" : "-translate-x-full md:w-0 md:translate-x-0"
        }`}
      >
        <div className="flex h-10 flex-none items-center justify-between gap-2 pr-1.5 pl-3">
          <span className="text-text min-w-0 truncate text-[13px] font-semibold">
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
          className="flex-1 overflow-y-auto px-1.5 pb-2"
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
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-px">
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
                  dirtyPaths={dirtyPaths}
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
        <Menu
          label="File actions"
          items={buildTreeMenu(contextMenu, {
            onOpen: handleSelectFile,
            onNewFile: handleNewFile,
            onNewFolder: handleNewFolder,
            onRename: setRenamingPath,
            onDelete,
            onCopyRelativePath,
            onCopyPath,
          })}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

interface TreeMenuActions {
  onOpen: (path: string) => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onCopyRelativePath: (path: string) => void;
  onCopyPath?: (path: string) => void;
}

/**
 * Lists the actions for a tree entry: Open for a file, New File and New Folder for a folder or the
 * workspace root, then Rename and Delete, then the copy actions. The root has no rename, delete,
 * or relative path.
 */
function buildTreeMenu({ path, kind }: ContextMenuTarget, actions: TreeMenuActions): MenuEntry[] {
  const isRoot = path === "";
  const groups: MenuEntry[][] = [
    kind === "file"
      ? [{ label: "Open", icon: <i className="ic-file" aria-hidden="true" />, onSelect: () => actions.onOpen(path) }]
      : [
          {
            label: "New File",
            icon: <i className="ic-file-plus" aria-hidden="true" />,
            onSelect: () => actions.onNewFile(path),
          },
          {
            label: "New Folder",
            icon: <i className="ic-folder-plus" aria-hidden="true" />,
            onSelect: () => actions.onNewFolder(path),
          },
        ],
    isRoot
      ? []
      : [
          {
            label: "Rename",
            icon: <i className="ic-pencil" aria-hidden="true" />,
            onSelect: () => actions.onRename(path),
          },
          {
            label: "Delete",
            icon: <i className="ic-trash-2" aria-hidden="true" />,
            destructive: true,
            onSelect: () => actions.onDelete(path),
          },
        ],
    [
      ...(isRoot
        ? []
        : [
            {
              label: "Copy Relative Path",
              icon: <i className="ic-copy" aria-hidden="true" />,
              onSelect: () => actions.onCopyRelativePath(path),
            },
          ]),
      ...(actions.onCopyPath
        ? [
            {
              label: "Copy Path",
              icon: <i className="ic-clipboard" aria-hidden="true" />,
              onSelect: () => actions.onCopyPath?.(path),
            },
          ]
        : []),
    ],
  ];
  return groups
    .filter((group) => group.length > 0)
    .flatMap((group, index) => (index === 0 ? group : [MENU_SEPARATOR, ...group]));
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
          className="btn ghost icon sm"
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
    <div className="text-text-secondary flex items-center justify-center p-4">
      <i className="ic-loader-circle ic-anim-spin" aria-hidden="true" />
      <span className="visually-hidden">Loading…</span>
    </div>
  );
}

/**
 * Explorer content shown when no workspace is open. The start screen in the editor area offers
 * opening a folder, so this only says why the list is empty.
 *
 * @returns Empty state element.
 */
function EmptyState() {
  return (
    <div className="flex flex-col gap-1 px-1.5 py-1">
      <p className="text-text text-[13px]">No folder open</p>
      <p className="text-text-secondary text-xs">Files of the folder you open are listed here.</p>
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

const UNREADABLE_FOLDER_HINT = "Vista can't read this folder, so its files aren't listed";

interface DisclosureChevronProps {
  /** Whether the directory is collapsed, which selects a right or down chevron. */
  isCollapsed: boolean;
}

/**
 * Expand or collapse chevron at the right end of a directory row.
 *
 * @param props - DisclosureChevron properties.
 * @returns Chevron element.
 */
function DisclosureChevron({ isCollapsed }: DisclosureChevronProps) {
  return (
    <span aria-hidden="true" className="text-text-secondary flex flex-none items-center opacity-70">
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
  dirtyPaths: ReadonlySet<string>;
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
  dirtyPaths,
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
    return (
      <TreeEntryNameInput
        level={level}
        initialValue={node.name}
        icon={<EntryIcon kind={node.kind} extension={node.extension} isCollapsed={!expandedPaths.has(node.path)} />}
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
    const guideLeft = level * TREE_INDENT_PX + TREE_ROW_INSET_PX + TREE_ICON_PX / 2;
    const guideColor = isActiveFileParent ? ACTIVE_INDENT_GUIDE_COLOR_CLASS : INDENT_GUIDE_COLOR_CLASS;
    const renderGuide = (isLast: boolean) => (
      <span
        aria-hidden="true"
        style={isLast ? { left: guideLeft, width: INDENT_GUIDE_END_WIDTH_PX } : { left: guideLeft }}
        className={`${isLast ? INDENT_GUIDE_END_CLASS : INDENT_GUIDE_CLASS} ${guideColor}`}
      />
    );

    return (
      <div className="flex flex-col gap-px">
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
          title={node.isUnreadable ? UNREADABLE_FOLDER_HINT : undefined}
          className={`${TREE_ROW_CLASS} ${TREE_ROW_IDLE_CLASS}`}
        >
          <EntryIcon kind="directory" isCollapsed={isCollapsed} />
          <span className="min-w-0 flex-1 truncate">
            {node.name}
            {node.isUnreadable && <span className="sr-only"> ({UNREADABLE_FOLDER_HINT})</span>}
          </span>
          {node.isUnreadable && (
            <i className="ic-circle-alert text-text-secondary flex-none text-xs" aria-hidden="true" />
          )}
          <DisclosureChevron isCollapsed={isCollapsed} />
        </button>
        {showChildren && (
          <div className="relative flex flex-col gap-px">
            {showPendingEntry && (
              <div className="relative">
                {renderGuide(children.length === 0)}
                <TreeEntryNameInput
                  level={level + 1}
                  initialValue=""
                  icon={<EntryIcon kind={pendingNewEntry.kind} isCollapsed />}
                  siblingNames={children.map((child) => child.name)}
                  onCommit={onCommitNewEntry}
                  onCancel={onCancelNewEntry}
                />
              </div>
            )}
            {children.map((child, index) => (
              <div key={child.id} className="relative flex flex-col gap-px">
                {renderGuide(index === children.length - 1)}
                <TreeNode
                  node={child}
                  siblings={children}
                  level={level + 1}
                  activePath={activePath}
                  dirtyPaths={dirtyPaths}
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
              </div>
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
      <EntryIcon kind="file" extension={node.extension} />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      {dirtyPaths.has(node.path) && (
        <>
          <span aria-hidden="true" className="bg-text-secondary size-1.5 flex-none rounded-full" />
          <span className="visually-hidden"> (unsaved)</span>
        </>
      )}
    </button>
  );
}

/** Lists the paths of every directory that contains `path`, outermost first. */
function getAncestorPaths(path: string): string[] {
  const segments = path.split("/").slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
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
