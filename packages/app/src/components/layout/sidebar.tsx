import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

import { joinWorkspacePath } from "../../domain/path-validation";
import { isDesktopViewport } from "../../domain/viewport";
import { t } from "../../i18n";
import type { WorkspaceNode } from "../../ports";
import { documentKey } from "../../state/documents";
import { useReducedMotion } from "../../theme/appearance";
import { Tooltip } from "../feedback/tooltip";
import { Menu, MENU_SEPARATOR, type MenuEntry } from "../menu/menu";
import { FileIcon } from "./file-icon";
import { TREE_ICON_PX, TREE_INDENT_PX, TREE_ROW_INSET_PX, TreeEntryNameInput } from "./tree-node-rename-input";

/** One folder of the open workspace, as its root row shows it. */
export interface ExplorerFolder {
  id: string;
  name: string;
  /** Where the folder is, shown beside its name to tell same-named folders apart. */
  location?: string;
  /** Whether Vista can read the folder, or why it can't. */
  status: "ready" | "needs-permission" | "unavailable";
  tree: WorkspaceNode[];
  /** Whether the folder comes from the workspace's file and wasn't found, so the user can pick it. */
  canLocate?: boolean;
}

/** A path within one folder of the workspace. */
export interface ExplorerEntry {
  folderId: string;
  path: string;
}

interface ContextMenuTarget {
  folderId: string;
  /** Path of the node the menu was opened on, or an empty string for a folder's root row. */
  path: string;
  /** Kind of the target, or "directory" for a root row. */
  kind: "file" | "directory";
  x: number;
  y: number;
}

interface PendingNewEntry {
  folderId: string;
  /** Path of the parent directory the new entry will be created in, empty string for the folder's root. */
  parentPath: string;
  kind: "file" | "directory";
}

/** A request from outside the explorer, such as a command, to name a new entry in the first folder. */
export interface NewEntryRequest {
  kind: "file" | "directory";
  /** Bumped for each request, so asking twice for the same kind starts a new entry each time. */
  serial: number;
}

interface SidebarProps {
  /** The workspace's folders, in order. */
  folders: readonly ExplorerFolder[];
  /** The currently active document. */
  activeEntry?: ExplorerEntry;
  /** `documentKey`s of the open documents with unsaved changes, marked in the tree. */
  dirtyKeys?: ReadonlySet<string>;
  /** `documentKey`s of the expanded folders inside the workspace's folders. */
  expandedKeys: ReadonlySet<string>;
  onExpandedKeysChange: Dispatch<SetStateAction<ReadonlySet<string>>>;
  onSelectFile: (entry: ExplorerEntry) => void;
  onAddFolder: () => void;
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
  /** Creates a new empty file in a directory of a folder. */
  onCreateFile: (parent: ExplorerEntry, name: string) => void;
  /** Creates a new empty directory in a directory of a folder. */
  onCreateDirectory: (parent: ExplorerEntry, name: string) => void;
  /** Renames or moves an entry within its folder. */
  onRename: (entry: ExplorerEntry, toPath: string) => void;
  /** Called immediately when "Delete" is chosen for an entry. The caller owns any confirmation. */
  onDelete: (entry: ExplorerEntry) => void;
  /** Copies an entry's path within its folder. */
  onCopyRelativePath: (entry: ExplorerEntry) => void;
  /** Copies an entry's full path on disk. Omitted where there is none, such as in the browser. */
  onCopyPath?: (entry: ExplorerEntry) => void;
  /** Shows an entry in the operating system's file manager. Omitted where there is none. */
  onReveal?: (entry: ExplorerEntry) => void;
  /** Removes a folder from the workspace. Omitted while the workspace has only one folder. */
  onRemoveFolder?: (folderId: string) => void;
  /** Asks the browser again for access to a folder that needs permission. */
  onAllowAccess: (folderId: string) => void;
  onLocate?: (folderId: string) => void;
  /** Starts naming a new entry in the first folder. */
  newEntryRequest?: NewEntryRequest | null;
  /** Actions shown at the top of the panel, such as the rail's when the rail is not shown. */
  activities?: ReactNode;
}

