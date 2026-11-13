import { addCursorAbove, addCursorBelow, selectLine } from "@codemirror/commands";
import { selectNextOccurrence, selectSelectionMatches } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { runCommand, useCommandShortcuts, type Command } from "./commands";
import { findCodeMirrorView, runEditingAction, type EditingAction } from "./commands/editing";
import { EditorPane, type FindRequest } from "./components/editor/editor-pane";
import type { FindMode } from "./components/editor/find-bar";
import type { CursorInfo, EditorPosition, RawEditorStateCache } from "./components/editor/raw-editor";
import { ToastProvider, useToast } from "./components/feedback/toast";
import { UnsavedChangesDialog, type UnsavedChangesChoice } from "./components/feedback/unsaved-changes-dialog";
import { AboutDialog, KeyboardShortcutsDialog } from "./components/help/help-dialog";
import { Sidebar, type NewEntryRequest } from "./components/layout/sidebar";
import { StartScreen, type StartAction } from "./components/layout/start-screen";
import { StatusBar } from "./components/layout/status-bar";
import { TabStrip } from "./components/layout/tab-strip";
import { TitleBar } from "./components/layout/title-bar";
import { MENU_SEPARATOR } from "./components/menu/menu";
import { commandMenuEntries, type MenuBarMenu } from "./components/menu/menu-bar";
import {
  COMMAND_QUERY_PREFIX,
  GoToDialog,
  type GoToRequest,
  type PaletteCommand,
} from "./components/navigation/go-to-dialog";
import { SettingsDialog } from "./components/settings/settings-dialog";
import { imageMimeType, resolveImageSource } from "./domain/image-source";
import { joinWorkspacePath } from "./domain/path-validation";
import { BYTES_PER_MB, type EditorSettings } from "./domain/settings";
import { encodeText } from "./domain/text-codec";
import { getViewer } from "./domain/viewers";
import { isDesktopViewport } from "./domain/viewport";
import {
  WorkspaceError,
  type AppAdapter,
  type FileStat,
  type RestoreFolderResult,
  type ViewMode,
  type Workspace,
  type WorkspaceNode,
} from "./ports";
import {
  documentKey,
  documentsReducer,
  findAffectedDocuments,
  getActiveDocument,
  INITIAL_DOCUMENTS_STATE,
  isSameStat,
  type OpenDocument,
} from "./state/documents";
import { loadFile } from "./state/load-file";
import { useSettings } from "./state/settings";
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

