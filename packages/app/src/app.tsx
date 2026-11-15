import { addCursorAbove, addCursorBelow, selectLine } from "@codemirror/commands";
import { selectNextOccurrence, selectSelectionMatches } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { version as APP_VERSION } from "../package.json";
import { runCommand, sortByCategory, useCommandShortcuts, type Command } from "./commands";
import { findCodeMirrorView, runEditingAction, type EditingAction } from "./commands/editing";
import { DocumentActions } from "./components/editor/document-actions";
import { EditorPane, type FindRequest } from "./components/editor/editor-pane";
import type { FindMode } from "./components/editor/find-bar";
import type { CursorInfo, EditorPosition, RawEditorStateCache } from "./components/editor/raw-editor";
import { ToastProvider, useToast } from "./components/feedback/toast";
import { UnsavedChangesDialog, type UnsavedChangesChoice } from "./components/feedback/unsaved-changes-dialog";
import { ActivityRail, DrawerActivities } from "./components/layout/activity-rail";
import { ShellReveal } from "./components/layout/shell-reveal";
import { Sidebar, type ExplorerEntry, type ExplorerFolder, type NewEntryRequest } from "./components/layout/sidebar";
import { StartScreen, type StartAction } from "./components/layout/start-screen";
import { StatusBar } from "./components/layout/status-bar";
import { TabStrip } from "./components/layout/tab-strip";
import { TitleBar } from "./components/layout/title-bar";
import { commandMenuEntries } from "./components/menu/command-menu";
import { MENU_SEPARATOR } from "./components/menu/menu";
import {
  COMMAND_QUERY_PREFIX,
  GoToDialog,
  type GoToFile,
  type GoToRequest,
  type PaletteCommand,
} from "./components/navigation/go-to-dialog";
import { SettingsDialog, type SettingsSection } from "./components/settings/settings-dialog";
import { WorkspaceSettingsDialog } from "./components/workspace/workspace-settings-dialog";
import { WorkspaceSwitcher, type FolderStatus, type RecentWorkspace } from "./components/workspace/workspace-switcher";
import { documentLocation } from "./domain/document-location";
import { imageMimeType, resolveImageSource } from "./domain/image-source";
import { joinWorkspacePath } from "./domain/path-validation";
import { BYTES_PER_MB, type EditorSettings } from "./domain/settings";
import { decodeText, encodeText } from "./domain/text-codec";
import { getViewer } from "./domain/viewers";
import { isDesktopViewport } from "./domain/viewport";
import {
  HOME_FOLDER_LOCATION,
  parseWorkspaceFile,
  serializeWorkspaceFile,
  WORKSPACE_FILE_DIRECTORY,
  WORKSPACE_FILE_PATH,
  type Session,
  type WorkspaceColor,
  type WorkspaceFileRead,
  type WorkspaceIcon,
  type WorkspaceRecord,
  type WorkspaceStorage,
} from "./domain/workspaces";
import {
  LEGACY_FOLDER_ID,
  WorkspaceError,
  type AppAdapter,
  type FileStat,
  type RestoreFolderResult,
  type ViewMode,
  type WorkspaceFolder,
  type WorkspaceNode,
} from "./ports";
import {
  documentKey,
  documentsReducer,
  findAffectedDocuments,
  getActiveDocument,
  INITIAL_DOCUMENTS_STATE,
  isSameStat,
  type DocumentsState,
  type FolderEntryRef,
  type OpenDocument,
  type RestoredTab,
} from "./state/documents";
import { loadFile } from "./state/load-file";
import { useSettings } from "./state/settings";
import { browserStorage, checkFolderOverlap, createWorkspaceStore, type WorkspaceDetails } from "./state/workspaces";
import { useTheme } from "./theme/theme-manager";

interface AppProps {
  /** Capabilities and platform information supplied by a Vista host. */
  adapter: AppAdapter;
}

/** A pending request to resolve unsaved changes, held until the user answers the dialog. */
interface UnsavedChangesRequest {
  /** Names of the documents the prompt is about. */
  fileNames: string[];
  /** Settles the waiting operation with the user's decision. */
  resolve: (choice: UnsavedChangesChoice) => void;
}

/** A folder of the open workspace: reachable with its tree, or a reason it isn't. */
interface OpenFolder {
  id: string;
  name: string;
  /** Null unless `status` is "ready". */
  folder: WorkspaceFolder | null;
  status: ExplorerFolder["status"];
  tree: WorkspaceNode[];
  /** Where the folder is from the home folder, set while the workspace's details live in its folder. */
  location?: string;
}

interface OpenWorkspace {
  id: string;
  name: string;
  icon: WorkspaceIcon;
  color: WorkspaceColor;
  storage: WorkspaceStorage;
  folders: OpenFolder[];
}

const GO_TO_FILE_SHORTCUT = "Mod+P";
const COMMANDS_SHORTCUT = "Mod+Shift+P";

const EDITOR_MENU = ["edit.cut", "edit.copy", "edit.paste", "selection.all", MENU_SEPARATOR, "find.find"];
const RAW_EDITOR_MENU = [...EDITOR_MENU, "find.replace", "goto.line"];

/**
 * Renders the shared Vista application for a platform host.
 *
 * @param props - Shared application properties, including the host adapter.
 * @returns Shared application UI configured for the supplied platform.
 */
export function App({ adapter }: AppProps) {
  return (
    <ToastProvider>
      <AppShell adapter={adapter} />
    </ToastProvider>
  );
}

/**
 * Hosts the Vista application shell's state and behavior, nested under `ToastProvider`
 * so it can surface user-visible errors for workspace and document operations.
 *
 * @param props - Shared application properties, including the host adapter.
 * @returns Shared application UI configured for the supplied platform.
 */