/** Icon classes for file and folder glyphs in the tree, matching the row text color. */
const TREE_ICON_CLASS = "flex-none text-sm text-text-faint";
/** Layout shared by every tree row: a full-width, fixed-height button with a visible keyboard focus ring. */
const TREE_ROW_CLASS =
  "flex h-7 w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]";
const TREE_ROW_IDLE_CLASS = "text-text hover:bg-hover";
const TREE_ROW_ACTIVE_CLASS = "bg-selected text-text-strong font-medium";
/** The New File and New Folder buttons of a folder row, shown while the row is hovered or focused. */
const ROW_ACTIONS_CLASS =
  "absolute top-0 right-6 flex h-7 items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100";
const NO_KEYS: ReadonlySet<string> = new Set();
/** How long the panel takes to open or close, matching its `duration-300`, in milliseconds. */
const SIDEBAR_TRANSITION_MS = 300;
/**
 * Indent guide beside one child of an expanded directory. It runs the child's full height, and one
 * pixel more to cross the gap to the next child. Beside the last child it stops at the middle of
 * that child's row and curves in toward it. pointer-events-none keeps it from intercepting clicks.
 */
const INDENT_GUIDE_CLASS = "pointer-events-none absolute top-0 -bottom-px border-l";
const INDENT_GUIDE_END_CLASS = "pointer-events-none absolute top-0 h-3.5 rounded-bl-md border-b border-l";
const INDENT_GUIDE_COLOR_CLASS = "border-line";
const ACTIVE_INDENT_GUIDE_COLOR_CLASS = "border-line-strong";
/** How far the curve under the last child reaches toward that child's icon, in pixels. */
const INDENT_GUIDE_END_WIDTH_PX = TREE_INDENT_PX - TREE_ICON_PX / 2 - 3;

/**
 * Sidebar component that presents the file explorer for the open workspace: a header with the
 * workspace's name and actions, then a root row for each of its folders with that folder's tree.
 * A right-click context menu creates, renames, and deletes files and folders, and empty and loading
 * states show when no workspace is ready. It keeps the active document's folders expanded, and marks
 * documents with unsaved changes. Its visibility is controlled by `isOpen` at every breakpoint:
 * below `md` it is a dismissible overlay drawer with a backdrop, and at `md` and above it is a
 * persistent in-flow column that collapses to zero width rather than overlaying content.
 *
 * @param props - Sidebar properties.
 * @returns Sidebar element.
 */
