import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { useCommandShortcuts, type Command } from "./commands";
import { EditorPane } from "./components/editor/editor-pane";
import { ToastProvider, useToast } from "./components/feedback/toast";
import { UnsavedChangesDialog, type UnsavedChangesChoice } from "./components/feedback/unsaved-changes-dialog";
import { ActivityBar } from "./components/layout/activity-bar";
import { Sidebar } from "./components/layout/sidebar";
import { StatusBar } from "./components/layout/status-bar";
import { TabStrip } from "./components/layout/tab-strip";
import { joinWorkspacePath } from "./domain/path-validation";
import { isDesktopViewport } from "./domain/viewport";
import type { AppAdapter, RestoreFolderResult, ViewMode, Workspace, WorkspaceNode } from "./ports";
import {
  documentKey,
  documentsReducer,
  findAffectedDocuments,
  getActiveDocument,
  INITIAL_DOCUMENTS_STATE,
  type OpenDocument,
} from "./state/documents";
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
  const activeDocumentKey = activeDocument?.key ?? null;
  const hasDirtyDocuments = documentsState.documents.some((doc) => doc.isDirty);
  const isPromptingForUnsavedChanges = unsavedRequest !== null;

  const saveDocument = useCallback(
    async (key: string): Promise<boolean> => {
      const doc = documentsRef.current.documents.find((candidate) => candidate.key === key);
      if (!doc) {
        return false;
      }
      try {
        await adapter.workspace.writeFile(doc.path, doc.content);
        dispatchDocuments({ type: "saved", key, content: doc.content });
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
      if (await confirmUnsavedChanges(keys)) {
        dispatchDocuments({ type: "close", keys: [...keys] });
      }
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
      if (result.status !== "restored") {
        setIsSidebarOpen(true);
      }
    } catch (err) {
      console.error("Failed to restore the last folder:", err);
      const message = err instanceof Error ? err.message : "Failed to restore the last folder.";
      toast.show({ kind: "error", text: message });
      setIsSidebarOpen(true);
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
    } catch (err) {
      console.error("Failed to reopen the folder:", err);
      const message = err instanceof Error ? err.message : "Failed to reopen the folder.";
      toast.show({ kind: "error", text: message });
    }
  }, [adapter.workspace, applyRestoreResult, confirmUnsavedChangesInAllDocuments, toast]);

  const handleSelectFile = useCallback(
    async (path: string) => {
      if (!workspace) {
        return;
      }
      const key = documentKey(workspace.id, path);
      // Selecting an open file only switches to its tab; reloading it would discard unsaved edits.
      if (documentsRef.current.documents.some((doc) => doc.key === key)) {
        dispatchDocuments({ type: "activate", key });
        return;
      }
      try {
        const content = await adapter.workspace.readFile(path);
        // A folder opened during the read makes this path meaningless, and saving it would write
        // into the new folder. Hosts may reuse ids for same-named folders, so compare identity.
        if (workspaceRef.current !== workspace) {
          return;
        }
        dispatchDocuments({ type: "open", workspaceId: workspace.id, path, content });
      } catch (err) {
        console.error("Failed to read file:", err);
        const message = err instanceof Error ? err.message : `Failed to open ${path}.`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, toast, workspace],
  );

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

  const handleCreateFile = useCallback(
    async (parentPath: string, name: string) => {
      try {
        await adapter.workspace.createFile(joinWorkspacePath(parentPath, name));
        await refreshTree();
      } catch (err) {
        console.error("Failed to create file:", err);
        const message = err instanceof Error ? err.message : `Failed to create "${name}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, refreshTree, toast],
  );

  const handleCreateDirectory = useCallback(
    async (parentPath: string, name: string) => {
      try {
        await adapter.workspace.createDirectory(joinWorkspacePath(parentPath, name));
        await refreshTree();
      } catch (err) {
        console.error("Failed to create folder:", err);
        const message = err instanceof Error ? err.message : `Failed to create "${name}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, refreshTree, toast],
  );

  const handleRename = useCallback(
    async (fromPath: string, toPath: string) => {
      try {
        await adapter.workspace.move(fromPath, toPath);
        if (workspace) {
          dispatchDocuments({ type: "move", workspaceId: workspace.id, fromPath, toPath });
        }
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
      const node = findTreeNode(tree, path);
      const name = node?.name ?? path;
      const isDirectory = node?.kind === "directory";
      const dirtyDocuments = workspace
        ? findAffectedDocuments(documentsRef.current, { workspaceId: workspace.id, path }).filter((doc) => doc.isDirty)
        : [];
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
        await adapter.workspace.remove(path);
        const deletedDocuments = workspace
          ? findAffectedDocuments(documentsRef.current, { workspaceId: workspace.id, path })
          : [];
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

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "file.save",
        label: "Save",
        shortcut: "Mod+S",
        // A second prompt over a pending one would leave the first flow waiting forever.
        isEnabled: !isPromptingForUnsavedChanges && (activeDocument?.isDirty ?? false),
        run: saveActiveDocument,
      },
      {
        id: "tabs.close",
        label: "Close Tab",
        // Browsers reserve Ctrl+W for closing their own tab, so the web host uses Alt+W.
        shortcut: adapter.platform === "native" ? "Mod+W" : "Alt+W",
        isEnabled: !isPromptingForUnsavedChanges && activeDocument !== null,
        run: closeActiveDocument,
      },
    ],
    [activeDocument, adapter.platform, closeActiveDocument, isPromptingForUnsavedChanges, saveActiveDocument],
  );
  useCommandShortcuts(commands);

  return (
    <div
      data-platform={adapter.platform}
      className="bg-background text-text flex h-screen w-screen flex-col overflow-hidden"
    >
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar
          theme={theme}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />
        <Sidebar
          workspace={workspace}
          tree={tree}
          activePath={activeDocument?.path}
          onSelectFile={handleSelectFile}
          onOpenFolder={handleOpenFolder}
          isLoading={isLoading}
          restorableFolderName={restorableFolderName}
          onReopenFolder={handleReopenFolder}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onCreateFile={handleCreateFile}
          onCreateDirectory={handleCreateDirectory}
          onRename={handleRename}
          onDelete={handleDelete}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TabStrip
            documents={documentsState.documents}
            activeKey={documentsState.activeKey}
            onActivate={(key) => dispatchDocuments({ type: "activate", key })}
            onClose={(key) => void closeDocuments([key])}
          />
          <EditorPane
            platform={adapter.platform}
            document={activeDocument}
            onViewModeChange={handleViewModeChange}
            onContentChange={handleContentChange}
            onSave={() => void saveActiveDocument()}
          />
        </div>
      </div>
      <StatusBar activeFile={activeDocument} />
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
