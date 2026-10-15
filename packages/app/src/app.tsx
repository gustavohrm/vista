import { useCallback, useEffect, useRef, useState } from "react";

import { EditorPane } from "./components/editor/editor-pane";
import { ToastProvider, useToast } from "./components/feedback/toast";
import { UnsavedChangesDialog, type UnsavedChangesChoice } from "./components/feedback/unsaved-changes-dialog";
import { ActivityBar } from "./components/layout/activity-bar";
import { Sidebar } from "./components/layout/sidebar";
import { StatusBar } from "./components/layout/status-bar";
import { normalizeExtension } from "./domain/file-types";
import { joinWorkspacePath } from "./domain/path-validation";
import { isDesktopViewport } from "./domain/viewport";
import type { AppAdapter, FileDocument, RestoreFolderResult, ViewMode, Workspace, WorkspaceNode } from "./ports";
import { useTheme } from "./theme/theme-manager";

interface AppProps {
  /** Capabilities and platform information supplied by a Vista host. */
  adapter: AppAdapter;
}

/** A pending request to resolve unsaved changes, held until the user answers the dialog. */
interface UnsavedChangesRequest {
  /** Name of the document the prompt is about. */
  fileName: string;
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
  const [activeFile, setActiveFile] = useState<FileDocument | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("raw");
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

  const isActiveFileDirty = activeFile?.isDirty ?? false;

  const saveActiveFile = useCallback(async (): Promise<boolean> => {
    if (!activeFile) {
      return false;
    }
    try {
      await adapter.workspace.writeFile(activeFile.path, activeFile.content);
      setActiveFile((prev) => (prev?.path === activeFile.path ? { ...prev, isDirty: false } : prev));
      return true;
    } catch (err) {
      console.error("Failed to save file:", err);
      const message = err instanceof Error ? err.message : `Failed to save ${activeFile.name}.`;
      toast.show({ kind: "error", text: message });
      return false;
    }
  }, [activeFile, adapter.workspace, toast]);