export function Sidebar({
  folders,
  activeEntry,
  dirtyKeys = NO_KEYS,
  expandedKeys,
  onExpandedKeysChange,
  onSelectFile,
  onAddFolder,
  isLoading,
  isOpen,
  onClose,
  onCreateFile,
  onCreateDirectory,
  onRename,
  onDelete,
  onCopyRelativePath,
  onCopyPath,
  onReveal,
  onRemoveFolder,
  onAllowAccess,
  onLocate,
  newEntryRequest,
  activities,
}: SidebarProps) {
  // Root rows start expanded, so only the collapsed ones are tracked.
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<ReadonlySet<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [renaming, setRenaming] = useState<ExplorerEntry | null>(null);
  const [pendingNewEntry, setPendingNewEntry] = useState<PendingNewEntry | null>(null);
  const firstFolder = folders.find((folder) => folder.status === "ready");
  const firstFolderId = firstFolder?.id;
  // Read when a request arrives, so only a new request starts a new entry, not a change of folders.
  const firstFolderIdRef = useRef(firstFolderId);
  firstFolderIdRef.current = firstFolderId;

  useEffect(() => {
    const folderId = firstFolderIdRef.current;
    if (newEntryRequest && folderId !== undefined) {
      setPendingNewEntry({
        folderId,
        parentPath: "",
        kind: newEntryRequest.kind,
      });
      setCollapsedFolderIds((prev) => without(prev, folderId));
    }
  }, [newEntryRequest]);

  // Reveals the active document, which may have been opened from the picker or a tab.
  const activeFolderId = activeEntry?.folderId;
  const activePath = activeEntry?.path;
  useEffect(() => {
    if (activeFolderId === undefined || activePath === undefined) {
      return;
    }
    const ancestors = getAncestorPaths(activePath).map((path) => documentKey(activeFolderId, path));
    setCollapsedFolderIds((prev) => without(prev, activeFolderId));
    onExpandedKeysChange((prev) => (ancestors.every((key) => prev.has(key)) ? prev : new Set([...prev, ...ancestors])));
  }, [activeFolderId, activePath, onExpandedKeysChange]);

  // The panel clips its content only while closed or on its way open, so the rows don't spill past
  // its moving edge. Open and settled, it doesn't, so a header tooltip can reach over the frame.
  const [isSettledOpen, setIsSettledOpen] = useState(isOpen);
  if (!isOpen && isSettledOpen) {
    setIsSettledOpen(false);
  }
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    // The transition's end settles it; the timer covers reduced motion, where none runs.
    const timer = window.setTimeout(() => setIsSettledOpen(true), SIDEBAR_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const handleSelectFile = (entry: ExplorerEntry) => {
    onSelectFile(entry);
    // Below `md` the panel is a transient overlay, so picking a file dismisses it to reveal the
    // document underneath. At `md` and above it is a persistent column and stays open.
    if (!isDesktopViewport()) {
      onClose();
    }
  };

  const handleToggleCollapse = (key: string) => {
    onExpandedKeysChange((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleToggleFolder = (folderId: string) => {
    setCollapsedFolderIds((prev) => (prev.has(folderId) ? without(prev, folderId) : new Set([...prev, folderId])));
  };

  // Root rows stay open, so the folders' top-level entries remain in view.
  const handleCollapseAll = () => {
    onExpandedKeysChange(new Set());
    setCollapsedFolderIds(new Set());
  };

  const handleNewEntry = ({ folderId, path }: ExplorerEntry, kind: PendingNewEntry["kind"]) => {
    setCollapsedFolderIds((prev) => without(prev, folderId));
    if (path !== "") {
      const key = documentKey(folderId, path);
      onExpandedKeysChange((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
    }
    setPendingNewEntry({ folderId, parentPath: path, kind });
  };

  const handleCommitNewEntry = (name: string) => {
    if (!pendingNewEntry) {
      return;
    }
    const parent = {
      folderId: pendingNewEntry.folderId,
      path: pendingNewEntry.parentPath,
    };
    if (pendingNewEntry.kind === "file") {
      onCreateFile(parent, name);
    } else {
      onCreateDirectory(parent, name);
    }
    setPendingNewEntry(null);
  };

  const handleCommitRename = (entry: ExplorerEntry, name: string) => {
    onRename(entry, joinWorkspacePath(getParentPath(entry.path), name));
    setRenaming(null);
  };

  return (
    <>
      {isOpen && <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-30 bg-black/40 md:hidden" />}
      <nav
        aria-label={t("sidebar.label")}
        // Closed, the panel is only slid away or zero wide, so its controls would still take focus.
        inert={!isOpen}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && isOpen) {
            setIsSettledOpen(true);
          }
        }}
        // The panel's width animates open and closed while its content keeps the open width, so the
        // rows slide in with the edge instead of rewrapping on every frame.
        className={`bg-chrome text-text fixed top-11 bottom-0 left-0 z-40 flex w-[85vw] max-w-72 min-w-0 flex-none flex-col transition-[width,transform] duration-300 ease-(--ease-move) select-none motion-reduce:transition-none md:static md:z-auto md:max-w-none ${
          isOpen ? "translate-x-0 md:w-64" : "-translate-x-full md:w-0 md:translate-x-0"
        } ${isOpen && isSettledOpen ? "" : "overflow-hidden"}`}
      >
        <div className="flex min-h-0 w-full flex-1 flex-col md:w-64 md:min-w-64">
          {activities}
          {/* The title sits as far from the rail's glyphs as the last button's glyph sits from the frame. */}
          <div className="flex h-9 flex-none items-center justify-between gap-2 pr-3.5 pl-[7px]">
            <span className="text-text-muted min-w-0 truncate text-xs font-semibold">{t("common.explorer")}</span>
            <div className="flex flex-none items-center">
              <ExplorerActionButton label={t("sidebar.addFolder")} onClick={onAddFolder}>
                <i className="ic-folder-input" aria-hidden="true" />
              </ExplorerActionButton>
              <ExplorerActionButton label={t("sidebar.collapseAll")} onClick={handleCollapseAll}>
                <i className="ic-chevrons-down-up" aria-hidden="true" />
              </ExplorerActionButton>
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto pr-2 pb-2 pl-1"
            onContextMenu={(event) => {
              if (firstFolderId === undefined) {
                return;
              }
              event.preventDefault();
              setContextMenu({
                folderId: firstFolderId,
                path: "",
                kind: "directory",
                x: event.clientX,
                y: event.clientY,
              });
            }}
          >
            {isLoading ? (
              <LoadingIndicator />
            ) : (
              <div className="flex flex-col gap-px">
                {folders.map((folder) => (
                  <FolderRoot
                    key={folder.id}
                    folder={folder}
                    isCollapsed={collapsedFolderIds.has(folder.id)}
                    onToggle={() => handleToggleFolder(folder.id)}
                    onNewEntry={(path, kind) => handleNewEntry({ folderId: folder.id, path }, kind)}
                    onContextMenu={(path, kind, x, y) => setContextMenu({ folderId: folder.id, path, kind, x, y })}
                    onAllowAccess={() => onAllowAccess(folder.id)}
                    onLocate={folder.canLocate && onLocate ? () => onLocate(folder.id) : undefined}
                    onRemove={onRemoveFolder ? () => onRemoveFolder(folder.id) : undefined}
                    tree={{
                      activePath: activeFolderId === folder.id ? activePath : undefined,
                      isDirty: (path) => dirtyKeys.has(documentKey(folder.id, path)),
                      isExpanded: (path) => expandedKeys.has(documentKey(folder.id, path)),
                      onToggleCollapse: (path) => handleToggleCollapse(documentKey(folder.id, path)),
                      onSelectFile: (path) => handleSelectFile({ folderId: folder.id, path }),
                      onContextMenu: (path, kind, x, y) =>
                        setContextMenu({
                          folderId: folder.id,
                          path,
                          kind,
                          x,
                          y,
                        }),
                      onNewEntry: (path, kind) => handleNewEntry({ folderId: folder.id, path }, kind),
                      renamingPath: renaming?.folderId === folder.id ? renaming.path : null,
                      onCommitRename: (path, name) => handleCommitRename({ folderId: folder.id, path }, name),
                      onCancelRename: () => setRenaming(null),
                      pendingNewEntry: pendingNewEntry?.folderId === folder.id ? pendingNewEntry : null,
                      onCommitNewEntry: handleCommitNewEntry,
                      onCancelNewEntry: () => setPendingNewEntry(null),
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>

      {contextMenu && (
        <Menu
          label={t("sidebar.fileActions")}
          items={buildTreeMenu(contextMenu, {
            onOpen: handleSelectFile,
            onNewFile: (entry) => handleNewEntry(entry, "file"),
            onNewFolder: (entry) => handleNewEntry(entry, "directory"),
            onRename: setRenaming,
            onDelete,
            onCopyRelativePath,
            onCopyPath,
            onReveal,
            onRemoveFolder,
          })}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

function without(set: ReadonlySet<string>, value: string): ReadonlySet<string> {
  if (!set.has(value)) {
    return set;
  }
  const next = new Set(set);
  next.delete(value);
  return next;
}

interface TreeMenuActions {
  onOpen: (entry: ExplorerEntry) => void;
  onNewFile: (parent: ExplorerEntry) => void;
  onNewFolder: (parent: ExplorerEntry) => void;
  onRename: (entry: ExplorerEntry) => void;
  onDelete: (entry: ExplorerEntry) => void;
  onCopyRelativePath: (entry: ExplorerEntry) => void;
  onCopyPath?: (entry: ExplorerEntry) => void;
  onReveal?: (entry: ExplorerEntry) => void;
  onRemoveFolder?: (folderId: string) => void;
}

/**
 * Lists the actions for a tree entry: Open for a file, New File and New Folder for a folder or a
 * root row, then Rename and Delete, then the path actions: Copy Path and Reveal where the host has
 * them, and Copy Relative Path. A root row has no rename, delete, or relative path, and offers
 * Remove Folder from Workspace instead.
 */
function buildTreeMenu({ folderId, path, kind }: ContextMenuTarget, actions: TreeMenuActions): MenuEntry[] {
  const entry = { folderId, path };
  const isRoot = path === "";
  const { onCopyPath, onReveal, onRemoveFolder } = actions;
  const groups: MenuEntry[][] = [
    kind === "file"
      ? [
          {
            label: t("common.open"),
            icon: <i className="ic-file" aria-hidden="true" />,
            onSelect: () => actions.onOpen(entry),
          },
        ]
      : [
          {
            label: t("common.newFile"),
            icon: <i className="ic-file-plus" aria-hidden="true" />,
            onSelect: () => actions.onNewFile(entry),
          },
          {
            label: t("common.newFolder"),
            icon: <i className="ic-folder-plus" aria-hidden="true" />,
            onSelect: () => actions.onNewFolder(entry),
          },
        ],
    isRoot
      ? []
      : [
          {
            label: t("common.rename"),
            icon: <i className="ic-pencil" aria-hidden="true" />,
            onSelect: () => actions.onRename(entry),
          },
          {
            label: t("common.delete"),
            icon: <i className="ic-trash-2" aria-hidden="true" />,
            destructive: true,
            onSelect: () => actions.onDelete(entry),
          },
        ],
    [
      ...(onCopyPath
        ? [
            {
              label: t("common.copyPath"),
              icon: <i className="ic-clipboard" aria-hidden="true" />,
              onSelect: () => onCopyPath(entry),
            },
          ]
        : []),
      ...(isRoot
        ? []
        : [
            {
              label: t("common.copyRelativePath"),
              icon: <i className="ic-copy" aria-hidden="true" />,
              onSelect: () => actions.onCopyRelativePath(entry),
            },
          ]),
      ...(onReveal
        ? [
            {
              label: t("common.revealInFileExplorer"),
              icon: <i className="ic-folder-open" aria-hidden="true" />,
              onSelect: () => onReveal(entry),
            },
          ]
        : []),
    ],
    isRoot && onRemoveFolder
      ? [
          {
            label: t("sidebar.removeFolder"),
            icon: <i className="ic-folder-minus" aria-hidden="true" />,
            onSelect: () => onRemoveFolder(folderId),
          },
        ]
      : [],
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
    <Tooltip text={label} position="bottom" className="flex flex-none">
      {(bubbleId) => (
        <button
          type="button"
          aria-label={label}
          aria-describedby={bubbleId}
          onClick={onClick}
          className="icon-button size-7 text-base"
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
      <span className="visually-hidden">{t("sidebar.loading")}</span>
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
    <i className="ic-folder text-text-faint flex-none text-sm" aria-hidden="true" />
  ) : (
    <i className="ic-folder-open text-text-faint flex-none text-sm" aria-hidden="true" />
  );
}

/** How long a folder takes to open, in seconds. Closing takes two thirds of it. */
const FOLDER_OPEN_SECONDS = 0.2;
const FOLDER_CLOSE_SECONDS = 0.14;
const EASE_MOVE = [0.4, 0, 0.2, 1] as const;

/**
 * The rows inside an expanded folder. They unfold from the folder's row as it opens, pushing the rows
 * below down, and fold back into it as it closes; with reduced motion they appear and go at once.
 * Clipped only while moving, so focus rings and the last indent guide show once open.
 *
 * @param props - The folder's child rows.
 * @returns The rows, in a box that animates its height.
 */
function FolderChildren({ children }: { children: ReactNode }) {
  const isReduced = useReducedMotion();
  return (
    <motion.div
      initial={{ height: 0, opacity: 0, overflow: "hidden" }}
      animate={{
        height: "auto",
        opacity: 1,
        transition: {
          duration: isReduced ? 0 : FOLDER_OPEN_SECONDS,
          ease: EASE_MOVE,
        },
        transitionEnd: { overflow: "visible" },
      }}
      exit={{
        height: 0,
        opacity: 0,
        overflow: "hidden",
        transition: {
          duration: isReduced ? 0 : FOLDER_CLOSE_SECONDS,
          ease: EASE_MOVE,
        },
      }}
      className="relative flex flex-col gap-px"
    >
      {children}
    </motion.div>
  );
}

interface DisclosureChevronProps {
  /** Whether the directory is collapsed: the chevron points right, and turns down as it opens. */
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
    <span
      aria-hidden="true"
      className={`text-text-faint flex flex-none items-center transition-transform duration-150 ease-(--ease-move) motion-reduce:transition-none ${isCollapsed ? "" : "rotate-90"}`}
    >
      <i className="ic-chevron-right text-xs" aria-hidden="true" />
    </span>
  );
}

/** What every row of one folder's tree needs, with paths relative to that folder. */
interface FolderTree {
  activePath?: string;
  isDirty: (path: string) => boolean;
  isExpanded: (path: string) => boolean;
  onToggleCollapse: (path: string) => void;
  onSelectFile: (path: string) => void;
  onContextMenu: (path: string, kind: "file" | "directory", x: number, y: number) => void;
  onNewEntry: (parentPath: string, kind: "file" | "directory") => void;
  renamingPath: string | null;
  onCommitRename: (path: string, name: string) => void;
  onCancelRename: () => void;
  pendingNewEntry: PendingNewEntry | null;
  onCommitNewEntry: (name: string) => void;
  onCancelNewEntry: () => void;
}

interface FolderRootProps {
  folder: ExplorerFolder;
  isCollapsed: boolean;
  onToggle: () => void;
  onNewEntry: (parentPath: string, kind: "file" | "directory") => void;
  onContextMenu: (path: string, kind: "file" | "directory", x: number, y: number) => void;
  onAllowAccess: () => void;
  onLocate?: () => void;
  onRemove?: () => void;
  tree: FolderTree;
}

/**
 * A workspace folder's root row and, when expanded, its tree. A folder Vista can't reach says why
 * and offers the way out instead.
 *
 * @param props - FolderRoot properties.
 * @returns Root row element.
 */
function FolderRoot({
  folder,
  isCollapsed,
  onToggle,
  onNewEntry,
  onContextMenu,
  onAllowAccess,
  onLocate,
  onRemove,
  tree,
}: FolderRootProps) {
  const isReady = folder.status === "ready";
  const showPendingEntry = tree.pendingNewEntry?.parentPath === "";
  return (
    <div className="flex flex-col gap-px">
      <div className="group relative">
        <button
          type="button"
          aria-expanded={!isCollapsed}
          onClick={onToggle}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isReady) {
              onContextMenu("", "directory", event.clientX, event.clientY);
            }
          }}
          style={{ paddingLeft: TREE_ROW_INSET_PX }}
          className={`${TREE_ROW_CLASS} ${TREE_ROW_IDLE_CLASS} text-text-strong! font-semibold`}
        >
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className="truncate">{folder.name}</span>
            {folder.location && (
              <span className="text-text-faint min-w-0 truncate text-xs font-normal">{folder.location}</span>
            )}
          </span>
          <DisclosureChevron isCollapsed={isCollapsed} />
        </button>
        {isReady && <FolderRowActions onNewEntry={(kind) => onNewEntry("", kind)} />}
      </div>
      {!isCollapsed &&
        (folder.status === "ready" ? (
          <div className="flex flex-col gap-px">
            {showPendingEntry && tree.pendingNewEntry && (
              <TreeEntryNameInput
                level={0}
                initialValue=""
                icon={<EntryIcon kind={tree.pendingNewEntry.kind} isCollapsed />}
                siblingNames={folder.tree.map((node) => node.name)}
                onCommit={tree.onCommitNewEntry}
                onCancel={tree.onCancelNewEntry}
              />
            )}
            {folder.tree.map((node) => (
              <TreeNode key={node.id} node={node} siblings={folder.tree} level={0} tree={tree} />
            ))}
          </div>
        ) : (
          <UnreachableFolder
            status={folder.status}
            onAllowAccess={onAllowAccess}
            onLocate={onLocate}
            onRemove={onRemove}
          />
        ))}
    </div>
  );
}

interface UnreachableFolderProps {
  status: "needs-permission" | "unavailable";
  onAllowAccess: () => void;
  onLocate?: () => void;
  onRemove?: () => void;
}

/**
 * Says why a workspace folder's files aren't listed, with the one action that helps.
 *
 * @param props - UnreachableFolder properties.
 * @returns Notice element.
 */
function UnreachableFolder({ status, onAllowAccess, onLocate, onRemove }: UnreachableFolderProps) {
  return (
    <div className="flex flex-col items-start gap-1.5 py-1 pr-2" style={{ paddingLeft: TREE_ROW_INSET_PX }}>
      <p className="text-text-secondary text-xs">
        {status === "needs-permission" ? t("sidebar.needsPermission") : t("sidebar.unavailable")}
      </p>
      {status === "needs-permission" ? (
        <button type="button" onClick={onAllowAccess} className="btn sm">
          {t("sidebar.allowAccess")}
        </button>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {onLocate && (
            <button type="button" onClick={onLocate} className="btn sm">
              {t("sidebar.locate")}
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} className="btn sm">
              {t("sidebar.removeFolder")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface FolderRowActionsProps {
  onNewEntry: (kind: "file" | "directory") => void;
}

/**
 * The New File and New Folder buttons of a folder row, shown while the row is hovered or focused.
 *
 * @param props - FolderRowActions properties.
 * @returns Button group element.
 */
function FolderRowActions({ onNewEntry }: FolderRowActionsProps) {
  return (
    <div className={ROW_ACTIONS_CLASS}>
      <ExplorerActionButton label={t("common.newFile")} onClick={() => onNewEntry("file")}>
        <i className="ic-file-plus" aria-hidden="true" />
      </ExplorerActionButton>
      <ExplorerActionButton label={t("common.newFolder")} onClick={() => onNewEntry("directory")}>
        <i className="ic-folder-plus" aria-hidden="true" />
      </ExplorerActionButton>
    </div>
  );
}

interface TreeNodeProps {
  node: WorkspaceNode;
  /** All sibling nodes at this level, including node itself, for rename collision checks. */
  siblings: WorkspaceNode[];
  level: number;
  tree: FolderTree;
}

/**
 * Recursive tree row for a file or directory, including its inline rename input, pending
 * new-entry input, and the indent guide that connects an expanded directory to its children.
 *
 * @param props - TreeNode properties.
 * @returns Tree row element.
 */
function TreeNode({ node, siblings, level, tree }: TreeNodeProps) {
  const { activePath, pendingNewEntry } = tree;
  const siblingNames = siblings.filter((sibling) => sibling.path !== node.path).map((sibling) => sibling.name);
  const rowPaddingLeft = level * TREE_INDENT_PX + TREE_ROW_INSET_PX;

  if (tree.renamingPath === node.path) {
    return (
      <TreeEntryNameInput
        level={level}
        initialValue={node.name}
        icon={<EntryIcon kind={node.kind} extension={node.extension} isCollapsed={!tree.isExpanded(node.path)} />}
        siblingNames={siblingNames}
        onCommit={(name) => tree.onCommitRename(node.path, name)}
        onCancel={tree.onCancelRename}
      />
    );
  }

  if (node.kind === "directory") {
    const children = node.children ?? [];
    const isCollapsed = !tree.isExpanded(node.path);
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
        <div className="group relative">
          <button
            type="button"
            aria-expanded={!isCollapsed}
            onClick={() => tree.onToggleCollapse(node.path)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              tree.onContextMenu(node.path, "directory", event.clientX, event.clientY);
            }}
            style={{ paddingLeft: rowPaddingLeft }}
            // The title is also the button's accessible description, so the hint is announced once.
            title={node.isUnreadable ? t("sidebar.unreadableFolder") : undefined}
            className={`${TREE_ROW_CLASS} ${TREE_ROW_IDLE_CLASS}`}
          >
            <EntryIcon kind="directory" isCollapsed={isCollapsed} />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {node.isUnreadable && (
              <i className="ic-circle-alert text-text-secondary flex-none text-xs" aria-hidden="true" />
            )}
            <DisclosureChevron isCollapsed={isCollapsed} />
          </button>
          {!node.isUnreadable && <FolderRowActions onNewEntry={(kind) => tree.onNewEntry(node.path, kind)} />}
        </div>
        <AnimatePresence initial={false}>
          {showChildren && (
            <FolderChildren key="children">
              {showPendingEntry && (
                <div className="relative">
                  {renderGuide(children.length === 0)}
                  <TreeEntryNameInput
                    level={level + 1}
                    initialValue=""
                    icon={<EntryIcon kind={pendingNewEntry.kind} isCollapsed />}
                    siblingNames={children.map((child) => child.name)}
                    onCommit={tree.onCommitNewEntry}
                    onCancel={tree.onCancelNewEntry}
                  />
                </div>
              )}
              {children.map((child, index) => (
                <div key={child.id} className="relative flex flex-col gap-px">
                  {renderGuide(index === children.length - 1)}
                  <TreeNode node={child} siblings={children} level={level + 1} tree={tree} />
                </div>
              ))}
            </FolderChildren>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const isActive = activePath === node.path;

  return (
    <button
      type="button"
      onClick={() => tree.onSelectFile(node.path)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        tree.onContextMenu(node.path, "file", event.clientX, event.clientY);
      }}
      style={{ paddingLeft: rowPaddingLeft }}
      className={`${TREE_ROW_CLASS} ${isActive ? TREE_ROW_ACTIVE_CLASS : TREE_ROW_IDLE_CLASS}`}
    >
      <EntryIcon kind="file" extension={node.extension} />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      {tree.isDirty(node.path) && (
        <>
          <span aria-hidden="true" className="bg-text-muted size-1.5 flex-none rounded-full" />
          <span className="visually-hidden"> {t("tabs.unsaved")}</span>
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
 * Returns the folder-relative path of the directory that contains `path`.
 *
 * @param path - Folder-relative path of a file or directory.
 * @returns The parent directory path, or an empty string for entries at the folder's root.
 */
function getParentPath(path: string): string {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex === -1 ? "" : path.slice(0, separatorIndex);
}