function AppShell({ adapter }: AppProps) {
  const theme = useTheme();
  const toast = useToast();
  const [workspace, setWorkspace] = useState<OpenWorkspace | null>(null);
  // `documentKey`s of the expanded folders inside the workspace's folders.
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [documentsState, dispatchDocuments] = useReducer(documentsReducer, INITIAL_DOCUMENTS_STATE);
  // Starts true when restore will run, so the explorer never flashes its "Open Folder" state.
  const [isLoading, setIsLoading] = useState(adapter.workspace.isSupported);
  // Defaults to open at `md` and above (a persistent column there) and closed below it (a
  // transient overlay drawer), matching the breakpoint Sidebar itself switches behavior at.
  const [isSidebarOpen, setIsSidebarOpen] = useState(isDesktopViewport);
  // The folders of each workspace other than the open one, as last seen, by workspace id.
  const [recentFolders, setRecentFolders] = useState<ReadonlyMap<string, RecentWorkspace["folders"]>>(() => new Map());
  const [workspaceStore] = useState(() =>
    createWorkspaceStore(browserStorage, { now: Date.now, newId: () => crypto.randomUUID() }),
  );
  const [unsavedRequest, setUnsavedRequest] = useState<UnsavedChangesRequest | null>(null);
  // Tagged with its tab so a position from another tab is never shown.
  const [cursor, setCursor] = useState<{ key: string; position: CursorInfo } | null>(null);
  const [vimMode, setVimMode] = useState<{ key: string; mode: string | null } | null>(null);
  const [settings, updateSettings] = useSettings();
  const [find, setFind] = useState<FindRequest | null>(null);
  // The text the go-to picker opens with, or null while it is closed.
  const [goToQuery, setGoToQuery] = useState<string | null>(null);
  // A go-to target waiting for its tab's raw editor to show.
  const [pendingJump, setPendingJump] = useState<{ key: string; position: EditorPosition } | null>(null);
  // A File menu request to name a new entry at the workspace root.
  const [newEntryRequest, setNewEntryRequest] = useState<NewEntryRequest | null>(null);
  // Settings, open on one of its sections, or Workspace Settings.
  const [openDialog, setOpenDialog] = useState<SettingsSection | "workspace" | null>(null);
  // Raw editor state of each open tab: selection, scroll position, and undo history.
  const rawEditorStatesRef = useRef<RawEditorStateCache>(new Map());
  // Holds the startup restore so StrictMode's second effect run reuses it instead of restoring
  // twice. Restoring twice would matter because a second attempt can see the folder as forgotten.
  const startupRestoreRef = useRef<Promise<void> | null>(null);
  // Async flows such as save-then-close read the buffers as they are when each step runs, not as
  // they were when the flow started.
  const documentsRef = useRef(documentsState);
  documentsRef.current = documentsState;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  // Set while the open workspace's session is being restored, so it isn't saved over before then.
  const sessionRestoreRef = useRef<object | null>(null);
  // The session last written, with its workspace, so an unchanged session isn't written again.
  const savedSessionRef = useRef<string | null>(null);

  // A folder that is open now, by id; null when it isn't reachable or isn't part of the workspace.
  const readyFolder = useCallback(
    (folderId: string): WorkspaceFolder | null =>
      workspaceRef.current?.folders.find((candidate) => candidate.id === folderId)?.folder ?? null,
    [],
  );
  // Whether a folder an async step started with is still open; hosts may reuse ids, so compare identity.
  const isStillOpen = useCallback(
    (folder: WorkspaceFolder) =>
      workspaceRef.current?.folders.some((candidate) => candidate.folder === folder) ?? false,
    [],
  );
  const setFolderTree = useCallback((folder: WorkspaceFolder, tree: WorkspaceNode[]) => {
    setWorkspace((previous) =>
      previous
        ? {
            ...previous,
            folders: previous.folders.map((entry) => (entry.folder === folder ? { ...entry, tree } : entry)),
          }
        : previous,
    );
  }, []);

  const activeDocument = getActiveDocument(documentsState);
  // Closing the last tab closes the find bar, so opening a file later does not bring it back unasked.
  if (activeDocument === null && find !== null) {
    setFind(null);
  }

  useEffect(() => {
    const openKeys = new Set(documentsState.documents.map((doc) => doc.key));
    for (const key of rawEditorStatesRef.current.keys()) {
      if (!openKeys.has(key)) {
        rawEditorStatesRef.current.delete(key);
      }
    }
  }, [documentsState.documents]);
  const activeDocumentKey = activeDocument?.key ?? null;
  // The active tab once its file is read; a restored tab has no content to show before.
  const shownDocument = activeDocument?.isPending ? null : activeDocument;
  const locateDocument = useCallback(
    (doc: { folderId: string; path: string }) => {
      const entry = workspace?.folders.find((candidate) => candidate.id === doc.folderId);
      return entry?.folder
        ? documentLocation(
            { rootPath: entry.folder.rootPath, name: entry.name },
            doc.path,
            adapter.platform === "native",
          )
        : null;
    },
    [adapter.platform, workspace],
  );
  const activeLocation = useMemo(
    () => (shownDocument ? locateDocument(shownDocument) : null),
    [locateDocument, shownDocument],
  );
  const hasDirtyDocuments = documentsState.documents.some((doc) => doc.isDirty);
  const isPromptingForUnsavedChanges = unsavedRequest !== null;
  const isPromptingRef = useRef(isPromptingForUnsavedChanges);
  isPromptingRef.current = isPromptingForUnsavedChanges;

  const saveDocument = useCallback(
    async (key: string): Promise<boolean> => {
      const doc = documentsRef.current.documents.find((candidate) => candidate.key === key);
      const target = doc ? readyFolder(doc.folderId) : null;
      if (!doc || !target) {
        return false;
      }
      const bytes = encodeText(doc.content, doc.hasBom);
      try {
        let stat: FileStat;
        try {
          stat = await adapter.workspace.writeFile(target, doc.path, bytes, { expected: doc.diskStat });
        } catch (err) {
          if (!(err instanceof WorkspaceError && err.kind === "conflict")) {
            throw err;
          }
          const overwrite = await toast.confirm({
            title: `"${doc.name}" changed on disk`,
            message:
              "Another program changed or deleted this file after Vista read it. Overwrite it with your version?",
            confirmLabel: "Overwrite",
            destructive: true,
          });
          if (!overwrite) {
            return false;
          }
          stat = await adapter.workspace.writeFile(target, doc.path, bytes);
        }
        dispatchDocuments({ type: "saved", key, content: doc.content, stat });
        return true;
      } catch (err) {
        console.error("Failed to save file:", err);
        const message = err instanceof Error ? err.message : `Failed to save ${doc.name}.`;
        toast.show({ kind: "error", text: message });
        return false;
      }
    },
    [adapter.workspace, readyFolder, toast],
  );

  /**
   * Asks the user what to do with unsaved edits before documents close or the workspace changes.
   * Saving stays manual, so the only automatic write is the one the user chose. The prompt repeats
   * for edits made after the user answered, such as typing while a save is in flight, so the
   * caller never closes a buffer the user has not seen.
   *
   * @param keys - Documents about to be closed; clean ones are not mentioned.
   * @param alreadyApproved - Buffer contents the user already saved or chose to discard.
   * @returns The approved buffer contents, to pass back when closing later, or `null` if the user
   *   cancelled or a save failed.
   */
  const confirmUnsavedChanges = useCallback(
    async function confirm(
      keys: readonly string[],
      alreadyApproved: ApprovedEdits = NO_APPROVED_EDITS,
    ): Promise<ApprovedEdits | null> {
      const pendingDocuments = documentsRef.current.documents.filter(
        (doc) => doc.isDirty && keys.includes(doc.key) && alreadyApproved.get(doc.key) !== doc.content,
      );
      if (pendingDocuments.length === 0) {
        return alreadyApproved;
      }
      const choice = await new Promise<UnsavedChangesChoice>((resolve) => {
        setUnsavedRequest({
          fileNames: describeUnsavedDocuments(pendingDocuments, workspaceRef.current?.folders ?? []),
          resolve,
        });
      });
      if (choice === "cancel") {
        return null;
      }
      if (choice === "save") {
        const results = await Promise.all(pendingDocuments.map((doc) => saveDocument(doc.key)));
        if (!results.every(Boolean)) {
          return null;
        }
      }
      const approved = new Map(alreadyApproved);
      for (const doc of pendingDocuments) {
        approved.set(doc.key, doc.content);
      }
      // Edits made while the prompt or the save was pending need their own answer.
      return confirm(keys, approved);
    },
    [saveDocument],
  );

  const confirmUnsavedChangesInAllDocuments = useCallback(
    (alreadyApproved?: ApprovedEdits) =>
      confirmUnsavedChanges(
        documentsRef.current.documents.map((doc) => doc.key),
        alreadyApproved,
      ),
    [confirmUnsavedChanges],
  );

  const closeDocuments = useCallback(
    async (keys: readonly string[]) => {
      if (!(await confirmUnsavedChanges(keys))) {
        return false;
      }
      dispatchDocuments({ type: "close", keys: [...keys] });
      return true;
    },
    [confirmUnsavedChanges],
  );

  const handleUnsavedChoice = useCallback(
    (choice: UnsavedChangesChoice) => {
      if (!unsavedRequest) {
        return;
      }
      setUnsavedRequest(null);
      unsavedRequest.resolve(choice);
    },
    [unsavedRequest],
  );

  // Browsers only show their leave-page prompt while there is something to lose, so the listener
  // is attached only while some document has unsaved edits.
  useEffect(() => {
    if (!hasDirtyDocuments) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDirtyDocuments]);

  // A desktop window closes without `beforeunload`, so the host asks before it closes instead.
  useEffect(
    () =>
      adapter.window?.onCloseRequested(async () => {
        // A second prompt over a pending one would leave the first flow waiting forever.
        if (isPromptingRef.current) {
          return false;
        }
        return (await confirmUnsavedChangesInAllDocuments()) !== null;
      }),
    [adapter.window, confirmUnsavedChangesInAllDocuments],
  );

  const confirmUnsavedChangesRef = useRef(confirmUnsavedChangesInAllDocuments);
  confirmUnsavedChangesRef.current = confirmUnsavedChangesInAllDocuments;

  /**
   * Asks the updater for a newer version and offers to install it. At startup the check is quiet:
   * being offline is not something to interrupt the user about. Asked for from About, it says
   * what it found.
   */
  const checkForUpdates = useCallback(
    async ({ isRequested, isCancelled = () => false }: { isRequested: boolean; isCancelled?: () => boolean }) => {
      const updater = adapter.updater;
      if (!updater) {
        return;
      }
      let update;
      try {
        update = await updater.check();
      } catch (err) {
        console.warn("Could not check for updates:", err);
        if (isRequested) {
          toast.show({ kind: "error", text: "Couldn't check for updates. Check your connection and try again." });
        }
        return;
      }
      if (isCancelled()) {
        return;
      }
      if (!update) {
        if (isRequested) {
          toast.show({ kind: "info", text: "Vista is up to date." });
        }
        return;
      }
      const accepted = await toast.confirm({
        title: `Vista ${update.version} is available`,
        message: "Install it now? Vista restarts to finish, and asks about unsaved changes first.",
        confirmLabel: "Install and Restart",
        cancelLabel: "Later",
      });
      // A prompt already open belongs to another flow; replacing it would leave that flow waiting forever.
      if (!accepted || isCancelled() || isPromptingRef.current || (await confirmUnsavedChangesRef.current()) === null) {
        return;
      }
      toast.show({ kind: "info", text: `Downloading Vista ${update.version}. Vista restarts when it's installed.` });
      try {
        await update.install();
      } catch (err) {
        console.error("Failed to install the update:", err);
        toast.show({
          kind: "error",
          text: `Couldn't install Vista ${update.version}. Vista will offer it again the next time it starts.`,
        });
      }
    },
    [adapter.updater, toast],
  );

  // Checked once per launch.
  useEffect(() => {
    let isCancelled = false;
    void checkForUpdates({ isRequested: false, isCancelled: () => isCancelled });
    return () => {
      isCancelled = true;
    };
  }, [checkForUpdates]);

  /**
   * Reopens a session's tabs as tabs that read their file when first shown. Each file is checked
   * first, and the tabs whose file no longer exists are dropped with one notice.
   *
   * @param restore - The token of this restore in `sessionRestoreRef`.
   */
  const restoreSessionTabs = useCallback(
    async (opened: OpenWorkspace, session: Session, restore: object) => {
      const checked = await Promise.all(
        session.tabs.map(async (tab): Promise<{ tab: RestoredTab; isGone: boolean } | null> => {
          const folder = opened.folders.find((entry) => entry.id === tab.folderId)?.folder;
          // A folder Vista can't reach says why on its row; its tabs aren't reopened.
          if (!folder) {
            return null;
          }
          try {
            return { tab, isGone: (await adapter.workspace.stat(folder, tab.path)) === null };
          } catch (err) {
            // Kept: reading it when it is shown reports the problem.
            console.error("Failed to check a file from the last session:", err);
            return { tab, isGone: false };
          }
        }),
      );
      // Another workspace opened during the checks.
      if (sessionRestoreRef.current !== restore) {
        return;
      }
      sessionRestoreRef.current = null;
      const activeTab = session.tabs[session.activeIndex];
      const kept = checked.flatMap((entry) => (entry && !entry.isGone ? [entry.tab] : []));
      const gone = checked.flatMap((entry) => (entry?.isGone ? [entry.tab] : []));
      dispatchDocuments({
        type: "restore",
        tabs: kept,
        activeIndex: findRestoredActiveIndex(session.tabs, kept, activeTab),
      });
      if (gone.length > 0) {
        toast.show({ kind: "info", text: describeGoneSessionFiles(gone) });
      }
    },
    [adapter.workspace, toast],
  );

  /**
   * Makes a workspace the open one, closing the previous one's tabs after asking about their unsaved
   * edits. The folders' trees are read before, so a failed read leaves the previous state intact.
   *
   * @param open - Called once the user has answered about unsaved edits; marks the workspace opened
   *   in the store and returns it with its folders.
   * @param approvedEdits - Unsaved edits the user already agreed to lose or saved before the
   *   folders were read. Edits made meanwhile are asked about again.
   * @returns Whether the workspace opened; false when the user kept their unsaved edits instead.
   */
  const adoptWorkspace = useCallback(
    async (open: () => OpenWorkspace, approvedEdits?: ApprovedEdits): Promise<boolean> => {
      if (!(await confirmUnsavedChangesInAllDocuments(approvedEdits))) {
        return false;
      }
      const opened = open();
      const previous = workspaceRef.current;
      if (previous) {
        setRecentFolders((known) => new Map(known).set(previous.id, summarizeFolders(previous.folders)));
      }
      const session = workspaceStore.loadSession(opened.id);
      const restore = {};
      sessionRestoreRef.current = restore;
      setWorkspace(opened);
      setExpandedKeys(toExpandedKeys(opened, session));
      dispatchDocuments({ type: "close", keys: documentsRef.current.documents.map((doc) => doc.key) });
      void restoreSessionTabs(opened, session, restore);
      if (opened.folders.some((entry) => entry.folder?.accessMode === "fallback")) {
        toast.show({
          kind: "info",
          text: "This browser can't write files directly, so saving will download a copy instead.",
        });
      }
      return true;
    },
    [confirmUnsavedChangesInAllDocuments, restoreSessionTabs, toast, workspaceStore],
  );

  /** A folder as its root row shows it, reading its tree when the host restored it. */
  const toOpenFolder = useCallback(
    async (id: string, result: RestoreFolderResult): Promise<OpenFolder> => {
      switch (result.status) {
        case "restored":
          try {
            const tree = await adapter.workspace.readTree(result.folder);
            return { id, name: result.folder.name, folder: result.folder, status: "ready", tree };
          } catch (err) {
            console.error("Failed to read a folder:", err);
            const message = err instanceof Error ? err.message : `Failed to read "${result.folder.name}".`;
            toast.show({ kind: "error", text: message });
            return { id, name: result.folder.name, folder: null, status: "unavailable", tree: [] };
          }
        case "needs-permission":
        case "unavailable":
          return { id, name: result.name, folder: null, status: result.status, tree: [] };
        case "none":
          // The host lost what it remembered, so it has no name to show either.
          return { id, name: UNKNOWN_FOLDER_NAME, folder: null, status: "unavailable", tree: [] };
      }
    },
    [adapter.workspace, toast],
  );

  /**
   * Opens a stored workspace by restoring each of its folders. At startup (`interactive` false) it
   * opens only when no folder needs permission, so the start screen can offer to ask for it; asked
   * by the user, it opens with whichever folders are reachable, and the others say why on their rows.
   *
   * @param record - The stored workspace.
   * @param options.restored - Folders already restored, by id, so they are not restored twice.
   * @returns Whether the workspace opened.
   */
  // The file text last written or being written for the open workspace, so a change rewrites it once.
  const writtenFileRef = useRef<string | null>(null);
  const fileWriteRef = useRef<Promise<void>>(Promise.resolve());
  const readWorkspaceFile = useCallback(
    async (home: WorkspaceFolder): Promise<WorkspaceFileRead | { status: "missing" }> => {
      const stat = await adapter.workspace.stat(home, WORKSPACE_FILE_PATH);
      if (!stat) {
        return { status: "missing" };
      }
      // A workspace file is a few hundred bytes; one past the open limit is not one Vista wrote.
      if (stat.size > settings.files.maxOpenSizeMb * BYTES_PER_MB) {
        return { status: "unreadable" };
      }
      const decoded = decodeText((await adapter.workspace.readFile(home, WORKSPACE_FILE_PATH)).bytes);
      return "text" in decoded ? parseWorkspaceFile(decoded.text, home.name) : { status: "unreadable" };
    },
    [adapter.workspace, settings.files.maxOpenSizeMb],
  );

  /** Opens a folder as the one-folder workspace on the device that is exactly it. */
  const openPlainFolder = useCallback(
    async (folder: WorkspaceFolder, approvedEdits?: ApprovedEdits) => {
      const tree = await adapter.workspace.readTree(folder);
      const entry: OpenFolder = { id: folder.id, name: folder.name, folder, status: "ready", tree };
      return adoptWorkspace(() => withLocations(workspaceStore.openFolder(folder), [entry]), approvedEdits);
    },
    [adapter.workspace, adoptWorkspace, workspaceStore],
  );

  /**
   * Opens a stored workspace by restoring each of its folders. At startup (`interactive` false) it
   * opens only when no folder needs permission, so the start screen can offer to ask for it; asked
   * by the user, it opens with whichever folders are reachable, and the others say why on their rows.
   * A workspace stored in its folder takes its details and folders from its file, as it is now.
   *
   * @param record - The stored workspace.
   * @param options.restored - Folders already restored, by id, so they are not restored twice.
   * @returns Whether the workspace opened.
   */
  const openStoredWorkspace = useCallback(
    async (
      record: WorkspaceRecord,
      {
        interactive,
        approvedEdits,
        restored,
      }: { interactive: boolean; approvedEdits?: ApprovedEdits; restored?: ReadonlyMap<string, RestoreFolderResult> },
    ): Promise<boolean> => {
      const restore = async (id: string) =>
        restored?.get(id) ?? (await adapter.workspace.restoreFolder(id, { interactive }));
      const homeId = record.folderIds[0]!;
      const homeResult = await restore(homeId);
      let target = record;
      let slots: FolderSlot[] | null = null;
      let readText: string | null = null;
      if (record.storage === "folder" && homeResult.status === "restored") {
        const home = homeResult.folder;
        const read = await readWorkspaceFile(home);
        if (read.status === "unreadable") {
          toast.show({ kind: "info", text: describeUnreadableFile(home.name) });
          return openPlainFolder(home, approvedEdits);
        }
        if (read.status === "missing") {
          target = workspaceStore.storeOnDevice(record.id) ?? record;
          toast.show({
            kind: "info",
            text: `"${home.name}/${WORKSPACE_FILE_PATH}" is gone, so the workspace's details are kept on this device now.`,
          });
        } else {
          slots = [{ kind: "folder", id: homeId, result: homeResult }];
          const located: Record<string, string> = {};
          for (const location of read.details.folders.slice(1)) {
            // Asked one at a time, so each permission prompt follows the one before it.
            // oxlint-disable-next-line eslint/no-await-in-loop -- a workspace has few folders
            const found = await findLocatedFolder(home, location, record.locations[location], {
              restore,
              resolveRelative: adapter.workspace.resolveRelative?.bind(adapter.workspace),
            });
            if (found) {
              located[location] = found.id;
              slots.push({ kind: "folder", id: found.id, result: found.result, location });
            } else {
              slots.push({ kind: "missing", location });
            }
          }
          target = workspaceStore.applyWorkspaceFile(record.id, read.details, located) ?? record;
          readText = serializeWorkspaceFile(read.details);
        }
      }
      if (!slots) {
        slots = [{ kind: "folder", id: homeId, result: homeResult }];
        for (const id of target.folderIds.slice(1)) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- a workspace has few folders
          slots.push({ kind: "folder", id, result: await restore(id) });
        }
      }
      const results = slots.flatMap((slot): [string, RestoreFolderResult][] =>
        slot.kind === "folder" ? [[slot.id, slot.result]] : [],
      );
      setRecentFolders((known) => new Map(known).set(record.id, summarizeRestored(results)));
      const isWaiting = results.some(([, result]) => result.status === "needs-permission");
      if (!results.some(([, result]) => result.status === "restored") || (!interactive && isWaiting)) {
        const gone = results.flatMap(([, result]) => (result.status === "unavailable" ? [result.name] : []));
        if (!isWaiting && gone.length > 0) {
          toast.show({ kind: "info", text: describeUnreachableWorkspace(target, gone) });
        }
        return false;
      }
      const folders = await Promise.all(
        slots.map(async (slot) => {
          if (slot.kind === "missing") {
            return missingFolder(slot.location);
          }
          const entry = await toOpenFolder(slot.id, slot.result);
          return slot.location === undefined ? entry : { ...entry, location: slot.location };
        }),
      );
      const opened = withLocations(target, folders);
      const wasAdopted = await adoptWorkspace(() => {
        workspaceStore.markOpened(target.id);
        // The file as read, so it is only written again once something changes.
        writtenFileRef.current = readText === null ? null : `${target.id}\n${readText}`;
        return opened;
      }, approvedEdits);
      return wasAdopted;
    },
    [adapter.workspace, adoptWorkspace, openPlainFolder, readWorkspaceFile, toOpenFolder, toast, workspaceStore],
  );

  const handleOpenFolder = useCallback(async () => {
    if (!adapter.workspace.isSupported) {
      toast.show({ kind: "error", text: "Local folder access is not supported in this browser or environment." });
      return;
    }
    const approvedEdits = await confirmUnsavedChangesInAllDocuments();
    if (!approvedEdits) {
      return;
    }
    try {
      const opened = await adapter.workspace.pickFolder();
      if (!opened) {
        return;
      }
      setIsLoading(true);
      if (opened.accessMode !== "fallback") {
        const read = await readWorkspaceFile(opened);
        if (read.status === "ok") {
          const record = workspaceStore.workspaceForFile(opened);
          const restored = new Map([[opened.id, { status: "restored" as const, folder: opened }]]);
          if (await openStoredWorkspace(record, { interactive: true, approvedEdits, restored })) {
            setIsSidebarOpen(true);
          }
          return;
        }
        if (read.status === "unreadable") {
          toast.show({ kind: "info", text: describeUnreadableFile(opened.name) });
        }
      }
      const tree = await adapter.workspace.readTree(opened);
      const folder: OpenFolder = { id: opened.id, name: opened.name, folder: opened, status: "ready", tree };
      await adoptWorkspace(() => {
        // The workspace that is exactly this folder, which has no other folder.
        const record = workspaceStore.openFolder(opened);
        return withLocations(record, [folder]);
      }, approvedEdits);
      // Shows the files of the folder the user just picked, also where the explorer is a drawer.
      setIsSidebarOpen(true);
    } catch (err) {
      console.error("Failed to open folder:", err);
      const message = err instanceof Error ? err.message : "Failed to open the selected folder.";
      toast.show({ kind: "error", text: message });
    } finally {
      setIsLoading(false);
    }
  }, [
    adapter.workspace,
    adoptWorkspace,
    confirmUnsavedChangesInAllDocuments,
    openStoredWorkspace,
    readWorkspaceFile,
    toast,
    workspaceStore,
  ]);

  const restoreLastWorkspace = useCallback(async () => {
    try {
      const migrated = await workspaceStore.migrateLegacyFolder(adapter.workspace);
      const last = workspaceStore.lastWorkspace();
      if (!last) {
        if (migrated?.status === "unavailable") {
          toast.show({ kind: "info", text: `Couldn't reopen "${migrated.name}". It may have been moved or deleted.` });
        }
        return;
      }
      await openStoredWorkspace(last, {
        interactive: false,
        restored: migrated ? new Map([[LEGACY_FOLDER_ID, migrated]]) : undefined,
      });
    } catch (err) {
      console.error("Failed to restore the last workspace:", err);
      const message = err instanceof Error ? err.message : "Failed to restore the last workspace.";
      toast.show({ kind: "error", text: message });
    } finally {
      setIsLoading(false);
    }
  }, [adapter.workspace, openStoredWorkspace, toast, workspaceStore]);

  useEffect(() => {
    if (!adapter.workspace.isSupported || startupRestoreRef.current) {
      return;
    }
    startupRestoreRef.current = restoreLastWorkspace();
  }, [adapter.workspace.isSupported, restoreLastWorkspace]);

  /** Switches to a remembered workspace, asking for any folder permission it needs. */
  const handleOpenWorkspace = useCallback(
    async (workspaceId: string) => {
      const record = workspaceStore.workspace(workspaceId);
      if (!record || workspaceRef.current?.id === workspaceId) {
        return;
      }
      const approvedEdits = await confirmUnsavedChangesInAllDocuments();
      if (!approvedEdits) {
        return;
      }
      try {
        if (await openStoredWorkspace(record, { interactive: true, approvedEdits })) {
          setIsSidebarOpen(true);
        }
      } catch (err) {
        console.error("Failed to open the workspace:", err);
        const message = err instanceof Error ? err.message : "Failed to open the workspace.";
        toast.show({ kind: "error", text: message });
      }
    },
    [confirmUnsavedChangesInAllDocuments, openStoredWorkspace, toast, workspaceStore],
  );

  const handleRemoveRecent = useCallback(
    async (workspaceId: string) => {
      const record = workspaceStore.workspace(workspaceId);
      if (!record) {
        return;
      }
      const confirmed = await toast.confirm({
        title: `Remove "${record.name}" from Recent?`,
        message: "Vista forgets this workspace and its tabs. Your folders and files aren't changed.",
        confirmLabel: "Remove",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      const { unusedFolderIds } = workspaceStore.removeWorkspace(workspaceId);
      setRecentFolders((known) => {
        const next = new Map(known);
        next.delete(workspaceId);
        return next;
      });
      await Promise.all(
        unusedFolderIds.map(async (folderId) => {
          try {
            await adapter.workspace.forgetFolder(folderId);
          } catch (err) {
            // The workspace is gone either way; the host keeping a record of the folder is harmless.
            console.error("Failed to forget a folder:", err);
          }
        }),
      );
    },
    [adapter.workspace, toast, workspaceStore],
  );

  const currentWorkspace: RecentWorkspace | null = workspace && {
    id: workspace.id,
    name: workspace.name,
    icon: workspace.icon,
    color: workspace.color,
    folders: summarizeFolders(workspace.folders),
  };
  const recents: RecentWorkspace[] = workspaceStore.recentWorkspaces().map((record) =>
    currentWorkspace?.id === record.id
      ? currentWorkspace
      : {
          id: record.id,
          name: record.name,
          icon: record.icon,
          color: record.color,
          folders: recentFolders.get(record.id) ?? null,
        },
  );
  const unknownRecentIds = recents.flatMap((recent) => (recent.folders === null ? [recent.id] : [])).join("\n");

  // Looks up the folders of the workspaces Vista hasn't opened or restored in this run, without
  // asking for permission, so their entries can name them.
  const probedRecentIdsRef = useRef(new Set<string>());
  useEffect(() => {
    if (isLoading || unknownRecentIds === "") {
      return;
    }
    for (const workspaceId of unknownRecentIds.split("\n")) {
      const record = workspaceStore.workspace(workspaceId);
      if (!record || probedRecentIdsRef.current.has(workspaceId)) {
        continue;
      }
      probedRecentIdsRef.current.add(workspaceId);
      const probe = async () => {
        try {
          const results = await Promise.all(
            record.folderIds.map(async (id): Promise<[string, RestoreFolderResult]> => [
              id,
              await adapter.workspace.restoreFolder(id, { interactive: false }),
            ]),
          );
          setRecentFolders((known) =>
            known.has(workspaceId) ? known : new Map(known).set(workspaceId, summarizeRestored(results)),
          );
        } catch (err) {
          // The entry still opens; it only goes without its folder names.
          console.error("Failed to look up a workspace's folders:", err);
        }
      };
      void probe();
    }
  }, [adapter.workspace, isLoading, unknownRecentIds, workspaceStore]);

  const handleChangeWorkspaceDetails = useCallback(
    (changes: WorkspaceDetails) => {
      const current = workspaceRef.current;
      if (!current || !workspaceStore.updateDetails(current.id, changes)) {
        return;
      }
      setWorkspace((previous) => (previous?.id === current.id ? { ...previous, ...changes } : previous));
    },
    [workspaceStore],
  );

  /** Where a folder is from the home folder, as the host says or, when it can't, beside it. */
  const locateFolder = useCallback(
    async (home: WorkspaceFolder, entry: OpenFolder): Promise<string> => {
      const found =
        entry.folder && adapter.workspace.relativeLocation
          ? await adapter.workspace.relativeLocation(home, entry.folder)
          : null;
      return found ?? `../${entry.name}`;
    },
    [adapter.workspace],
  );

  const writeWorkspaceFile = useCallback(
    async (home: WorkspaceFolder, text: string) => {
      try {
        await adapter.workspace.createDirectory(home, WORKSPACE_FILE_DIRECTORY);
      } catch {
        // Usually it exists already; any real problem fails the write below, which says why.
      }
      await adapter.workspace.writeFile(home, WORKSPACE_FILE_PATH, encodeText(text, false));
    },
    [adapter.workspace],
  );

  useEffect(() => {
    const home = workspace?.folders[0]?.folder;
    if (!workspace || workspace.storage !== "folder" || !home) {
      return;
    }
    const text = serializeWorkspaceFile(describeWorkspaceFile(workspace));
    const key = `${workspace.id}\n${text}`;
    if (writtenFileRef.current === key) {
      return;
    }
    writtenFileRef.current = key;
    const previous = fileWriteRef.current;
    const write = async () => {
      await previous;
      try {
        await writeWorkspaceFile(home, text);
      } catch (err) {
        console.error("Failed to save the workspace details:", err);
        if (writtenFileRef.current === key) {
          writtenFileRef.current = null;
        }
        toast.show({ kind: "error", text: describeFileWriteFailure(home.name, err) });
      }
    };
    fileWriteRef.current = write();
  }, [toast, workspace, writeWorkspaceFile]);

  const handleChangeStorage = useCallback(
    async (next: WorkspaceStorage) => {
      const current = workspaceRef.current;
      const home = current?.folders[0];
      if (!current || !home?.folder || current.storage === next) {
        return;
      }
      const homeFolder = home.folder;
      if (next === "folder") {
        try {
          const located = new Map<string, string>();
          for (const entry of current.folders.slice(1)) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- a workspace has few folders
            located.set(entry.id, await locateFolder(homeFolder, entry));
          }
          const folders = current.folders.map((entry) => ({
            ...entry,
            location: located.get(entry.id) ?? HOME_FOLDER_LOCATION,
          }));
          const text = serializeWorkspaceFile(describeWorkspaceFile({ ...current, folders }));
          await writeWorkspaceFile(homeFolder, text);
          workspaceStore.storeInFolder(
            current.id,
            Object.fromEntries([...located].map(([folderId, location]) => [location, folderId])),
          );
          writtenFileRef.current = `${current.id}\n${text}`;
          setWorkspace((previous) =>
            previous?.id === current.id
              ? {
                  ...previous,
                  storage: "folder",
                  folders: previous.folders.map((entry, index) => ({
                    ...entry,
                    location: index === 0 ? HOME_FOLDER_LOCATION : (located.get(entry.id) ?? `../${entry.name}`),
                  })),
                }
              : previous,
          );
        } catch (err) {
          console.error("Failed to store the workspace details in its folder:", err);
          toast.show({ kind: "error", text: describeFileWriteFailure(home.name, err) });
        }
        return;
      }
      const confirmed = await toast.confirm({
        title: "Store the details on this device?",
        message: `Vista deletes "${home.name}/${WORKSPACE_FILE_PATH}", so opening the folder elsewhere no longer opens this workspace.`,
        confirmLabel: "Delete File",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      try {
        // A rewrite still under way would bring the file back after it is deleted.
        await fileWriteRef.current;
        if (await adapter.workspace.stat(homeFolder, WORKSPACE_FILE_PATH)) {
          await adapter.workspace.remove(homeFolder, WORKSPACE_FILE_PATH);
        }
      } catch (err) {
        console.error("Failed to delete the workspace file:", err);
        const reason = err instanceof Error ? ` ${err.message}` : "";
        toast.show({ kind: "error", text: `Couldn't delete "${home.name}/${WORKSPACE_FILE_PATH}".${reason}` });
        return;
      }
      workspaceStore.storeOnDevice(current.id);
      writtenFileRef.current = null;
      setWorkspace((previous) =>
        previous?.id === current.id
          ? { ...previous, storage: "device", folders: previous.folders.map(({ location: _, ...entry }) => entry) }
          : previous,
      );
    },
    [adapter.workspace, locateFolder, toast, workspaceStore, writeWorkspaceFile],
  );

  const handleAddFolder = useCallback(async () => {
    const current = workspaceRef.current;
    if (!current) {
      return;
    }
    try {
      const picked = await adapter.workspace.pickFolder();
      if (!picked) {
        return;
      }
      const reachable = current.folders.flatMap((entry) => (entry.folder ? [entry.folder] : []));
      const refusal = current.folders.some((entry) => entry.id === picked.id)
        ? `"${picked.name}" is already part of this workspace.`
        : await checkFolderOverlap(adapter.workspace, reachable, picked);
      if (refusal) {
        toast.show({ kind: "error", text: refusal });
        // A folder picked for the first time was remembered; nothing uses it now.
        if (!workspaceStore.isFolderUsed(picked.id)) {
          await adapter.workspace.forgetFolder(picked.id);
        }
        return;
      }
      const tree = await adapter.workspace.readTree(picked);
      if (workspaceRef.current?.id !== current.id) {
        return;
      }
      const home = current.folders[0]?.folder;
      const added: OpenFolder = { id: picked.id, name: picked.name, folder: picked, status: "ready", tree };
      if (current.storage === "folder" && home) {
        added.location = await locateFolder(home, added);
      }
      workspaceStore.addFolder(current.id, picked.id, added.location);
      setWorkspace((previous) =>
        previous?.id === current.id ? { ...previous, folders: [...previous.folders, added] } : previous,
      );
      setIsSidebarOpen(true);
    } catch (err) {
      console.error("Failed to add a folder:", err);
      const message = err instanceof Error ? err.message : "Failed to add the folder.";
      toast.show({ kind: "error", text: message });
    }
  }, [adapter.workspace, locateFolder, toast, workspaceStore]);

  const handleRemoveFolder = useCallback(
    async (folderId: string) => {
      const current = workspaceRef.current;
      const entry = current?.folders.find((candidate) => candidate.id === folderId);
      if (!current || !entry) {
        return;
      }
      if (current.storage === "folder" && current.folders[0]?.id === folderId) {
        toast.show({
          kind: "info",
          text: "The workspace's details are stored in this folder. Store them on this device first.",
        });
        return;
      }
      const confirmed = await toast.confirm({
        title: `Remove "${entry.name}" from the workspace?`,
        message: "Your folders and files aren't changed.",
        confirmLabel: "Remove",
      });
      const keys = documentsRef.current.documents.filter((doc) => doc.folderId === folderId).map((doc) => doc.key);
      if (!confirmed || !(await closeDocuments(keys))) {
        return;
      }
      if (isMissingFolder(entry)) {
        setWorkspace((previous) =>
          previous?.id === current.id
            ? { ...previous, folders: previous.folders.filter((candidate) => candidate.id !== folderId) }
            : previous,
        );
        return;
      }
      const removed = workspaceStore.removeFolder(current.id, folderId);
      if (!removed) {
        return;
      }
      setWorkspace((previous) =>
        previous?.id === current.id
          ? { ...previous, folders: previous.folders.filter((candidate) => candidate.id !== folderId) }
          : previous,
      );
      const prefix = documentKey(folderId, "");
      setExpandedKeys((previous) => new Set([...previous].filter((key) => !key.startsWith(prefix))));
      if (removed.isFolderUnused) {
        try {
          await adapter.workspace.forgetFolder(folderId);
        } catch (err) {
          // Quiet: the folder is out of the workspace; the host only keeps a record it no longer needs.
          console.error("Failed to forget a removed folder:", err);
        }
      }
    },
    [adapter.workspace, closeDocuments, toast, workspaceStore],
  );

  /** Asks for a folder of the workspace's file that wasn't found here, by its name. */
  const handleLocate = useCallback(
    async (folderId: string) => {
      const current = workspaceRef.current;
      const entry = current?.folders.find((candidate) => candidate.id === folderId);
      const location = entry?.location;
      if (!current || !entry || location === undefined || location === HOME_FOLDER_LOCATION) {
        return;
      }
      try {
        const picked = await adapter.workspace.pickFolder();
        if (!picked) {
          return;
        }
        const reachable = current.folders.flatMap((candidate) => (candidate.folder ? [candidate.folder] : []));
        let refusal: string | null = null;
        if (picked.name !== entry.name) {
          refusal = `Pick the folder named "${entry.name}".`;
        } else if (current.folders.some((candidate) => candidate.id === picked.id)) {
          refusal = `"${picked.name}" is already part of this workspace.`;
        } else {
          refusal = await checkFolderOverlap(adapter.workspace, reachable, picked);
        }
        if (refusal) {
          toast.show({ kind: "error", text: refusal });
          // A folder picked for the first time was remembered; nothing uses it now.
          if (!workspaceStore.isFolderUsed(picked.id)) {
            await adapter.workspace.forgetFolder(picked.id);
          }
          return;
        }
        const tree = await adapter.workspace.readTree(picked);
        const record = workspaceStore.workspace(current.id);
        if (workspaceRef.current?.id !== current.id || record?.storage !== "folder") {
          return;
        }
        workspaceStore.applyWorkspaceFile(current.id, describeWorkspaceFile(current), {
          ...record.locations,
          [location]: picked.id,
        });
        const found: OpenFolder = { id: picked.id, name: picked.name, folder: picked, status: "ready", tree, location };
        setWorkspace((previous) =>
          previous?.id === current.id
            ? {
                ...previous,
                folders: previous.folders.map((candidate) => (candidate.id === folderId ? found : candidate)),
              }
            : previous,
        );
      } catch (err) {
        console.error("Failed to locate a folder:", err);
        const message = err instanceof Error ? err.message : "Failed to open the folder.";
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, toast, workspaceStore],
  );

  const handleAllowAccess = useCallback(
    async (folderId: string) => {
      const current = workspaceRef.current;
      if (!current) {
        return;
      }
      try {
        const result = await adapter.workspace.restoreFolder(folderId, { interactive: true });
        if (result.status === "needs-permission") {
          return;
        }
        const record = workspaceStore.workspace(current.id);
        if (result.status === "restored" && record?.storage === "folder" && record.folderIds[0] === folderId) {
          // The file in this folder couldn't be read until now, so the workspace opens again from it.
          await openStoredWorkspace(record, { interactive: true, restored: new Map([[folderId, result]]) });
          return;
        }
        const opened = await toOpenFolder(folderId, result);
        setWorkspace((previous) =>
          previous?.id === current.id
            ? { ...previous, folders: previous.folders.map((entry) => (entry.id === folderId ? opened : entry)) }
            : previous,
        );
      } catch (err) {
        console.error("Failed to allow access to a folder:", err);
        const message = err instanceof Error ? err.message : "Failed to open the folder.";
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, openStoredWorkspace, toOpenFolder, toast, workspaceStore],
  );

  const refreshTree = useCallback(
    async (folder: WorkspaceFolder) => {
      try {
        const nodes = await adapter.workspace.readTree(folder);
        if (isStillOpen(folder)) {
          setFolderTree(folder, nodes);
        }
      } catch (err) {
        console.error("Failed to refresh the file list:", err);
        const message = err instanceof Error ? err.message : "Failed to refresh the file list.";
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, isStillOpen, setFolderTree, toast],
  );

  /**
   * Reads a file into its tab, opening one when needed and filling it when it was restored and not
   * read yet. A file Vista can't show is reported; resolves to whether the tab now shows it.
   */
  const readIntoTab = useCallback(
    async (folder: WorkspaceFolder, path: string): Promise<boolean> => {
      const folderId = folder.id;
      const name = path.split("/").pop() ?? path;
      try {
        const result = await loadFile(adapter.workspace, {
          workspace: folder,
          path,
          maxBytes: settings.files.maxOpenSizeMb * BYTES_PER_MB,
        });
        // A folder closed during the read makes this path meaningless, and saving it would write
        // into another folder.
        if (!isStillOpen(folder)) {
          return false;
        }
        switch (result.kind) {
          case "missing":
            toast.show({ kind: "error", text: `"${name}" no longer exists. It may have been moved or deleted.` });
            void refreshTree(folder);
            return false;
          case "too-large":
            toast.show({
              kind: "error",
              text: `"${name}" is ${formatMegabytes(result.size)} MB, over the ${settings.files.maxOpenSizeMb} MB limit. You can raise the limit in Settings.`,
            });
            return false;
          case "binary":
            toast.show({ kind: "error", text: `Vista can't open "${name}" because it isn't a text file.` });
            return false;
          case "loaded":
            break;
        }
        dispatchDocuments({ type: "open", folderId, path, file: result.file });
        if (result.file.isReadOnly) {
          toast.show({
            kind: "info",
            text: `"${name}" isn't UTF-8 text, so it opened read-only to keep its characters intact.`,
          });
        }
        return true;
      } catch (err) {
        console.error("Failed to read file:", err);
        const message = err instanceof Error ? err.message : `Failed to open ${path}.`;
        toast.show({ kind: "error", text: message });
        return false;
      }
    },
    [adapter.workspace, isStillOpen, refreshTree, settings.files.maxOpenSizeMb, toast],
  );

  /** Opens a file in a tab, or switches to its tab; resolves to whether it is now the active tab. */
  const handleSelectFile = useCallback(
    async ({ folderId, path }: ExplorerEntry): Promise<boolean> => {
      const folder = readyFolder(folderId);
      if (!folder) {
        return false;
      }
      const key = documentKey(folderId, path);
      // Selecting an open file only switches to its tab; reloading it would discard unsaved edits.
      if (documentsRef.current.documents.some((doc) => doc.key === key)) {
        dispatchDocuments({ type: "activate", key });
        return true;
      }
      return readIntoTab(folder, path);
    },
    [readIntoTab, readyFolder],
  );

  // A restored tab reads its file when it is first shown, and closes when the file can't be shown.
  const pendingReadsRef = useRef(new Set<string>());
  const pendingActive = activeDocument?.isPending ? activeDocument : null;
  useEffect(() => {
    if (!pendingActive || pendingReadsRef.current.has(pendingActive.key)) {
      return;
    }
    const { key, folderId, path } = pendingActive;
    const closeIfStillPending = () => {
      if (documentsRef.current.documents.some((doc) => doc.key === key && doc.isPending)) {
        dispatchDocuments({ type: "close", keys: [key] });
      }
    };
    const folder = readyFolder(folderId);
    if (!folder) {
      closeIfStillPending();
      return;
    }
    pendingReadsRef.current.add(key);
    const read = async () => {
      try {
        if (!(await readIntoTab(folder, path))) {
          closeIfStillPending();
        }
      } finally {
        pendingReadsRef.current.delete(key);
      }
    };
    void read();
  }, [pendingActive, readIntoTab, readyFolder]);

  // The session follows every change to the tabs and expanded folders, so leaving keeps it.
  useEffect(() => {
    if (!workspace || sessionRestoreRef.current !== null) {
      return;
    }
    const session = describeSession(workspace, documentsState, expandedKeys);
    const serialized = JSON.stringify([workspace.id, session]);
    if (serialized === savedSessionRef.current) {
      return;
    }
    savedSessionRef.current = serialized;
    workspaceStore.saveSession(workspace.id, session);
  }, [documentsState, expandedKeys, workspace, workspaceStore]);

  const isRecheckingRef = useRef(false);

  /**
   * Compares the tree and each open tab with the disk, since other programs change files while
   * Vista is in the background. A clean tab reloads; a tab with unsaved edits, or whose file is
   * gone, is marked, and saving it later asks before overwriting.
   */
  const recheckDisk = useCallback(async () => {
    const folders = workspaceRef.current?.folders.flatMap((entry) => (entry.folder ? [entry.folder] : [])) ?? [];
    if (folders.length === 0 || isRecheckingRef.current) {
      return;
    }
    isRecheckingRef.current = true;
    try {
      await Promise.all(
        folders.map(async (folder) => {
          try {
            const nodes = await adapter.workspace.readTree(folder);
            if (isStillOpen(folder)) {
              setFolderTree(folder, nodes);
            }
          } catch (err) {
            // Quiet: the user did not ask for this refresh, and the tree on screen is still usable.
            console.error("Failed to refresh the file list:", err);
          }
        }),
      );
      const maxBytes = settings.files.maxOpenSizeMb * BYTES_PER_MB;
      const marked: OpenDocument[] = [];
      await Promise.all(
        documentsRef.current.documents.map(async (doc) => {
          const target = folders.find((folder) => folder.id === doc.folderId);
          // A tab not read yet has nothing to compare; it reads the disk when shown.
          if (!target || doc.isPending) {
            return;
          }
          try {
            const stat = await adapter.workspace.stat(target, doc.path);
            if (!isStillOpen(target) || (stat !== null && isSameStat(stat, doc.diskStat))) {
              return;
            }
            const current = documentsRef.current.documents.find((candidate) => candidate.key === doc.key);
            if (!current) {
              return;
            }
            if (stat !== null && !current.isDirty) {
              const result = await loadFile(adapter.workspace, { workspace: target, path: doc.path, maxBytes });
              if (!isStillOpen(target)) {
                return;
              }
              if (result.kind === "loaded") {
                // The reducer keeps the buffer if it was edited during the read, and marks it, and ignores
                // the result if a save changed the version during the read.
                dispatchDocuments({ type: "reloaded", key: doc.key, expected: current.diskStat, file: result.file });
                return;
              }
              dispatchDocuments({ type: "diskChanged", key: doc.key, stat: result.kind === "missing" ? null : stat });
            } else {
              dispatchDocuments({ type: "diskChanged", key: doc.key, stat });
            }
            if (current.externalChange === null) {
              marked.push(current);
            }
          } catch (err) {
            console.error("Failed to check a file on disk:", err);
          }
        }),
      );
      if (marked.length > 0) {
        toast.show({ kind: "info", text: describeExternalChanges(marked) });
      }
    } finally {
      isRecheckingRef.current = false;
    }
  }, [adapter.workspace, isStillOpen, setFolderTree, settings.files.maxOpenSizeMb, toast]);

  useEffect(() => {
    const handleFocus = () => void recheckDisk();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void recheckDisk();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [recheckDisk]);

  const handleContentChange = useCallback(
    (content: string) => {
      if (activeDocumentKey) {
        dispatchDocuments({ type: "edit", key: activeDocumentKey, content });
      }
    },
    [activeDocumentKey],
  );

  const handleViewModeChange = useCallback(
    (viewMode: ViewMode) => {
      if (activeDocumentKey) {
        dispatchDocuments({ type: "setViewMode", key: activeDocumentKey, viewMode });
      }
    },
    [activeDocumentKey],
  );

  const saveActiveDocument = useCallback(async () => {
    if (activeDocumentKey) {
      await saveDocument(activeDocumentKey);
    }
  }, [activeDocumentKey, saveDocument]);

  const closeActiveDocument = useCallback(async () => {
    if (activeDocumentKey) {
      await closeDocuments([activeDocumentKey]);
    }
  }, [activeDocumentKey, closeDocuments]);

  const handleCreateFile = useCallback(
    async ({ folderId, path: parentPath }: ExplorerEntry, name: string) => {
      const folder = readyFolder(folderId);
      if (!folder) {
        return;
      }
      try {
        await adapter.workspace.createFile(folder, joinWorkspacePath(parentPath, name));
        await refreshTree(folder);
      } catch (err) {
        console.error("Failed to create file:", err);
        const message = err instanceof Error ? err.message : `Failed to create "${name}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, readyFolder, refreshTree, toast],
  );

  const handleCreateDirectory = useCallback(
    async ({ folderId, path: parentPath }: ExplorerEntry, name: string) => {
      const folder = readyFolder(folderId);
      if (!folder) {
        return;
      }
      try {
        await adapter.workspace.createDirectory(folder, joinWorkspacePath(parentPath, name));
        await refreshTree(folder);
      } catch (err) {
        console.error("Failed to create folder:", err);
        const message = err instanceof Error ? err.message : `Failed to create "${name}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, readyFolder, refreshTree, toast],
  );

  const handleRename = useCallback(
    async ({ folderId, path: fromPath }: ExplorerEntry, toPath: string) => {
      const folder = readyFolder(folderId);
      if (!folder) {
        return;
      }
      try {
        await adapter.workspace.move(folder, fromPath, toPath);
        dispatchDocuments({ type: "move", folderId, fromPath, toPath });
        await refreshTree(folder);
      } catch (err) {
        console.error("Failed to rename entry:", err);
        const message = err instanceof Error ? err.message : `Failed to rename "${fromPath}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, readyFolder, refreshTree, toast],
  );

  const handleDelete = useCallback(
    async ({ folderId, path }: ExplorerEntry) => {
      const folder = readyFolder(folderId);
      const tree = workspaceRef.current?.folders.find((entry) => entry.id === folderId)?.tree ?? [];
      if (!folder) {
        return;
      }
      const node = findTreeNode(tree, path);
      const name = node?.name ?? path;
      const isDirectory = node?.kind === "directory";
      const dirtyDocuments = findAffectedDocuments(documentsRef.current, { folderId, path }).filter(
        (doc) => doc.isDirty,
      );
      const deletionMessage = isDirectory
        ? "This folder and everything in it will be permanently deleted."
        : "This file will be permanently deleted.";
      try {
        const confirmed = await toast.confirm({
          title: `Delete "${name}"?`,
          message: [deletionMessage, describeLostEdits(dirtyDocuments)].filter(Boolean).join(" "),
          confirmLabel: "Delete",
          destructive: true,
        });
        if (!confirmed) {
          return;
        }
        await adapter.workspace.remove(folder, path);
        const deletedDocuments = findAffectedDocuments(documentsRef.current, { folderId, path });
        if (deletedDocuments.length > 0) {
          toast.show({ kind: "info", text: describeDeletedDocuments(deletedDocuments) });
          dispatchDocuments({ type: "close", keys: deletedDocuments.map((doc) => doc.key) });
        }
        await refreshTree(folder);
      } catch (err) {
        console.error("Failed to delete entry:", err);
        const message = err instanceof Error ? err.message : `Failed to delete "${path}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, readyFolder, refreshTree, toast],
  );

  const openFind = useCallback((mode: FindMode) => {
    setFind((previous) => ({ mode, focusRequest: (previous?.focusRequest ?? 0) + 1 }));
  }, []);

  // Every file of every reachable folder, for the go-to picker.
  const { goToFiles, goToEntries } = useMemo(() => {
    const files: GoToFile[] = [];
    const entries = new Map<string, ExplorerEntry>();
    for (const entry of workspace?.folders ?? []) {
      for (const path of listFilePaths(entry.tree)) {
        const key = documentKey(entry.id, path);
        files.push({ key, label: `${entry.name}/${path}` });
        entries.set(key, { folderId: entry.id, path });
      }
    }
    return { goToFiles: files, goToEntries: entries };
  }, [workspace]);

  /**
   * Opens the file a go-to request names, or stays in the current one, and moves the raw editor's
   * cursor to the requested position. A position needs the raw view, so the tab switches to it.
   */
  const handleGoTo = useCallback(
    async ({ fileKey, line, column }: GoToRequest) => {
      setGoToQuery(null);
      let key = activeDocumentKey;
      if (fileKey !== null) {
        const entry = goToEntries.get(fileKey);
        if (!entry || !(await handleSelectFile(entry))) {
          return;
        }
        key = fileKey;
      }
      if (key === null || line === undefined) {
        return;
      }
      dispatchDocuments({ type: "setViewMode", key, viewMode: "raw" });
      setPendingJump({ key, position: { line, column } });
    },
    [activeDocumentKey, goToEntries, handleSelectFile],
  );

  const saveAllDocuments = useCallback(async () => {
    for (const doc of documentsRef.current.documents) {
      // One at a time, stopping at the first failure, which saveDocument has already reported.
      // oxlint-disable-next-line eslint/no-await-in-loop -- a failed save should not be followed by more
      if (doc.isDirty && !(await saveDocument(doc.key))) {
        return;
      }
    }
  }, [saveDocument]);

  const closeAllDocuments = useCallback(
    () => closeDocuments(documentsRef.current.documents.map((doc) => doc.key)),
    [closeDocuments],
  );

  const activateNeighborTab = useCallback((step: 1 | -1) => {
    const { documents, activeKey } = documentsRef.current;
    const index = documents.findIndex((doc) => doc.key === activeKey);
    const next = documents[(index + step + documents.length) % documents.length];
    if (next) {
      dispatchDocuments({ type: "activate", key: next.key });
    }
  }, []);

  const moveActiveTab = useCallback((step: 1 | -1) => {
    const { documents, activeKey } = documentsRef.current;
    const index = documents.findIndex((doc) => doc.key === activeKey);
    if (activeKey !== null && index >= 0) {
      dispatchDocuments({ type: "reorder", key: activeKey, toIndex: index + step });
    }
  }, []);

  const requestNewEntry = useCallback((kind: NewEntryRequest["kind"]) => {
    setIsSidebarOpen(true);
    setNewEntryRequest((previous) => ({ kind, serial: (previous?.serial ?? 0) + 1 }));
  }, []);

  const copyText = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        console.error("Failed to copy to the clipboard:", err);
        toast.show({ kind: "error", text: "Couldn't copy to the clipboard." });
      }
    },
    [toast],
  );

  // The desktop copies the full path on disk; the web has none, so it copies the path within the folder.
  // Copy Path and Reveal exist only where the host has them: the web has no full path to copy and
  // can't open the file manager, so they are left out there rather than shown disabled.
  const copyFullPath = useMemo(
    () =>
      adapter.platform === "native"
        ? (entry: FolderEntryRef) => {
            const folder = readyFolder(entry.folderId);
            if (folder) {
              void copyText(joinAbsolutePath(folder.rootPath, entry.path));
            }
          }
        : undefined,
    [adapter.platform, copyText, readyFolder],
  );

  const revealEntry = useMemo(() => {
    const { reveal } = adapter.workspace;
    if (!reveal) {
      return undefined;
    }
    return async (entry: FolderEntryRef) => {
      const folder = readyFolder(entry.folderId);
      if (!folder) {
        return;
      }
      try {
        await reveal(folder, entry.path);
      } catch (err) {
        console.error("Failed to reveal the entry:", err);
        const name = entry.path === "" ? "the folder" : `"${entry.path.split("/").at(-1)}"`;
        toast.show({ kind: "error", text: `Couldn't show ${name} in the file manager.` });
      }
    };
  }, [adapter.workspace, readyFolder, toast]);

  const runEditing = useCallback(
    async (action: EditingAction) => {
      if (!(await runEditingAction(action))) {
        // Reading the clipboard needs a permission the keyboard shortcut does not.
        toast.show({ kind: "info", text: "Press Ctrl + V to paste." });
      }
    },
    [toast],
  );

  /** Runs a CodeMirror selection command in the focused raw editor, or else in the one on screen. */
  const runSelection = useCallback((command: (view: EditorView) => boolean) => {
    const view =
      findCodeMirrorView(document.activeElement) ?? findCodeMirrorView(document.querySelector("main .cm-editor"));
    if (view) {
      command(view);
      view.focus();
    }
  }, []);

  const loadImage = useCallback(
    async (src: string): Promise<string | Blob | null> => {
      const folder = activeDocument ? readyFolder(activeDocument.folderId) : null;
      if (!activeDocument || !folder) {
        return null;
      }
      const source = resolveImageSource(src, activeDocument.path);
      if (source.kind === "url") {
        return source.url;
      }
      if (source.kind === "none") {
        return null;
      }
      const { bytes } = await adapter.workspace.readFile(folder, source.path);
      return new Blob([bytes], { type: imageMimeType(source.path) });
    },
    [activeDocument, adapter.workspace, readyFolder],
  );

  const activeViewer = activeDocument ? getViewer(activeDocument.extension) : null;
  const canToggleView = activeViewer !== null && activeViewer.hasRaw && activeViewer.enriched !== undefined;
  const isRawShown =
    activeDocument !== null && (activeDocument.viewMode !== "enriched" || activeViewer?.enriched === undefined);
  const editorSettings = settings.editor;
  const handleEditorSettingsChange = useCallback(
    (changes: Partial<EditorSettings>) => updateSettings({ editor: changes }),
    [updateSettings],
  );

  const hasReadyFolder = workspace?.folders.some((entry) => entry.status === "ready") ?? false;
  const commands = useMemo<Command[]>(
    () => [
      {
        id: "file.openFolder",
        category: "Workspace",
        label: "Open Folder…",
        isEnabled: !isPromptingForUnsavedChanges,
        run: handleOpenFolder,
      },
      {
        id: "file.addFolder",
        category: "Workspace",
        label: "Add Folder to Workspace…",
        isEnabled: !isPromptingForUnsavedChanges && workspace !== null,
        run: handleAddFolder,
      },
      {
        id: "workspace.settings",
        category: "Workspace",
        label: "Workspace Settings…",
        isEnabled: !isPromptingForUnsavedChanges && workspace !== null,
        run: () => setOpenDialog("workspace"),
      },
      {
        id: "file.newFile",
        category: "File",
        label: "New File",
        isEnabled: !isPromptingForUnsavedChanges && hasReadyFolder,
        run: () => requestNewEntry("file"),
      },
      {
        id: "file.newFolder",
        category: "File",
        label: "New Folder",
        isEnabled: !isPromptingForUnsavedChanges && hasReadyFolder,
        run: () => requestNewEntry("directory"),
      },
      {
        id: "file.save",
        category: "File",
        label: "Save",
        shortcut: "Mod+S",
        // A second prompt over a pending one would leave the first flow waiting forever.
        isEnabled: !isPromptingForUnsavedChanges && (activeDocument?.isDirty ?? false),
        run: saveActiveDocument,
      },
      {
        id: "file.saveAll",
        category: "File",
        label: "Save All",
        isEnabled: !isPromptingForUnsavedChanges && hasDirtyDocuments,
        run: saveAllDocuments,
      },
      ...(copyFullPath
        ? ([
            {
              id: "file.copyPath",
              category: "File",
              label: "Copy Path",
              isEnabled: activeDocument !== null,
              run: () => {
                if (activeDocument) {
                  copyFullPath(activeDocument);
                }
              },
            },
          ] satisfies Command[])
        : []),
      {
        id: "file.copyRelativePath",
        category: "File",
        label: "Copy Relative Path",
        isEnabled: activeDocument !== null,
        run: () => {
          if (activeDocument) {
            void copyText(activeDocument.path);
          }
        },
      },
      ...(revealEntry
        ? ([
            {
              id: "file.reveal",
              category: "File",
              label: "Reveal in File Explorer",
              isEnabled: activeDocument !== null,
              run: () => {
                if (activeDocument) {
                  void revealEntry(activeDocument);
                }
              },
            },
          ] satisfies Command[])
        : []),
      {
        id: "file.settings",
        category: "Settings",
        label: "Settings…",
        shortcut: "Mod+,",
        isEnabled: !isPromptingForUnsavedChanges,
        run: () => setOpenDialog("appearance"),
      },
      {
        id: "tabs.close",
        category: "Tabs",
        label: "Close Tab",
        // Browsers reserve Ctrl+W for closing their own tab, so the web host uses Alt+W.
        shortcut: adapter.platform === "native" ? "Mod+W" : "Alt+W",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: closeActiveDocument,
      },
      {
        id: "tabs.closeAll",
        category: "Tabs",
        label: "Close All Tabs",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: closeAllDocuments,
      },
      // The editors handle these keys themselves, so the menus only show them.
      { id: "edit.undo", category: "Edit", label: "Undo", shortcutHint: "Mod+Z", run: () => runEditing("undo") },
      { id: "edit.redo", category: "Edit", label: "Redo", shortcutHint: "Mod+Y", run: () => runEditing("redo") },
      { id: "edit.cut", category: "Edit", label: "Cut", shortcutHint: "Mod+X", run: () => runEditing("cut") },
      { id: "edit.copy", category: "Edit", label: "Copy", shortcutHint: "Mod+C", run: () => runEditing("copy") },
      { id: "edit.paste", category: "Edit", label: "Paste", shortcutHint: "Mod+V", run: () => runEditing("paste") },
      {
        id: "find.find",
        category: "Edit",
        label: "Find",
        shortcut: "Mod+F",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: () => openFind("find"),
      },
      {
        id: "find.replace",
        category: "Edit",
        label: "Replace",
        shortcut: "Mod+H",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: () => openFind("replace"),
      },
      {
        id: "selection.all",
        category: "Selection",
        label: "Select All",
        shortcutHint: "Mod+A",
        run: () => runEditing("selectAll"),
      },
      // These need the raw editor's multiple selections, which the rendered views do not have.
      {
        id: "selection.line",
        category: "Selection",
        label: "Select Line",
        shortcutHint: "Alt+L",
        isEnabled: isRawShown,
        run: () => runSelection(selectLine),
      },
      {
        id: "selection.nextOccurrence",
        category: "Selection",
        label: "Add Next Occurrence",
        shortcutHint: "Mod+D",
        isEnabled: isRawShown,
        run: () => runSelection(selectNextOccurrence),
      },
      {
        id: "selection.allOccurrences",
        category: "Selection",
        label: "Select All Occurrences",
        shortcutHint: "Mod+Shift+L",
        isEnabled: isRawShown,
        run: () => runSelection(selectSelectionMatches),
      },
      {
        id: "selection.cursorAbove",
        category: "Selection",
        label: "Add Cursor Above",
        shortcutHint: "Mod+Alt+Up",
        isEnabled: isRawShown,
        run: () => runSelection(addCursorAbove),
      },
      {
        id: "selection.cursorBelow",
        category: "Selection",
        label: "Add Cursor Below",
        shortcutHint: "Mod+Alt+Down",
        isEnabled: isRawShown,
        run: () => runSelection(addCursorBelow),
      },
      {
        id: "palette.commands",
        category: "View",
        label: "Show All Commands",
        shortcut: COMMANDS_SHORTCUT,
        isEnabled: !isPromptingForUnsavedChanges,
        run: () => setGoToQuery(COMMAND_QUERY_PREFIX),
      },
      {
        id: "view.explorer",
        category: "View",
        label: "Explorer",
        isChecked: isSidebarOpen,
        run: () => setIsSidebarOpen((previous) => !previous),
      },
      {
        id: "view.rawText",
        category: "View",
        label: "Raw Text",
        isChecked: isRawShown,
        isEnabled: canToggleView,
        run: () => handleViewModeChange(isRawShown ? "enriched" : "raw"),
      },
      {
        id: "view.wordWrap",
        category: "View",
        label: "Word Wrap",
        shortcut: "Alt+Z",
        isChecked: editorSettings.wordWrap,
        run: () => updateSettings({ editor: { wordWrap: !editorSettings.wordWrap } }),
      },
      {
        id: "view.lineNumbers",
        category: "View",
        label: "Line Numbers",
        isChecked: editorSettings.lineNumbers,
        run: () => updateSettings({ editor: { lineNumbers: !editorSettings.lineNumbers } }),
      },
      {
        id: "view.minimap",
        category: "View",
        label: "Minimap",
        isChecked: editorSettings.minimap,
        run: () => updateSettings({ editor: { minimap: !editorSettings.minimap } }),
      },
      {
        id: "view.vim",
        category: "View",
        label: "Vim Mode",
        isChecked: editorSettings.vim,
        run: () => updateSettings({ editor: { vim: !editorSettings.vim } }),
      },
      {
        id: "goto.file",
        category: "Go",
        label: "Go to File",
        shortcut: GO_TO_FILE_SHORTCUT,
        isEnabled: !isPromptingForUnsavedChanges && workspace !== null,
        run: () => setGoToQuery(""),
      },
      {
        id: "goto.line",
        category: "Go",
        label: "Go to Line",
        shortcut: "Mod+G",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: () => setGoToQuery(":"),
      },
      {
        id: "tabs.next",
        category: "Tabs",
        label: "Next Tab",
        isEnabled: !isPromptingForUnsavedChanges && documentsState.documents.length > 1,
        run: () => activateNeighborTab(1),
      },
      {
        id: "tabs.previous",
        category: "Tabs",
        label: "Previous Tab",
        isEnabled: !isPromptingForUnsavedChanges && documentsState.documents.length > 1,
        run: () => activateNeighborTab(-1),
      },
      {
        id: "tabs.moveLeft",
        category: "Tabs",
        label: "Move Tab Left",
        isEnabled: !isPromptingForUnsavedChanges && documentsState.documents.length > 1,
        run: () => moveActiveTab(-1),
      },
      {
        id: "tabs.moveRight",
        category: "Tabs",
        label: "Move Tab Right",
        isEnabled: !isPromptingForUnsavedChanges && documentsState.documents.length > 1,
        run: () => moveActiveTab(1),
      },
      {
        id: "help.shortcuts",
        category: "Settings",
        label: "Keyboard Shortcuts",
        run: () => setOpenDialog("shortcuts"),
      },
      { id: "help.about", category: "Settings", label: "About Vista", run: () => setOpenDialog("about") },
    ],
    [
      activateNeighborTab,
      moveActiveTab,
      activeDocument,
      adapter.platform,
      canToggleView,
      closeActiveDocument,
      closeAllDocuments,
      copyFullPath,
      copyText,
      documentsState.documents.length,
      editorSettings,
      handleAddFolder,
      handleOpenFolder,
      hasReadyFolder,
      handleViewModeChange,
      hasDirtyDocuments,
      isPromptingForUnsavedChanges,
      isRawShown,
      isSidebarOpen,
      openFind,
      requestNewEntry,
      revealEntry,
      runEditing,
      runSelection,
      saveActiveDocument,
      saveAllDocuments,
      updateSettings,
      workspace,
    ],
  );
  const editorMenuItems = useMemo(
    () => commandMenuEntries(isRawShown ? RAW_EDITOR_MENU : EDITOR_MENU, commands),
    [commands, isRawShown],
  );
  useCommandShortcuts(commands);
  // Every command, named with its category, except the one that opens this list.
  const paletteCommands = useMemo<PaletteCommand[]>(
    () =>
      sortByCategory(commands)
        .filter((command) => command.id !== "palette.commands")
        .map((command) => ({ command, title: `${command.category}: ${command.label}` })),
    [commands],
  );
  const handleRunPaletteCommand = useCallback((command: Command) => {
    // Closing the picker first returns focus to where it was, so editing commands act there.
    flushSync(() => setGoToQuery(null));
    void runCommand(command);
  }, []);
  // The title bar's field always opens on files, whatever is open, so it never changes meaning.
  const openGoToFile = useCallback(() => setGoToQuery(""), []);
  const dirtyKeys = useMemo(
    () => new Set(documentsState.documents.filter((doc) => doc.isDirty).map((doc) => doc.key)),
    [documentsState.documents],
  );
  const explorerFolders = useMemo<ExplorerFolder[]>(
    () => describeExplorerFolders(workspace?.folders ?? [], adapter.platform === "native"),
    [adapter.platform, workspace],
  );
  const startActions = useMemo<StartAction[]>(
    () => [
      {
        label: "Search files",
        icon: <i className="ic-search" aria-hidden="true" />,
        shortcut: GO_TO_FILE_SHORTCUT,
        onSelect: () => setGoToQuery(""),
      },
      {
        label: "Create a new file",
        icon: <i className="ic-file-plus" aria-hidden="true" />,
        onSelect: () => requestNewEntry("file"),
      },
      {
        label: "Show all commands",
        icon: <i className="ic-terminal" aria-hidden="true" />,
        shortcut: COMMANDS_SHORTCUT,
        onSelect: () => setGoToQuery(COMMAND_QUERY_PREFIX),
      },
      {
        label: "Keyboard shortcuts",
        icon: <i className="ic-keyboard" aria-hidden="true" />,
        onSelect: () => setOpenDialog("shortcuts"),
      },
    ],
    [requestNewEntry],
  );
  const reservedShortcuts = useMemo(
    () => commands.flatMap((command) => (command.shortcut ? [command.shortcut] : [])),
    [commands],
  );
  const handleCursorChange = useCallback((key: string, position: CursorInfo) => {
    setCursor((previous) =>
      previous?.key === key &&
      previous.position.line === position.line &&
      previous.position.column === position.column &&
      previous.position.selectionLength === position.selectionLength
        ? previous
        : { key, position },
    );
  }, []);
  const handleVimModeChange = useCallback((key: string, mode: string | null) => {
    setVimMode({ key, mode });
  }, []);
  const handleJumpApplied = useCallback(() => setPendingJump(null), []);
  const activeCursor = isRawShown && cursor?.key === activeDocument.key ? cursor.position : null;
  const activeVimMode = isRawShown && vimMode?.key === activeDocument.key ? vimMode.mode : null;

  return (
    <div
      data-platform={adapter.platform}
      className="bg-chrome text-text flex h-screen w-screen flex-col overflow-hidden"
    >
      {/* The title bar, rail, and explorer belong to a workspace: with none open there is nothing for
          them to show, so they are not there, and opening one brings them in around the frame. */}
      <AnimatePresence initial={false}>
        {currentWorkspace && (
          <ShellReveal key="title-bar" axis="height">
            <TitleBar
              isSidebarOpen={isSidebarOpen}
              hasExplorer={workspace !== null}
              onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
              onGoToFile={openGoToFile}
              switcher={
                <WorkspaceSwitcher
                  current={currentWorkspace}
                  recents={recents}
                  onSwitch={(workspaceId) => void handleOpenWorkspace(workspaceId)}
                  onOpenFolder={() => void handleOpenFolder()}
                  onOpenSettings={() => setOpenDialog("workspace")}
                />
              }
              goToFileShortcut={GO_TO_FILE_SHORTCUT}
            />
          </ShellReveal>
        )}
      </AnimatePresence>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          {workspace && (
            <ShellReveal key="rail" axis="width">
              <ActivityRail
                isExplorerOpen={isSidebarOpen}
                onToggleExplorer={() => setIsSidebarOpen((previous) => !previous)}
                onOpenSettings={() => setOpenDialog("appearance")}
              />
            </ShellReveal>
          )}
          {workspace && (
            <ShellReveal key="explorer" axis="width">
              <Sidebar
                activities={<DrawerActivities onOpenSettings={() => setOpenDialog("appearance")} />}
                folders={explorerFolders}
                activeEntry={
                  activeDocument ? { folderId: activeDocument.folderId, path: activeDocument.path } : undefined
                }
                dirtyKeys={dirtyKeys}
                expandedKeys={expandedKeys}
                onExpandedKeysChange={setExpandedKeys}
                onSelectFile={handleSelectFile}
                onAddFolder={() => void handleAddFolder()}
                isLoading={isLoading}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onCreateFile={handleCreateFile}
                onCreateDirectory={handleCreateDirectory}
                onRename={handleRename}
                onDelete={handleDelete}
                onCopyRelativePath={(entry) => void copyText(entry.path)}
                onCopyPath={copyFullPath}
                onReveal={revealEntry && ((entry) => void revealEntry(entry))}
                onRemoveFolder={
                  workspace && workspace.folders.length > 1
                    ? (folderId) => void handleRemoveFolder(folderId)
                    : undefined
                }
                onAllowAccess={(folderId) => void handleAllowAccess(folderId)}
                onLocate={(folderId) => void handleLocate(folderId)}
                newEntryRequest={newEntryRequest}
              />
            </ShellReveal>
          )}
        </AnimatePresence>
        {/* The document frame, a rounded panel set into the chrome on wide screens and edge to edge on
            narrow ones, with the status bar beneath it, aligned to its edges. The chrome's margin
            closes up on each side where a panel meets the frame. */}
        <div
          className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-(--ease-move) motion-reduce:transition-none md:pr-2 ${
            workspace && isSidebarOpen ? "" : "md:pl-2"
          } ${currentWorkspace ? "" : "md:pt-2"} ${shownDocument ? "" : "md:pb-2"}`}
        >
          <div className="bg-frame md:border-line md:rounded-frame flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:border">
            <TabStrip
              documents={documentsState.documents}
              activeKey={documentsState.activeKey}
              onActivate={(key) => dispatchDocuments({ type: "activate", key })}
              onReorder={(key, toIndex) => dispatchDocuments({ type: "reorder", key, toIndex })}
              onClose={(key) => closeDocuments([key])}
              onCloseMany={(keys) => closeDocuments(keys)}
              onCopyRelativePath={(path) => void copyText(path)}
              onCopyPath={copyFullPath}
              onReveal={revealEntry && ((doc) => void revealEntry(doc))}
              locate={locateDocument}
              actions={
                shownDocument && (
                  <DocumentActions
                    document={shownDocument}
                    onViewModeChange={handleViewModeChange}
                    isFindOpen={find !== null}
                    onFind={() => openFind("find")}
                    editorSettings={settings.editor}
                    onEditorSettingsChange={handleEditorSettingsChange}
                    onOpenSettings={() => setOpenDialog("editor")}
                  />
                )
              }
            />
            <EditorPane
              platform={adapter.platform}
              document={shownDocument}
              onContentChange={handleContentChange}
              onCursorChange={handleCursorChange}
              onVimModeChange={handleVimModeChange}
              rawEditorStates={rawEditorStatesRef.current}
              reservedShortcuts={reservedShortcuts}
              editorSettings={settings.editor}
              find={find}
              onFindClose={() => setFind(null)}
              pendingJump={pendingJump?.key === activeDocumentKey ? pendingJump.position : null}
              onJumpApplied={handleJumpApplied}
              contextMenuItems={editorMenuItems}
              loadImage={loadImage}
              emptyState={
                // Blank while a restored tab reads its file.
                pendingActive ? null : (
                  <StartScreen
                    workspaceName={workspace?.name ?? null}
                    isLoading={isLoading}
                    recents={recents}
                    onOpenFolder={() => void handleOpenFolder()}
                    onOpenRecent={(workspaceId) => void handleOpenWorkspace(workspaceId)}
                    onRemoveRecent={(workspaceId) => void handleRemoveRecent(workspaceId)}
                    actions={startActions}
                  />
                )
              }
            />
          </div>
          <AnimatePresence initial={false}>
            {shownDocument && (
              <ShellReveal key="status-bar" axis="height">
                <StatusBar
                  activeFile={shownDocument}
                  location={activeLocation}
                  copyPathLabel={adapter.platform === "native" ? "Copy Path" : "Copy Relative Path"}
                  onCopyPath={() => (copyFullPath ? copyFullPath(shownDocument) : void copyText(shownDocument.path))}
                  onReveal={revealEntry ? () => void revealEntry(shownDocument) : undefined}
                  cursor={activeCursor}
                  vimMode={activeVimMode}
                  onGoToLine={() => setGoToQuery(":")}
                />
              </ShellReveal>
            )}
          </AnimatePresence>
        </div>
      </div>
      {goToQuery !== null && (
        <GoToDialog
          // The field takes its starting text once, so a shortcut for another mode pressed while
          // the picker is open starts it over in that mode.
          key={goToQuery}
          files={goToFiles}
          commands={paletteCommands}
          initialQuery={goToQuery}
          hasCurrentFile={activeDocument !== null}
          onGo={(request) => void handleGoTo(request)}
          onRunCommand={handleRunPaletteCommand}
          onClose={() => setGoToQuery(null)}
        />
      )}
      {openDialog !== null && openDialog !== "workspace" && (
        <SettingsDialog
          section={openDialog}
          onSectionChange={setOpenDialog}
          settings={settings}
          onChange={updateSettings}
          theme={theme}
          commands={commands}
          platform={adapter.platform}
          version={APP_VERSION}
          onCheckForUpdates={adapter.updater ? () => checkForUpdates({ isRequested: true }) : undefined}
          onClose={() => setOpenDialog(null)}
        />
      )}
      {openDialog === "workspace" && currentWorkspace && (
        <WorkspaceSettingsDialog
          // A new name draft for each workspace, should the open one change underneath.
          key={currentWorkspace.id}
          workspace={currentWorkspace}
          onChange={handleChangeWorkspaceDetails}
          onAddFolder={() => void handleAddFolder()}
          onRemoveFolder={(folderId) => void handleRemoveFolder(folderId)}
          storage={workspace?.storage ?? "device"}
          canStoreInFolder={canStoreInFolder(workspace)}
          onChangeStorage={(storage) => void handleChangeStorage(storage)}
          onClose={() => setOpenDialog(null)}
        />
      )}
      {unsavedRequest && <UnsavedChangesDialog fileNames={unsavedRequest.fileNames} onChoose={handleUnsavedChoice} />}
    </div>
  );
}

/** Buffer contents, by document key, that the user saved or agreed to lose. */
type ApprovedEdits = ReadonlyMap<string, string>;

const NO_APPROVED_EDITS: ApprovedEdits = new Map();

const UNKNOWN_FOLDER_NAME = "Unknown folder";

/**
 * One file is named; several are listed by path, since names repeat across directories, and by
 * folder too when the workspace has several.
 */
function describeUnsavedDocuments(documents: readonly OpenDocument[], folders: readonly OpenFolder[]): string[] {
  if (documents.length === 1) {
    return documents.map((doc) => doc.name);
  }
  return documents.map((doc) => {
    const folder = folders.length > 1 ? folders.find((entry) => entry.id === doc.folderId) : undefined;
    return folder ? `${folder.name} / ${doc.path}` : doc.path;
  });
}

function describeUnreachableWorkspace(record: WorkspaceRecord, goneNames: readonly string[]): string {
  const [only] = goneNames;
  return goneNames.length === 1 && record.folderIds.length === 1
    ? `Couldn't reopen "${only}". It may have been moved or deleted.`
    : `Couldn't reopen "${record.name}". Its folders may have been moved or deleted.`;
}

/**
 * The folders as the explorer shows them. Same-named folders get their parent location on desktop,
 * where there is one to show.
 */
function describeExplorerFolders(folders: readonly OpenFolder[], hasLocations: boolean): ExplorerFolder[] {
  return folders.map((entry, index) => {
    const { id, name, folder, status, tree } = entry;
    const isNameShared = folders.some((other) => other.id !== id && other.name === name);
    const location = hasLocations && isNameShared && folder ? parentLocation(folder.rootPath) : undefined;
    const canLocate = index > 0 && status === "unavailable" && entry.location !== undefined;
    return { id, name, status, tree, ...(location ? { location } : {}), ...(canLocate ? { canLocate } : {}) };
  });
}

function parentLocation(rootPath: string): string {
  const trimmed = rootPath.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return separatorIndex > 0 ? trimmed.slice(0, separatorIndex) : trimmed.slice(0, separatorIndex + 1);
}

function describeLostEdits(dirtyDocuments: readonly OpenDocument[]): string {
  const [first] = dirtyDocuments;
  if (!first) {
    return "";
  }
  return dirtyDocuments.length === 1
    ? `Unsaved changes in "${first.name}" will be lost.`
    : `Unsaved changes in ${dirtyDocuments.length} open files will be lost.`;
}

function describeDeletedDocuments(documents: readonly OpenDocument[]): string {
  const [first] = documents;
  return documents.length === 1 && first
    ? `"${first.name}" was deleted.`
    : `${documents.length} open files were deleted.`;
}

function describeExternalChanges(documents: readonly OpenDocument[]): string {
  const [first] = documents;
  return documents.length === 1 && first
    ? `"${first.name}" changed on disk. Saving it will ask before overwriting the other version.`
    : `${documents.length} open files changed on disk. Saving them will ask before overwriting the other versions.`;
}

// One decimal, rounded up, so a file just over the limit never reads as equal to it.
function formatMegabytes(bytes: number): string {
  return (Math.ceil((bytes / BYTES_PER_MB) * 10) / 10).toFixed(1);
}

/** Joins a workspace-relative path onto a native root path, with the separator the root uses. */
function joinAbsolutePath(rootPath: string, path: string): string {
  if (path === "") {
    return rootPath;
  }
  const separator = rootPath.includes("\\") ? "\\" : "/";
  return `${rootPath.replace(/[\\/]+$/, "")}${separator}${path.split("/").join(separator)}`;
}

/** Lists the paths of every file in a tree, for the go-to picker. */
function listFilePaths(nodes: readonly WorkspaceNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === "file" ? [node.path] : listFilePaths(node.children ?? [])));
}

/**
 * Finds the node at a folder-relative path anywhere in a tree.
 *
 * @param nodes - Nodes to search, including their descendants.
 * @param path - Folder-relative path to find.
 * @returns The matching node, or undefined if no node has that path.
 */
function findTreeNode(nodes: WorkspaceNode[], path: string): WorkspaceNode | undefined {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    const descendant = node.children ? findTreeNode(node.children, path) : undefined;
    if (descendant) {
      return descendant;
    }
  }
  return undefined;
}

/** The `documentKey`s of a session's expanded folders, for the folders of the workspace. */
function toExpandedKeys(opened: OpenWorkspace, session: Session): Set<string> {
  return new Set(
    opened.folders.flatMap((folder) => (session.expanded[folder.id] ?? []).map((path) => documentKey(folder.id, path))),
  );
}

/** The workspace's session as it is now: its tabs, the active one, and the expanded folders. */
function describeSession(
  workspace: OpenWorkspace,
  { documents, activeKey }: DocumentsState,
  expandedKeys: ReadonlySet<string>,
): Session {
  const expanded: Record<string, string[]> = {};
  for (const folder of workspace.folders) {
    const prefix = documentKey(folder.id, "");
    const paths = [...expandedKeys].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
    if (paths.length > 0) {
      expanded[folder.id] = paths;
    }
  }
  return {
    version: 1,
    tabs: documents.map(({ folderId, path, viewMode }) => ({ folderId, path, viewMode })),
    activeIndex: documents.findIndex((doc) => doc.key === activeKey),
    expanded,
  };
}

/**
 * Where the active tab is among the restored ones. When its file is gone, the next restored tab
 * after it is active, or else the closest one before it.
 */
function findRestoredActiveIndex(
  tabs: readonly RestoredTab[],
  kept: readonly RestoredTab[],
  active: RestoredTab | undefined,
): number {
  if (!active || kept.length === 0) {
    return -1;
  }
  const activeAt = tabs.indexOf(active);
  const after = kept.findIndex((tab) => tabs.indexOf(tab) >= activeAt);
  return after === -1 ? kept.length - 1 : after;
}

function describeGoneSessionFiles(gone: readonly RestoredTab[]): string {
  const [only] = gone;
  if (gone.length === 1 && only) {
    return `"${only.path.split("/").pop() ?? only.path}" from your last session no longer exists.`;
  }
  return `${gone.length} files from your last session no longer exist.`;
}

function summarizeFolders(folders: readonly OpenFolder[]): RecentWorkspace["folders"] {
  return folders.map(({ id, name, status }) => ({ id, name, status }));
}

function summarizeRestored(results: readonly (readonly [string, RestoreFolderResult])[]): RecentWorkspace["folders"] {
  return results.map(([id, result]): { id: string; name: string; status: FolderStatus } => {
    switch (result.status) {
      case "restored":
        return { id, name: result.folder.name, status: "ready" };
      case "needs-permission":
      case "unavailable":
        return { id, name: result.name, status: result.status };
      case "none":
        return { id, name: UNKNOWN_FOLDER_NAME, status: "unavailable" };
    }
  });
}

function withLocations(record: WorkspaceRecord, folders: OpenFolder[]): OpenWorkspace {
  const { id, name, icon, color, storage } = record;
  if (record.storage === "device") {
    return { id, name, icon, color, storage, folders };
  }
  const locationOf = new Map(Object.entries(record.locations).map(([location, folderId]) => [folderId, location]));
  return {
    id,
    name,
    icon,
    color,
    storage,
    folders: folders.map((entry, index) => ({
      ...entry,
      location: index === 0 ? HOME_FOLDER_LOCATION : (entry.location ?? locationOf.get(entry.id) ?? `../${entry.name}`),
    })),
  };
}

function describeWorkspaceFile(workspace: OpenWorkspace) {
  return {
    name: workspace.name,
    icon: workspace.icon,
    color: workspace.color,
    folders: workspace.folders.map((entry, index) =>
      index === 0 ? HOME_FOLDER_LOCATION : (entry.location ?? `../${entry.name}`),
    ),
  };
}

// The file needs a home folder Vista can write to, and every folder remembered past this session.
function canStoreInFolder(workspace: OpenWorkspace | null): boolean {
  const home = workspace?.folders[0]?.folder;
  return Boolean(home) && !workspace?.folders.some((entry) => entry.folder?.accessMode === "fallback");
}

function describeFileWriteFailure(homeName: string, err: unknown): string {
  const reason = err instanceof Error ? ` ${err.message}` : "";
  return `Couldn't store the details in "${homeName}/${WORKSPACE_FILE_DIRECTORY}".${reason}`;
}

/** A folder of a workspace in the order its file lists them: restored, or a location not found here. */
type FolderSlot =
  | { kind: "folder"; id: string; result: RestoreFolderResult; location?: string }
  | { kind: "missing"; location: string };

const MISSING_FOLDER_PREFIX = "missing:";

/**
 * The folder at a location of a workspace's file: the one this device found there before, or what
 * the host finds there now. Null when neither knows it.
 */
async function findLocatedFolder(
  home: WorkspaceFolder,
  location: string,
  knownId: string | undefined,
  { restore, resolveRelative }: FindLocatedFolderSources,
): Promise<{ id: string; result: RestoreFolderResult } | null> {
  if (knownId !== undefined) {
    const result = await restore(knownId);
    if (result.status !== "none") {
      return { id: knownId, result };
    }
  }
  const folder = resolveRelative ? await resolveRelative(home, location) : null;
  return folder ? { id: folder.id, result: { status: "restored", folder } } : null;
}

interface FindLocatedFolderSources {
  restore: (id: string) => Promise<RestoreFolderResult>;
  resolveRelative?: (from: WorkspaceFolder, location: string) => Promise<WorkspaceFolder | null>;
}

function missingFolder(location: string): OpenFolder {
  const name = location.split("/").findLast((part) => part !== "" && part !== "." && part !== "..") ?? location;
  return { id: `${MISSING_FOLDER_PREFIX}${location}`, name, folder: null, status: "unavailable", tree: [], location };
}

function isMissingFolder(entry: OpenFolder): boolean {
  return entry.id.startsWith(MISSING_FOLDER_PREFIX);
}

function describeUnreadableFile(folderName: string): string {
  return `"${folderName}" has workspace details this version of Vista can't read, so it opened as a plain folder.`;
}