/** The application menus, by command id. */
const MENUS: readonly MenuBarMenu[] = [
  {
    label: "File",
    items: [
      "file.openFolder",
      "file.newFile",
      "file.newFolder",
      MENU_SEPARATOR,
      "file.save",
      "file.saveAll",
      MENU_SEPARATOR,
      "file.settings",
      MENU_SEPARATOR,
      "tabs.close",
      "tabs.closeAll",
    ],
  },
  {
    label: "Edit",
    items: [
      "edit.undo",
      "edit.redo",
      MENU_SEPARATOR,
      "edit.cut",
      "edit.copy",
      "edit.paste",
      MENU_SEPARATOR,
      "find.find",
      "find.replace",
    ],
  },
  {
    label: "Selection",
    items: [
      "selection.all",
      "selection.line",
      MENU_SEPARATOR,
      "selection.nextOccurrence",
      "selection.allOccurrences",
      MENU_SEPARATOR,
      "selection.cursorAbove",
      "selection.cursorBelow",
    ],
  },
  {
    label: "View",
    items: [
      "palette.commands",
      MENU_SEPARATOR,
      "view.explorer",
      "view.rawText",
      MENU_SEPARATOR,
      "view.wordWrap",
      "view.lineNumbers",
      "view.minimap",
      "view.vim",
      MENU_SEPARATOR,
      "view.theme",
    ],
  },
  { label: "Go", items: ["goto.file", "goto.line", MENU_SEPARATOR, "tabs.next", "tabs.previous"] },
  { label: "Help", items: ["help.shortcuts", MENU_SEPARATOR, "help.about"] },
];

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
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tree, setTree] = useState<WorkspaceNode[]>([]);
  const [documentsState, dispatchDocuments] = useReducer(documentsReducer, INITIAL_DOCUMENTS_STATE);
  // Starts true when restore will run, so the explorer never flashes its "Open Folder" state.
  const [isLoading, setIsLoading] = useState(adapter.workspace.isSupported);
  // Defaults to open at `md` and above (a persistent column there) and closed below it (a
  // transient overlay drawer), matching the breakpoint Sidebar itself switches behavior at.
  const [isSidebarOpen, setIsSidebarOpen] = useState(isDesktopViewport);
  const [restorableFolderName, setRestorableFolderName] = useState<string | null>(null);
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
  const [helpDialog, setHelpDialog] = useState<"shortcuts" | "about" | "settings" | null>(null);
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
  const hasDirtyDocuments = documentsState.documents.some((doc) => doc.isDirty);
  const isPromptingForUnsavedChanges = unsavedRequest !== null;
  const isPromptingRef = useRef(isPromptingForUnsavedChanges);
  isPromptingRef.current = isPromptingForUnsavedChanges;

  const saveDocument = useCallback(
    async (key: string): Promise<boolean> => {
      const doc = documentsRef.current.documents.find((candidate) => candidate.key === key);
      const target = workspaceRef.current;
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
    [adapter.workspace, toast],
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
        setUnsavedRequest({ fileNames: describeUnsavedDocuments(pendingDocuments), resolve });
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

  // Checked once per launch. A failed check is quiet: being offline is not something to interrupt the user about.
  useEffect(() => {
    const updater = adapter.updater;
    if (!updater) {
      return;
    }
    let isCancelled = false;
    const offerUpdate = async () => {
      let update;
      try {
        update = await updater.check();
      } catch (err) {
        console.warn("Could not check for updates:", err);
        return;
      }
      if (!update || isCancelled) {
        return;
      }
      const accepted = await toast.confirm({
        title: `Vista ${update.version} is available`,
        message: "Install it now? Vista restarts to finish, and asks about unsaved changes first.",
        confirmLabel: "Install and Restart",
        cancelLabel: "Later",
      });
      if (!accepted || isCancelled || (await confirmUnsavedChangesRef.current()) === null) {
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
    };
    void offerUpdate();
    return () => {
      isCancelled = true;
    };
  }, [adapter.updater, toast]);

  /**
   * Makes a workspace the active root by reading its tree first, so a failed read leaves the
   * previous state intact rather than showing a root with no contents.
   *
   * @param opened - The workspace to adopt.
   * @param approvedEdits - Unsaved edits the user already agreed to lose or saved before the
   *   folder was picked. Edits made while the tree loads are asked about again.
   * @throws If the workspace tree cannot be read.
   */
  const adoptWorkspace = useCallback(
    async (opened: Workspace, approvedEdits?: ApprovedEdits) => {
      const nodes = await adapter.workspace.readTree(opened);
      if (!(await confirmUnsavedChangesInAllDocuments(approvedEdits))) {
        return;
      }
      setWorkspace(opened);
      setTree(nodes);
      dispatchDocuments({ type: "close", keys: documentsRef.current.documents.map((doc) => doc.key) });
      setRestorableFolderName(null);
      if (opened.accessMode === "fallback") {
        toast.show({
          kind: "info",
          text: "This browser can't write files directly, so saving will download a copy instead.",
        });
      }
    },
    [adapter.workspace, confirmUnsavedChangesInAllDocuments, toast],
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
      const opened = await adapter.workspace.openFolder();
      if (!opened) {
        return;
      }
      setIsLoading(true);
      await adoptWorkspace(opened, approvedEdits);
      // Shows the files of the folder the user just picked, also where the explorer is a drawer.
      setIsSidebarOpen(true);
    } catch (err) {
      console.error("Failed to open folder:", err);
      const message = err instanceof Error ? err.message : "Failed to open the selected folder.";
      toast.show({ kind: "error", text: message });
    } finally {
      setIsLoading(false);
    }
  }, [adapter.workspace, adoptWorkspace, confirmUnsavedChangesInAllDocuments, toast]);

  /**
   * Acts on the outcome of a folder restore. A folder that needs permission is remembered so the
   * explorer can offer a reopen button, and a folder that is gone is reported to the user.
   *
   * @param result - The outcome returned by `restoreFolder`.
   * @param approvedEdits - Unsaved edits the user already agreed to lose or saved.
   * @throws If the restored workspace tree cannot be read.
   */
  const applyRestoreResult = useCallback(
    async (result: RestoreFolderResult, approvedEdits?: ApprovedEdits) => {
      switch (result.status) {
        case "restored":
          await adoptWorkspace(result.workspace, approvedEdits);
          return;
        case "needs-permission":
          setRestorableFolderName(result.name);
          return;
        case "unavailable":
          // The host has already forgotten the folder, so a reopen button would lead nowhere.
          setRestorableFolderName(null);
          toast.show({
            kind: "info",
            text: `Couldn't reopen "${result.name}". It may have been moved or deleted.`,
          });
          return;
        case "none":
          return;
      }
    },
    [adoptWorkspace, toast],
  );

  const restoreLastFolder = useCallback(async () => {
    try {
      const result = await adapter.workspace.restoreFolder({ interactive: false });
      await applyRestoreResult(result);
    } catch (err) {
      console.error("Failed to restore the last folder:", err);
      const message = err instanceof Error ? err.message : "Failed to restore the last folder.";
      toast.show({ kind: "error", text: message });
    } finally {
      setIsLoading(false);
    }
  }, [adapter.workspace, applyRestoreResult, toast]);

  useEffect(() => {
    if (!adapter.workspace.isSupported || startupRestoreRef.current) {
      return;
    }
    startupRestoreRef.current = restoreLastFolder();
  }, [adapter.workspace.isSupported, restoreLastFolder]);

  const handleReopenFolder = useCallback(async () => {
    const approvedEdits = await confirmUnsavedChangesInAllDocuments();
    if (!approvedEdits) {
      return;
    }
    try {
      const result = await adapter.workspace.restoreFolder({ interactive: true });
      await applyRestoreResult(result, approvedEdits);
      if (result.status === "restored") {
        setIsSidebarOpen(true);
      }
    } catch (err) {
      console.error("Failed to reopen the folder:", err);
      const message = err instanceof Error ? err.message : "Failed to reopen the folder.";
      toast.show({ kind: "error", text: message });
    }
  }, [adapter.workspace, applyRestoreResult, confirmUnsavedChangesInAllDocuments, toast]);

  const refreshTree = useCallback(async () => {
    if (!workspace) {
      return;
    }
    try {
      const nodes = await adapter.workspace.readTree(workspace);
      setTree(nodes);
    } catch (err) {
      console.error("Failed to refresh the file list:", err);
      const message = err instanceof Error ? err.message : "Failed to refresh the file list.";
      toast.show({ kind: "error", text: message });
    }
  }, [workspace, adapter.workspace, toast]);

  /** Opens a file in a tab, or switches to its tab; resolves to whether it is now the active tab. */
  const handleSelectFile = useCallback(
    async (path: string): Promise<boolean> => {
      if (!workspace) {
        return false;
      }
      const key = documentKey(workspace.id, path);
      // Selecting an open file only switches to its tab; reloading it would discard unsaved edits.
      if (documentsRef.current.documents.some((doc) => doc.key === key)) {
        dispatchDocuments({ type: "activate", key });
        return true;
      }
      const name = path.split("/").pop() ?? path;
      try {
        const result = await loadFile(adapter.workspace, {
          workspace,
          path,
          maxBytes: settings.files.maxOpenSizeMb * BYTES_PER_MB,
        });
        // A folder opened during the read makes this path meaningless, and saving it would write
        // into the new folder. Hosts may reuse ids for same-named folders, so compare identity.
        if (workspaceRef.current !== workspace) {
          return false;
        }
        switch (result.kind) {
          case "missing":
            toast.show({ kind: "error", text: `"${name}" no longer exists. It may have been moved or deleted.` });
            void refreshTree();
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
        dispatchDocuments({ type: "open", workspaceId: workspace.id, path, file: result.file });
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
    [adapter.workspace, refreshTree, settings.files.maxOpenSizeMb, toast, workspace],
  );

  const isRecheckingRef = useRef(false);

  /**
   * Compares the tree and each open tab with the disk, since other programs change files while
   * Vista is in the background. A clean tab reloads; a tab with unsaved edits, or whose file is
   * gone, is marked, and saving it later asks before overwriting.
   */
  const recheckDisk = useCallback(async () => {
    const target = workspaceRef.current;
    if (!target || isRecheckingRef.current) {
      return;
    }
    isRecheckingRef.current = true;
    try {
      try {
        const nodes = await adapter.workspace.readTree(target);
        if (workspaceRef.current === target) {
          setTree(nodes);
        }
      } catch (err) {
        // Quiet: the user did not ask for this refresh, and the tree on screen is still usable.
        console.error("Failed to refresh the file list:", err);
      }
      const maxBytes = settings.files.maxOpenSizeMb * BYTES_PER_MB;
      const marked: OpenDocument[] = [];
      await Promise.all(
        documentsRef.current.documents.map(async (doc) => {
          try {
            const stat = await adapter.workspace.stat(target, doc.path);
            if (workspaceRef.current !== target || (stat !== null && isSameStat(stat, doc.diskStat))) {
              return;
            }
            const current = documentsRef.current.documents.find((candidate) => candidate.key === doc.key);
            if (!current) {
              return;
            }
            if (stat !== null && !current.isDirty) {
              const result = await loadFile(adapter.workspace, { workspace: target, path: doc.path, maxBytes });
              if (workspaceRef.current !== target) {
                return;
              }
              if (result.kind === "loaded") {
                // The reducer keeps the buffer if it was edited during the read, and marks it.
                dispatchDocuments({ type: "reloaded", key: doc.key, file: result.file });
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
  }, [adapter.workspace, settings.files.maxOpenSizeMb, toast]);

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
    async (parentPath: string, name: string) => {
      if (!workspace) {
        return;
      }
      try {
        await adapter.workspace.createFile(workspace, joinWorkspacePath(parentPath, name));
        await refreshTree();
      } catch (err) {
        console.error("Failed to create file:", err);
        const message = err instanceof Error ? err.message : `Failed to create "${name}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, refreshTree, toast, workspace],
  );

  const handleCreateDirectory = useCallback(
    async (parentPath: string, name: string) => {
      if (!workspace) {
        return;
      }
      try {
        await adapter.workspace.createDirectory(workspace, joinWorkspacePath(parentPath, name));
        await refreshTree();
      } catch (err) {
        console.error("Failed to create folder:", err);
        const message = err instanceof Error ? err.message : `Failed to create "${name}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, refreshTree, toast, workspace],
  );

  const handleRename = useCallback(
    async (fromPath: string, toPath: string) => {
      if (!workspace) {
        return;
      }
      try {
        await adapter.workspace.move(workspace, fromPath, toPath);
        dispatchDocuments({ type: "move", workspaceId: workspace.id, fromPath, toPath });
        await refreshTree();
      } catch (err) {
        console.error("Failed to rename entry:", err);
        const message = err instanceof Error ? err.message : `Failed to rename "${fromPath}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, refreshTree, toast, workspace],
  );

  const handleDelete = useCallback(
    async (path: string) => {
      if (!workspace) {
        return;
      }
      const node = findTreeNode(tree, path);
      const name = node?.name ?? path;
      const isDirectory = node?.kind === "directory";
      const dirtyDocuments = findAffectedDocuments(documentsRef.current, { workspaceId: workspace.id, path }).filter(
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
        await adapter.workspace.remove(workspace, path);
        const deletedDocuments = findAffectedDocuments(documentsRef.current, { workspaceId: workspace.id, path });
        if (deletedDocuments.length > 0) {
          toast.show({ kind: "info", text: describeDeletedDocuments(deletedDocuments) });
          dispatchDocuments({ type: "close", keys: deletedDocuments.map((doc) => doc.key) });
        }
        await refreshTree();
      } catch (err) {
        console.error("Failed to delete entry:", err);
        const message = err instanceof Error ? err.message : `Failed to delete "${path}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, refreshTree, toast, tree, workspace],
  );

  const openFind = useCallback((mode: FindMode) => {
    setFind((previous) => ({ mode, focusRequest: (previous?.focusRequest ?? 0) + 1 }));
  }, []);

  /**
   * Opens the file a go-to request names, or stays in the current one, and moves the raw editor's
   * cursor to the requested position. A position needs the raw view, so the tab switches to it.
   */
  const handleGoTo = useCallback(
    async ({ path, line, column }: GoToRequest) => {
      setGoToQuery(null);
      let key = activeDocumentKey;
      if (path !== null) {
        if (!workspace || !(await handleSelectFile(path))) {
          return;
        }
        key = documentKey(workspace.id, path);
      }
      if (key === null || line === undefined) {
        return;
      }
      dispatchDocuments({ type: "setViewMode", key, viewMode: "raw" });
      setPendingJump({ key, position: { line, column } });
    },
    [activeDocumentKey, handleSelectFile, workspace],
  );

  const filePaths = useMemo(() => listFilePaths(tree), [tree]);

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

  const runEditing = useCallback(
    async (action: EditingAction) => {
      if (!(await runEditingAction(action))) {
        // Reading the clipboard needs a permission the keyboard shortcut does not.
        toast.show({ kind: "info", text: "Press Ctrl+V to paste." });
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
      if (!activeDocument || !workspace) {
        return null;
      }
      const source = resolveImageSource(src, activeDocument.path);
      if (source.kind === "url") {
        return source.url;
      }
      if (source.kind === "none") {
        return null;
      }
      const { bytes } = await adapter.workspace.readFile(workspace, source.path);
      return new Blob([bytes], { type: imageMimeType(source.path) });
    },
    [activeDocument, adapter.workspace, workspace],
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

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "file.openFolder",
        label: "Open Folder…",
        isEnabled: !isPromptingForUnsavedChanges,
        run: handleOpenFolder,
      },
      {
        id: "file.newFile",
        label: "New File",
        isEnabled: !isPromptingForUnsavedChanges && workspace !== null,
        run: () => requestNewEntry("file"),
      },
      {
        id: "file.newFolder",
        label: "New Folder",
        isEnabled: !isPromptingForUnsavedChanges && workspace !== null,
        run: () => requestNewEntry("directory"),
      },
      {
        id: "file.save",
        label: "Save",
        shortcut: "Mod+S",
        // A second prompt over a pending one would leave the first flow waiting forever.
        isEnabled: !isPromptingForUnsavedChanges && (activeDocument?.isDirty ?? false),
        run: saveActiveDocument,
      },
      {
        id: "file.saveAll",
        label: "Save All",
        isEnabled: !isPromptingForUnsavedChanges && hasDirtyDocuments,
        run: saveAllDocuments,
      },
      {
        id: "file.settings",
        label: "Settings…",
        shortcut: "Mod+,",
        isEnabled: !isPromptingForUnsavedChanges,
        run: () => setHelpDialog("settings"),
      },
      {
        id: "tabs.close",
        label: "Close Tab",
        // Browsers reserve Ctrl+W for closing their own tab, so the web host uses Alt+W.
        shortcut: adapter.platform === "native" ? "Mod+W" : "Alt+W",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: closeActiveDocument,
      },
      {
        id: "tabs.closeAll",
        label: "Close All Tabs",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: closeAllDocuments,
      },
      // The editors handle these keys themselves, so the menus only show them.
      { id: "edit.undo", label: "Undo", shortcutHint: "Mod+Z", run: () => runEditing("undo") },
      { id: "edit.redo", label: "Redo", shortcutHint: "Mod+Y", run: () => runEditing("redo") },
      { id: "edit.cut", label: "Cut", shortcutHint: "Mod+X", run: () => runEditing("cut") },
      { id: "edit.copy", label: "Copy", shortcutHint: "Mod+C", run: () => runEditing("copy") },
      { id: "edit.paste", label: "Paste", shortcutHint: "Mod+V", run: () => runEditing("paste") },
      {
        id: "find.find",
        label: "Find",
        shortcut: "Mod+F",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: () => openFind("find"),
      },
      {
        id: "find.replace",
        label: "Replace",
        shortcut: "Mod+H",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: () => openFind("replace"),
      },
      { id: "selection.all", label: "Select All", shortcutHint: "Mod+A", run: () => runEditing("selectAll") },
      // These need the raw editor's multiple selections, which the rendered views do not have.
      {
        id: "selection.line",
        label: "Select Line",
        shortcutHint: "Alt+L",
        isEnabled: isRawShown,
        run: () => runSelection(selectLine),
      },
      {
        id: "selection.nextOccurrence",
        label: "Add Next Occurrence",
        shortcutHint: "Mod+D",
        isEnabled: isRawShown,
        run: () => runSelection(selectNextOccurrence),
      },
      {
        id: "selection.allOccurrences",
        label: "Select All Occurrences",
        shortcutHint: "Mod+Shift+L",
        isEnabled: isRawShown,
        run: () => runSelection(selectSelectionMatches),
      },
      {
        id: "selection.cursorAbove",
        label: "Add Cursor Above",
        shortcutHint: "Mod+Alt+Up",
        isEnabled: isRawShown,
        run: () => runSelection(addCursorAbove),
      },
      {
        id: "selection.cursorBelow",
        label: "Add Cursor Below",
        shortcutHint: "Mod+Alt+Down",
        isEnabled: isRawShown,
        run: () => runSelection(addCursorBelow),
      },
      {
        id: "palette.commands",
        label: "Show All Commands",
        shortcut: COMMANDS_SHORTCUT,
        isEnabled: !isPromptingForUnsavedChanges,
        run: () => setGoToQuery(COMMAND_QUERY_PREFIX),
      },
      {
        id: "view.explorer",
        label: "Explorer",
        isChecked: isSidebarOpen,
        run: () => setIsSidebarOpen((previous) => !previous),
      },
      {
        id: "view.rawText",
        label: "Raw Text",
        isChecked: isRawShown,
        isEnabled: canToggleView,
        run: () => handleViewModeChange(isRawShown ? "enriched" : "raw"),
      },
      {
        id: "view.wordWrap",
        label: "Word Wrap",
        shortcut: "Alt+Z",
        isChecked: editorSettings.wordWrap,
        run: () => updateSettings({ editor: { wordWrap: !editorSettings.wordWrap } }),
      },
      {
        id: "view.lineNumbers",
        label: "Line Numbers",
        isChecked: editorSettings.lineNumbers,
        run: () => updateSettings({ editor: { lineNumbers: !editorSettings.lineNumbers } }),
      },
      {
        id: "view.minimap",
        label: "Minimap",
        isChecked: editorSettings.minimap,
        run: () => updateSettings({ editor: { minimap: !editorSettings.minimap } }),
      },
      {
        id: "view.vim",
        label: "Vim Mode",
        isChecked: editorSettings.vim,
        run: () => updateSettings({ editor: { vim: !editorSettings.vim } }),
      },
      {
        id: "view.theme",
        label: theme.theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme",
        run: theme.toggleTheme,
      },
      {
        id: "goto.file",
        label: "Go to File",
        shortcut: GO_TO_FILE_SHORTCUT,
        isEnabled: !isPromptingForUnsavedChanges && workspace !== null,
        run: () => setGoToQuery(""),
      },
      {
        id: "goto.line",
        label: "Go to Line",
        shortcut: "Mod+G",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: () => setGoToQuery(":"),
      },
      {
        id: "tabs.next",
        label: "Next Tab",
        isEnabled: !isPromptingForUnsavedChanges && documentsState.documents.length > 1,
        run: () => activateNeighborTab(1),
      },
      {
        id: "tabs.previous",
        label: "Previous Tab",
        isEnabled: !isPromptingForUnsavedChanges && documentsState.documents.length > 1,
        run: () => activateNeighborTab(-1),
      },
      { id: "help.shortcuts", label: "Keyboard Shortcuts", run: () => setHelpDialog("shortcuts") },
      { id: "help.about", label: "About Vista", run: () => setHelpDialog("about") },
    ],
    [
      activateNeighborTab,
      activeDocument,
      adapter.platform,
      canToggleView,
      closeActiveDocument,
      closeAllDocuments,
      documentsState.documents.length,
      editorSettings,
      handleOpenFolder,
      handleViewModeChange,
      hasDirtyDocuments,
      isPromptingForUnsavedChanges,
      isRawShown,
      isSidebarOpen,
      openFind,
      requestNewEntry,
      runEditing,
      runSelection,
      saveActiveDocument,
      saveAllDocuments,
      theme,
      updateSettings,
      workspace,
    ],
  );
  const editorMenuItems = useMemo(
    () => commandMenuEntries(isRawShown ? RAW_EDITOR_MENU : EDITOR_MENU, commands),
    [commands, isRawShown],
  );
  useCommandShortcuts(commands);
  // Every menu command, named with its menu, except the one that opens this list.
  const paletteCommands = useMemo<PaletteCommand[]>(
    () =>
      MENUS.flatMap((menu) =>
        menu.items.flatMap((id) => {
          const command = id === "palette.commands" ? undefined : commands.find((candidate) => candidate.id === id);
          return command ? [{ command, title: `${menu.label}: ${command.label}` }] : [];
        }),
      ),
    [commands],
  );
  const handleRunPaletteCommand = useCallback((command: Command) => {
    // Closing the picker first returns focus to where it was, so editing commands act there.
    flushSync(() => setGoToQuery(null));
    void runCommand(command);
  }, []);
  // Without a folder there are no files to find, so the search field lists commands instead.
  const openSearch = useCallback(() => setGoToQuery(workspace ? "" : COMMAND_QUERY_PREFIX), [workspace]);
  const dirtyPaths = useMemo(
    () => new Set(documentsState.documents.filter((doc) => doc.isDirty).map((doc) => doc.path)),
    [documentsState.documents],
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
        onSelect: () => setHelpDialog("shortcuts"),
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
      className="bg-foreground text-text flex h-screen w-screen flex-col overflow-hidden"
    >
      <TitleBar
        menus={MENUS}
        commands={commands}
        theme={theme}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onSearch={openSearch}
        searchShortcut={workspace ? GO_TO_FILE_SHORTCUT : COMMANDS_SHORTCUT}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          workspace={workspace}
          tree={tree}
          activePath={activeDocument?.path}
          dirtyPaths={dirtyPaths}
          onSelectFile={handleSelectFile}
          onOpenFolder={handleOpenFolder}
          isLoading={isLoading}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onCreateFile={handleCreateFile}
          onCreateDirectory={handleCreateDirectory}
          onRename={handleRename}
          onDelete={handleDelete}
          onCopyRelativePath={(path) => void copyText(path)}
          onCopyPath={
            adapter.platform === "native" && workspace
              ? (path) => void copyText(joinAbsolutePath(workspace.rootPath, path))
              : undefined
          }
          newEntryRequest={newEntryRequest}
        />
        {/* The document frame: a rounded panel set into the chrome on wide screens, edge to edge on narrow ones. */}
        <div
          className={`bg-background flex min-w-0 flex-1 flex-col overflow-hidden md:mr-1.5 md:rounded-lg ${isSidebarOpen ? "" : "md:ml-1.5"}`}
        >
          <TabStrip
            documents={documentsState.documents}
            activeKey={documentsState.activeKey}
            onActivate={(key) => dispatchDocuments({ type: "activate", key })}
            onClose={(key) => closeDocuments([key])}
            onCloseMany={(keys) => closeDocuments(keys)}
            onCopyRelativePath={(path) => void copyText(path)}
          />
          <EditorPane
            platform={adapter.platform}
            document={activeDocument}
            onViewModeChange={handleViewModeChange}
            onContentChange={handleContentChange}
            onCursorChange={handleCursorChange}
            onVimModeChange={handleVimModeChange}
            rawEditorStates={rawEditorStatesRef.current}
            reservedShortcuts={reservedShortcuts}
            editorSettings={settings.editor}
            onEditorSettingsChange={handleEditorSettingsChange}
            find={find}
            onFind={() => openFind("find")}
            onFindClose={() => setFind(null)}
            pendingJump={pendingJump?.key === activeDocumentKey ? pendingJump.position : null}
            onJumpApplied={handleJumpApplied}
            contextMenuItems={editorMenuItems}
            loadImage={loadImage}
            emptyState={
              <StartScreen
                workspaceName={workspace?.name ?? null}
                isLoading={isLoading}
                restorableFolderName={restorableFolderName}
                onOpenFolder={() => void handleOpenFolder()}
                onReopenFolder={() => void handleReopenFolder()}
                actions={startActions}
              />
            }
          />
        </div>
      </div>
      <StatusBar
        activeFile={activeDocument}
        cursor={activeCursor}
        vimMode={activeVimMode}
        onGoToLine={() => setGoToQuery(":")}
      />
      {goToQuery !== null && (
        <GoToDialog
          // The field takes its starting text once, so a shortcut for another mode pressed while
          // the picker is open starts it over in that mode.
          key={goToQuery}
          files={filePaths}
          commands={paletteCommands}
          initialQuery={goToQuery}
          hasCurrentFile={activeDocument !== null}
          onGo={(request) => void handleGoTo(request)}
          onRunCommand={handleRunPaletteCommand}
          onClose={() => setGoToQuery(null)}
        />
      )}
      {helpDialog === "shortcuts" && (
        <KeyboardShortcutsDialog commands={commands} groups={MENUS} onClose={() => setHelpDialog(null)} />
      )}
      {helpDialog === "about" && <AboutDialog platform={adapter.platform} onClose={() => setHelpDialog(null)} />}
      {helpDialog === "settings" && (
        <SettingsDialog settings={settings} onChange={updateSettings} onClose={() => setHelpDialog(null)} />
      )}
      {unsavedRequest && <UnsavedChangesDialog fileNames={unsavedRequest.fileNames} onChoose={handleUnsavedChoice} />}
    </div>
  );
}

/** Buffer contents, by document key, that the user saved or agreed to lose. */
type ApprovedEdits = ReadonlyMap<string, string>;

const NO_APPROVED_EDITS: ApprovedEdits = new Map();

/** One file is named; several are listed by path, since names can repeat across folders. */
function describeUnsavedDocuments(documents: readonly OpenDocument[]): string[] {
  return documents.length === 1 ? documents.map((doc) => doc.name) : documents.map((doc) => doc.path);
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
  const separator = rootPath.includes("\\") ? "\\" : "/";
  return `${rootPath.replace(/[\\/]+$/, "")}${separator}${path.split("/").join(separator)}`;
}

/** Lists the paths of every file in a tree, for the go-to picker. */
function listFilePaths(nodes: readonly WorkspaceNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === "file" ? [node.path] : listFilePaths(node.children ?? [])));
}

/**
 * Finds the node at a workspace-relative path anywhere in a tree.
 *
 * @param nodes - Nodes to search, including their descendants.
 * @param path - Workspace-relative path to find.
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