  /**
   * Asks the user what to do with unsaved edits before the active document is replaced or the
   * workspace changes. Saving stays manual, so the only automatic write is the one the user chose.
   *
   * @returns `true` if the caller may proceed, or `false` if the user cancelled or the save failed.
   */
  const confirmUnsavedChanges = useCallback(async (): Promise<boolean> => {
    if (!activeFile?.isDirty) {
      return true;
    }
    const choice = await new Promise<UnsavedChangesChoice>((resolve) => {
      setUnsavedRequest({ fileName: activeFile.name, resolve });
    });
    if (choice === "save") {
      return saveActiveFile();
    }
    return choice === "discard";
  }, [activeFile, saveActiveFile]);

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
  // is attached only while the active document has unsaved edits.
  useEffect(() => {
    if (!isActiveFileDirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isActiveFileDirty]);

  /**
   * Makes a workspace the active root by reading its tree first, so a failed read leaves the
   * previous state intact rather than showing a root with no contents.
   *
   * @param opened - The workspace to adopt.
   * @throws If the workspace tree cannot be read.
   */
  const adoptWorkspace = useCallback(
    async (opened: Workspace) => {
      const nodes = await adapter.workspace.readTree(opened);
      setWorkspace(opened);
      setTree(nodes);
      setActiveFile(null);
      setRestorableFolderName(null);
      if (opened.accessMode === "fallback") {
        toast.show({
          kind: "info",
          text: "This browser can't write files directly, so saving will download a copy instead.",
        });
      }
    },
    [adapter.workspace, toast],
  );

  const handleOpenFolder = useCallback(async () => {
    if (!adapter.workspace.isSupported) {
      toast.show({ kind: "error", text: "Local folder access is not supported in this browser or environment." });
      return;
    }
    const canProceed = await confirmUnsavedChanges();
    if (!canProceed) {
      return;
    }
    try {
      const opened = await adapter.workspace.openFolder();
      if (!opened) {
        return;
      }
      setIsLoading(true);
      await adoptWorkspace(opened);
    } catch (err) {
      console.error("Failed to open folder:", err);
      const message = err instanceof Error ? err.message : "Failed to open the selected folder.";
      toast.show({ kind: "error", text: message });
    } finally {
      setIsLoading(false);
    }
  }, [adapter.workspace, adoptWorkspace, confirmUnsavedChanges, toast]);

  /**
   * Acts on the outcome of a folder restore. A folder that needs permission is remembered so the
   * explorer can offer a reopen button, and a folder that is gone is reported to the user.
   *
   * @param result - The outcome returned by `restoreFolder`.
   * @throws If the restored workspace tree cannot be read.
   */
  const applyRestoreResult = useCallback(
    async (result: RestoreFolderResult) => {
      switch (result.status) {
        case "restored":
          await adoptWorkspace(result.workspace);
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
    const canProceed = await confirmUnsavedChanges();
    if (!canProceed) {
      return;
    }
    try {
      const result = await adapter.workspace.restoreFolder({ interactive: true });
      await applyRestoreResult(result);
    } catch (err) {
      console.error("Failed to reopen the folder:", err);
      const message = err instanceof Error ? err.message : "Failed to reopen the folder.";
      toast.show({ kind: "error", text: message });
    }
  }, [adapter.workspace, applyRestoreResult, confirmUnsavedChanges, toast]);

  const handleSelectFile = useCallback(
    async (path: string) => {
      // Re-selecting the open file must not reload it, which would discard unsaved edits.
      if (activeFile?.path === path) {
        return;
      }
      const canProceed = await confirmUnsavedChanges();
      if (!canProceed) {
        return;
      }
      try {
        const content = await adapter.workspace.readFile(path);
        const name = path.split("/").pop() ?? path;
        const extension = normalizeExtension(name);

        setActiveFile({
          path,
          name,
          extension,
          content,
          isDirty: false,
        });
        // Default markdown to enriched if opened, or keep raw
        setViewMode(extension === "md" || extension === "markdown" ? "enriched" : "raw");
      } catch (err) {
        console.error("Failed to read file:", err);
        const message = err instanceof Error ? err.message : `Failed to open ${path}.`;
        toast.show({ kind: "error", text: message });
      }
    },
    [activeFile?.path, adapter.workspace, confirmUnsavedChanges, toast],
  );

  const handleContentChange = useCallback((newContent: string) => {
    setActiveFile((prev) => {
      if (!prev) {
        return null;
      }
      return {
        ...prev,
        content: newContent,
        isDirty: true,
      };
    });
  }, []);

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
        setActiveFile((prev) => {
          if (!prev || (prev.path !== fromPath && !prev.path.startsWith(`${fromPath}/`))) {
            return prev;
          }
          const newPath = prev.path === fromPath ? toPath : toPath + prev.path.slice(fromPath.length);
          const name = newPath.split("/").pop() ?? newPath;
          return { ...prev, path: newPath, name, extension: normalizeExtension(name) };
        });
        await refreshTree();
      } catch (err) {
        console.error("Failed to rename entry:", err);
        const message = err instanceof Error ? err.message : `Failed to rename "${fromPath}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [adapter.workspace, refreshTree, toast],
  );

  const handleDelete = useCallback(
    async (path: string) => {
      const node = findTreeNode(tree, path);
      const name = node?.name ?? path;
      const isDirectory = node?.kind === "directory";
      try {
        const confirmed = await toast.confirm({
          title: `Delete "${name}"?`,
          message: isDirectory
            ? "This folder and everything in it will be permanently deleted."
            : "This file will be permanently deleted.",
          confirmLabel: "Delete",
          destructive: true,
        });
        if (!confirmed) {
          return;
        }
        await adapter.workspace.remove(path);
        if (activeFile && (activeFile.path === path || activeFile.path.startsWith(`${path}/`))) {
          toast.show({ kind: "info", text: `"${activeFile.name}" was deleted.` });
          setActiveFile(null);
        }
        await refreshTree();
      } catch (err) {
        console.error("Failed to delete entry:", err);
        const message = err instanceof Error ? err.message : `Failed to delete "${path}".`;
        toast.show({ kind: "error", text: message });
      }
    },
    [activeFile, adapter.workspace, refreshTree, toast, tree],
  );

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
          activePath={activeFile?.path}
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
          <EditorPane
            platform={adapter.platform}
            file={activeFile}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onContentChange={handleContentChange}
            onSave={saveActiveFile}
          />
        </div>
      </div>
      <StatusBar activeFile={activeFile} />
      {unsavedRequest && <UnsavedChangesDialog fileName={unsavedRequest.fileName} onChoose={handleUnsavedChoice} />}
    </div>
  );
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
