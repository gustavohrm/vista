import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { version as APP_VERSION } from "../package.json";
import { App } from "./app";
import {
  LEGACY_FOLDER_ID,
  type AppAdapter,
  type FileStat,
  type WorkspaceCapability,
  type WorkspaceFolder,
  type WorkspaceNode,
} from "./ports";
import { createMemoryWorkspace, writtenTexts, type MemoryWorkspace } from "./test-support/memory-workspace";

const README_CONTENT = "# Hello Vista\nThis is notes.";
const EDITED_README_CONTENT = `${README_CONTENT}\nNew line`;
const CSV_CONTENT = "Name,Age\nAlice,30\nBob,25";

const ROOT_TREE: WorkspaceNode[] = [
  {
    id: "readme.md",
    name: "readme.md",
    path: "readme.md",
    kind: "file",
    extension: "md",
  },
  {
    id: "data.csv",
    name: "data.csv",
    path: "data.csv",
    kind: "file",
    extension: "csv",
  },
];

const PLAIN_TEXT = "Plain text";

function createMockWorkspaceCapability(overrides?: Partial<WorkspaceCapability>): MemoryWorkspace {
  return createMemoryWorkspace(
    {
      "readme.md": README_CONTENT,
      "data.csv": CSV_CONTENT,
      "docs/a.txt": PLAIN_TEXT,
      "docs/b.txt": PLAIN_TEXT,
      "docs/guide.md": PLAIN_TEXT,
    },
    { tree: ROOT_TREE, overrides },
  );
}

/**
 * Finds a visible toast by its text. Toasts carry no role: the toaster announces them through
 * separate live regions, which repeat the text.
 *
 * @param text - The toast's whole message.
 */
function findToast(text: string) {
  return screen.findByText(text, { selector: ".coden-toast *" });
}

/**
 * Opens the mock folder from the start screen and waits for its tree to appear.
 *
 * @param user - The user-event instance driving the interaction.
 */
async function openFolderFromWelcome(user: UserEvent) {
  await user.click(await screen.findByRole("button", { name: "Open Folder…" }));
  await screen.findByText("readme.md");
}

/**
 * Opens readme.md, switches it to raw mode, and types an edit so the document is dirty.
 *
 * @param user - The user-event instance driving the interaction.
 * @returns The raw editor of readme.md.
 */
async function makeReadmeDirty(user: UserEvent) {
  await openFolderFromWelcome(user);
  await user.click(screen.getByText("readme.md"));
  await user.click(await screen.findByRole("button", { name: "Raw" }));
  const editor = await screen.findByRole("textbox", { name: /Raw text content of readme\.md/i });
  await appendToRawEditor(user, editor, "\nNew line");
  return editor;
}

/**
 * Opens readme.md in the raw view.
 *
 * @param user - The user-event instance driving the interaction.
 * @returns The raw editor of readme.md.
 */
async function openRawReadme(user: UserEvent) {
  await openFolderFromWelcome(user);
  await user.click(screen.getByText("readme.md"));
  await user.click(await screen.findByRole("button", { name: "Raw" }));
  return screen.findByRole("textbox", { name: "Raw text content of readme.md" });
}

/**
 * Reads the text of a raw editor. CodeMirror edits a contenteditable element, which has no form value.
 *
 * @param editor - The raw editor's textbox element.
 * @returns The editor's document text.
 */
function rawEditorText(editor: HTMLElement): string | undefined {
  return EditorView.findFromDOM(editor)?.state.sliceDoc();
}

/**
 * Types at the end of a raw editor's text. jsdom does no layout, so a click leaves the cursor at the
 * start; the editor's own Ctrl+End binding moves it to the end first.
 *
 * @param user - The user-event instance driving the interaction.
 * @param editor - The raw editor's textbox element.
 * @param text - Text to type, in user-event keyboard syntax.
 */
async function appendToRawEditor(user: UserEvent, editor: HTMLElement, text: string) {
  await user.click(editor);
  await user.keyboard("{Control>}{End}{/Control}");
  await user.keyboard(text);
}

interface StoredFolder {
  folder: WorkspaceFolder;
  files: Record<string, string>;
  /** The tree the folder lists; a flat list of its files when absent. */
  tree?: WorkspaceNode[];
}

/**
 * A capability over several in-memory folders, each answering for its own id, and a stored workspace
 * of them that reopens at startup. `restoreFolder` restores every folder unless overridden.
 */
function createFoldersCapability(folders: readonly StoredFolder[], overrides?: Partial<WorkspaceCapability>) {
  localStorage.setItem(
    "vista.workspaces",
    JSON.stringify({
      version: 1,
      lastWorkspaceId: "w1",
      workspaces: [{ id: "w1", name: "Research", folderIds: folders.map(({ folder }) => folder.id), lastOpenedAt: 1 }],
    }),
  );
  const memory = new Map(folders.map(({ folder, files, tree }) => [folder.id, createMemoryWorkspace(files, { tree })]));
  const of = (folder: WorkspaceFolder): MemoryWorkspace => {
    const found = memory.get(folder.id);
    if (!found) {
      throw new Error(`No folder ${folder.id}`);
    }
    return found;
  };
  const capability: MemoryWorkspace = {
    ...createMemoryWorkspace({}),
    restoreFolder: vi.fn(async (id: string) => {
      const stored = folders.find(({ folder }) => folder.id === id);
      return stored ? { status: "restored" as const, folder: stored.folder } : { status: "none" as const };
    }),
    readTree: vi.fn((folder) => of(folder).readTree(folder)),
    stat: vi.fn((folder, path) => of(folder).stat(folder, path)),
    readFile: vi.fn((folder, path) => of(folder).readFile(folder, path)),
    writeFile: vi.fn((folder, path, bytes, options) => of(folder).writeFile(folder, path, bytes, options)),
    createFile: vi.fn((folder, path) => of(folder).createFile(folder, path)),
    createDirectory: vi.fn((folder, path) => of(folder).createDirectory(folder, path)),
    move: vi.fn((folder, from, to) => of(folder).move(folder, from, to)),
    remove: vi.fn((folder, path) => of(folder).remove(folder, path)),
    ...(overrides as Partial<MemoryWorkspace>),
  };
  return { capability, folder: (id: string) => memory.get(id)! };
}

const NOTES_FOLDER: WorkspaceFolder = { id: "notes", name: "notes", rootPath: "/notes" };
const SOURCES_FOLDER: WorkspaceFolder = { id: "sources", name: "sources", rootPath: "/sources" };

function storedFolders(): StoredFolder[] {
  return [
    { folder: NOTES_FOLDER, files: { "a.txt": PLAIN_TEXT } },
    { folder: SOURCES_FOLDER, files: { "a.txt": PLAIN_TEXT, "plan.txt": PLAIN_TEXT } },
  ];
}

function statusBar(): HTMLElement {
  return screen.getByRole("contentinfo", { name: "Status Bar" });
}

/** Finds the path the status bar shows, whose file name is set apart in an element of its own. */
function shownPath(text: string): HTMLElement {
  return within(statusBar()).getByText(
    (_, element) =>
      element?.tagName === "SPAN" &&
      element.firstElementChild !== null &&
      element.textContent === text &&
      element.closest("[role=tooltip]") === null,
  );
}

function explorerPanel(): HTMLElement {
  return screen.getByRole("navigation", { name: "File Explorer" });
}

/** Waits for the explorer, which appears once a workspace has opened. */
function findExplorerPanel(): Promise<HTMLElement> {
  return screen.findByRole("navigation", { name: "File Explorer" });
}

/** The file rows named `name`, in folder order. */
async function findFileRows(name: string): Promise<HTMLElement[]> {
  return within(await findExplorerPanel()).findAllByRole("button", { name });
}

/**
 * Runs a command from the palette by its title, such as `File: Save All`.
 *
 * @param user - The user-event instance driving the interaction.
 * @param title - The command's category and label, as the palette lists it.
 */
async function runFromPalette(user: UserEvent, title: string) {
  await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
  const pattern = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  await user.click(screen.getByRole("option", { name: pattern }));
}

function getTab(name: string): HTMLElement {
  return screen.getByRole("tab", { name: new RegExp(`^${name.replaceAll(".", "\\.")}`) });
}

/** Replaces `matchMedia` with one whose `md` breakpoint the test moves the window across. */
function stubViewport(isWide: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: isWide,
    media: "(min-width: 768px)",
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  };
  const original = window.matchMedia;
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia;
  return {
    setWide(wide: boolean) {
      query.matches = wide;
      for (const listener of listeners) {
        listener({ matches: wide } as MediaQueryListEvent);
      }
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

describe("App", () => {
  describe("workspaces with several folders", () => {
    it("shows a root row for each folder and saves a file to the folder it came from", async () => {
      const user = userEvent.setup();
      const { capability, folder } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      await user.click((await findFileRows("plan.txt"))[0]!);
      await appendToRawEditor(user, await screen.findByRole("textbox", { name: "Raw text content of plan.txt" }), "!");
      await user.keyboard("{Control>}s{/Control}");

      expect(screen.getByRole("button", { name: "Research" })).toHaveAttribute("aria-haspopup", "menu");
      expect(within(explorerPanel()).getByRole("button", { name: "notes", expanded: true })).toBeInTheDocument();
      expect(within(explorerPanel()).getByRole("button", { name: "sources", expanded: true })).toBeInTheDocument();
      await waitFor(() => expect(folder("sources").textOf("plan.txt")).toBe(`${PLAIN_TEXT}!`));
      expect(folder("notes").textOf("plan.txt")).toBeUndefined();
    });

    it("keeps same-named files of two folders in separate tabs", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      const [notesFile, sourcesFile] = await findFileRows("a.txt");
      await user.click(notesFile!);
      await user.click(sourcesFile!);

      await waitFor(() => expect(screen.getAllByRole("tab", { name: /^a\.txt/ })).toHaveLength(2));
    });

    it("finds the files of every folder with go to, by folder name too", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");

      await user.keyboard("{Control>}p{/Control}");
      await user.keyboard("sources/a");
      const options = screen.getAllByRole("option").map((option) => option.textContent);
      expect(options[0]).toBe("a.txtsources");
      expect(options).not.toContain("a.txtnotes");
      await user.keyboard("{Enter}");

      expect(await screen.findByRole("textbox", { name: "Raw text content of a.txt" })).toBeInTheDocument();
      expect(capability.readFile).toHaveBeenCalledWith(SOURCES_FOLDER, "a.txt");
    });

    it("lists unsaved files with their folder's name when several are about to close", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      const [notesFile, sourcesFile] = await findFileRows("a.txt");
      for (const row of [notesFile!, sourcesFile!]) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each edit goes to the tab just opened
        await user.click(row);
        // oxlint-disable-next-line eslint/no-await-in-loop -- each edit goes to the tab just opened
        await appendToRawEditor(user, await screen.findByRole("textbox", { name: "Raw text content of a.txt" }), "!");
      }

      await runFromPalette(user, "Tabs: Close All Tabs");

      const dialog = await screen.findByRole("dialog", { name: "Save changes to 2 files?" });
      expect(
        within(dialog)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["notes / a.txt", "sources / a.txt"]);
    });

    it("removes a folder after asking, and leaves its files alone", async () => {
      const user = userEvent.setup();
      const { capability, folder } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await user.click((await findFileRows("plan.txt"))[0]!);
      await screen.findByRole("textbox", { name: "Raw text content of plan.txt" });

      fireEvent.contextMenu(within(explorerPanel()).getByRole("button", { name: "sources" }));
      expect(screen.queryByRole("menuitem", { name: "Rename" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("menuitem", { name: "Remove Folder from Workspace" }));
      const dialog = await screen.findByRole("dialog", { name: 'Remove "sources" from the workspace?' });
      expect(dialog).toHaveTextContent("Your folders and files aren't changed.");
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      await waitFor(() =>
        expect(within(explorerPanel()).queryByRole("button", { name: "sources" })).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("vista.workspaces") ?? "null").workspaces[0].folderIds).toEqual(["notes"]);
      expect(capability.forgetFolder).toHaveBeenCalledWith("sources");
      expect(folder("sources").textOf("plan.txt")).toBe(PLAIN_TEXT);
    });

    it("does not offer removing a workspace's only folder", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      fireEvent.contextMenu(within(explorerPanel()).getByRole("button", { name: "My Notes" }));

      expect(screen.getByRole("menuitem", { name: "New File" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Remove Folder from Workspace" })).not.toBeInTheDocument();
    });

    it("adds a folder to the workspace and remembers it", async () => {
      const user = userEvent.setup();
      const work: WorkspaceFolder = { id: "work", name: "Work", rootPath: "/work" };
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);
      mockWorkspace.pickFolder.mockResolvedValueOnce(work);

      await user.click(within(explorerPanel()).getByRole("button", { name: "Add Folder to Workspace" }));

      expect(await within(await findExplorerPanel()).findByRole("button", { name: "Work" })).toBeInTheDocument();
      const stored = JSON.parse(localStorage.getItem("vista.workspaces") ?? "null");
      expect(stored.workspaces[0].folderIds).toEqual(["workspace-1", "work"]);
    });

    it("refuses a folder inside one the workspace has, and forgets it", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);
      mockWorkspace.pickFolder.mockResolvedValueOnce({ id: "inner", name: "inner", rootPath: "/notes/inner" });

      await user.click(within(explorerPanel()).getByRole("button", { name: "Add Folder to Workspace" }));

      expect(await findToast('"inner" is already part of this workspace, inside "My Notes".')).toBeInTheDocument();
      expect(within(explorerPanel()).queryByRole("button", { name: "inner" })).not.toBeInTheDocument();
      expect(mockWorkspace.forgetFolder).toHaveBeenCalledWith("inner");
    });

    it("refuses a folder this browser can't remember in a workspace Vista remembers", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);
      mockWorkspace.pickFolder.mockResolvedValueOnce({
        id: "work",
        name: "Work",
        rootPath: "/work",
        accessMode: "fallback",
      });

      await user.click(within(explorerPanel()).getByRole("button", { name: "Add Folder to Workspace" }));

      expect(
        await findToast(
          'This browser can open "Work" only until Vista closes, so it can\'t join a workspace Vista remembers.',
        ),
      ).toBeInTheDocument();
      expect(within(explorerPanel()).queryByRole("button", { name: "Work" })).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("vista.workspaces") ?? "null").workspaces[0].folderIds).toEqual([
        "workspace-1",
      ]);
    });

    it("refuses a folder already in the workspace without forgetting it", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);

      await user.click(within(explorerPanel()).getByRole("button", { name: "Add Folder to Workspace" }));

      expect(await findToast('"My Notes" is already part of this workspace.')).toBeInTheDocument();
      expect(mockWorkspace.forgetFolder).not.toHaveBeenCalled();
    });

    it("waits at startup for a folder that needs permission, then offers it on its row", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(storedFolders());
      const restoreFolder = capability.restoreFolder;
      restoreFolder.mockImplementation(async (id) =>
        id === "notes" ? { status: "restored", folder: NOTES_FOLDER } : { status: "needs-permission", name: "sources" },
      );
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      const entry = await screen.findByRole("button", { name: "Research" });
      expect(entry).toHaveAccessibleDescription(/^Click to allow access/);
      await user.click(entry);
      await user.click(await within(await findExplorerPanel()).findByRole("button", { name: "Allow access" }));
      expect(within(explorerPanel()).queryByRole("button", { name: "plan.txt" })).not.toBeInTheDocument();
      restoreFolder.mockResolvedValueOnce({ status: "restored", folder: SOURCES_FOLDER });
      await user.click(within(explorerPanel()).getByRole("button", { name: "Allow access" }));

      expect(await within(await findExplorerPanel()).findByRole("button", { name: "plan.txt" })).toBeInTheDocument();
      expect(restoreFolder).toHaveBeenLastCalledWith("sources", { interactive: true });
    });

    it("opens a workspace whose other folders are gone, marking each missing one", async () => {
      const { capability } = createFoldersCapability(storedFolders());
      capability.restoreFolder.mockImplementation(async (id) =>
        id === "notes" ? { status: "restored", folder: NOTES_FOLDER } : { status: "unavailable", name: "sources" },
      );
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      expect(await within(await findExplorerPanel()).findByText(/This folder can't be found/)).toBeInTheDocument();
      expect(within(explorerPanel()).getByRole("button", { name: "Remove Folder from Workspace" })).toBeInTheDocument();
      expect(within(explorerPanel()).getByRole("button", { name: "a.txt" })).toBeInTheDocument();
    });

    it("tells same-named folders apart by their location on desktop", async () => {
      const { capability } = createFoldersCapability([
        { folder: { id: "a", name: "notes", rootPath: "/home/a/notes" }, files: {} },
        { folder: { id: "b", name: "notes", rootPath: "/home/b/notes" }, files: {} },
      ]);
      render(<App adapter={{ platform: "native", workspace: capability }} />);

      expect(await within(await findExplorerPanel()).findByText("/home/a")).toBeInTheDocument();
      expect(within(explorerPanel()).getByText("/home/b")).toBeInTheDocument();
    });
  });

  it.each(["web", "native"] as const)("renders the start screen for the %s host", async (platform) => {
    const adapter: AppAdapter = {
      platform,
      workspace: createMockWorkspaceCapability(),
    };

    const { container } = render(<App adapter={adapter} />);

    await screen.findByRole("button", { name: "Open Folder…" });
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Vista" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("data-platform", platform);
    expect(container.firstChild).toHaveAttribute("data-platform", platform);
  });

  it("opens folder, displays files, and switches between raw and enriched view for markdown", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability();
    const adapter: AppAdapter = {
      platform: "web",
      workspace: mockWorkspace,
    };

    render(<App adapter={adapter} />);

    await openFolderFromWelcome(user);

    expect(mockWorkspace.pickFolder).toHaveBeenCalled();
    expect(screen.getByText("data.csv")).toBeInTheDocument();

    // Select readme.md
    await user.click(screen.getByText("readme.md"));

    // By default markdown opens in enriched view
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Hello Vista" })).toBeVisible();
    });

    // Toggle to raw view
    const rawBtn = screen.getByRole("button", { name: "Raw" });
    await user.click(rawBtn);

    const editor = screen.getByRole("textbox", { name: /Raw text content of readme\.md/i });
    expect(rawEditorText(editor)).toBe(README_CONTENT);

    // Edit content to trigger dirty state
    await appendToRawEditor(user, editor, "\nNew line");

    await user.keyboard("{Control>}s{/Control}");
    expect(writtenTexts(mockWorkspace, "readme.md")).toEqual([EDITED_README_CONTENT]);
  });

  it("loads and edits CSV file in enriched table view", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability();
    const adapter: AppAdapter = {
      platform: "web",
      workspace: mockWorkspace,
    };

    render(<App adapter={adapter} />);

    await openFolderFromWelcome(user);

    // Click data.csv
    await user.click(screen.getByText("data.csv"));

    // A CSV file opens in the table.
    expect(screen.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Column 1 name" })).toHaveValue("Name");
      expect(screen.getByDisplayValue("Alice")).toBeVisible();
    });

    // Edit cell
    const cellInput = screen.getByDisplayValue("Alice");
    await user.clear(cellInput);
    await user.type(cellInput, "Alicia");

    await user.keyboard("{Control>}s{/Control}");

    // The file's LF line breaks survive the table's rewrite.
    expect(writtenTexts(mockWorkspace, "data.csv")).toEqual(["Name,Age\nAlicia,30\nBob,25"]);
  });

  it("shows an error toast when opening a folder fails for a reason other than user cancellation", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability({
      pickFolder: vi.fn().mockRejectedValue(new Error("Permission to read this folder was not granted.")),
    });
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };

    render(<App adapter={adapter} />);

    await user.click(await screen.findByRole("button", { name: "Open Folder…" }));

    expect(await findToast("Permission to read this folder was not granted.")).toBeInTheDocument();
  });

  it("shows no error toast when the user cancels the folder picker", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability({
      pickFolder: vi.fn().mockResolvedValue(null),
    });
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };

    render(<App adapter={adapter} />);

    await user.click(await screen.findByRole("button", { name: "Open Folder…" }));

    await waitFor(() => expect(mockWorkspace.pickFolder).toHaveBeenCalled());
    expect(document.querySelector(".coden-toast")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Folder…" })).toBeInTheDocument();
  });

  it("shows an info toast when a folder is opened through the fallback (non-direct) access mode", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability({
      pickFolder: vi.fn().mockResolvedValue({
        id: "workspace-1",
        name: "My Notes",
        rootPath: "/notes",
        accessMode: "fallback",
      }),
    });
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };

    render(<App adapter={adapter} />);

    await user.click(await screen.findByRole("button", { name: "Open Folder…" }));

    expect(
      await screen.findByText("This browser can't write files directly, so saving will download a copy instead."),
    ).toBeInTheDocument();
  });

  it("shows an error toast when saving a file fails", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability({
      writeFile: vi.fn().mockRejectedValue(new Error("Write access was denied.")),
    });
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };

    render(<App adapter={adapter} />);

    await openFolderFromWelcome(user);
    await user.click(screen.getByText("readme.md"));
    await user.click(screen.getByRole("button", { name: "Raw" }));

    const editor = await screen.findByRole("textbox", { name: /Raw text content of readme\.md/i });
    await appendToRawEditor(user, editor, "!");
    await user.keyboard("{Control>}s{/Control}");

    expect(await findToast("Write access was denied.")).toBeInTheDocument();
  });

  it("toggles the mobile explorer drawer open and closed", async () => {
    const user = userEvent.setup();
    const adapter: AppAdapter = { platform: "web", workspace: createMockWorkspaceCapability() };

    render(<App adapter={adapter} />);
    // Opening a folder opens the drawer, so its files are the next thing a phone user sees.
    await openFolderFromWelcome(user);

    await user.click(screen.getByRole("button", { name: "Close explorer" }));
    const toggleBtn = screen.getByRole("button", { name: "Open explorer" });
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");

    await user.click(toggleBtn);

    expect(screen.getByRole("button", { name: "Close explorer" })).toHaveAttribute("aria-pressed", "true");
  });

  it("closes the explorer as the window narrows past md, and restores it as it widens again", async () => {
    const viewport = stubViewport(true);
    try {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      expect(screen.getByRole("button", { name: "Close explorer" })).toBeInTheDocument();

      // Narrowing turns the open column into a drawer, which would cover the document.
      act(() => viewport.setWide(false));
      expect(screen.getByRole("button", { name: "Open explorer" })).toBeInTheDocument();

      act(() => viewport.setWide(true));
      expect(screen.getByRole("button", { name: "Close explorer" })).toBeInTheDocument();

      // A column the user closed stays closed, whatever the drawer did while the window was narrow.
      await user.click(screen.getByRole("button", { name: "Close explorer" }));
      act(() => viewport.setWide(false));
      await user.click(screen.getByRole("button", { name: "Open explorer" }));
      act(() => viewport.setWide(true));
      expect(screen.getByRole("button", { name: "Open explorer" })).toBeInTheDocument();
    } finally {
      viewport.restore();
    }
  });

  it("closes the mobile explorer drawer after selecting a file", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability();
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };

    render(<App adapter={adapter} />);

    await openFolderFromWelcome(user);
    expect(screen.getByRole("button", { name: "Close explorer" })).toBeInTheDocument();

    await user.click(screen.getByText("readme.md"));

    expect(screen.getByRole("button", { name: "Open explorer" })).toBeInTheDocument();
  });

  it("keeps a closed explorer out of the tab order, since it is only slid out of view", async () => {
    const user = userEvent.setup();
    render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
    await openFolderFromWelcome(user);
    const explorer = screen.getByRole("navigation", { name: "File Explorer" });
    expect(explorer).not.toHaveAttribute("inert");

    await user.click(screen.getByRole("button", { name: "Close explorer" }));

    expect(explorer).toHaveAttribute("inert");
  });

  it("creates a new file via the root context menu and refreshes the tree", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability();
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };
    const { container } = render(<App adapter={adapter} />);

    await openFolderFromWelcome(user);

    const treeArea = container.querySelector(".overflow-y-auto");
    expect(treeArea).not.toBeNull();
    fireEvent.contextMenu(treeArea!);

    await user.click(screen.getByRole("menuitem", { name: "New File" }));
    await user.type(screen.getByRole("textbox", { name: "Entry name" }), "todo.md{Enter}");

    expect(mockWorkspace.createFile).toHaveBeenCalledWith(expect.objectContaining({ id: "workspace-1" }), "todo.md");
    await waitFor(() => expect(mockWorkspace.readTree).toHaveBeenCalledTimes(2));
  });

  it("shows an error toast and keeps the tree unchanged when create fails", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability({
      createFile: vi.fn().mockRejectedValue(new Error('"todo.md" already exists.')),
    });
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };
    const { container } = render(<App adapter={adapter} />);

    await openFolderFromWelcome(user);

    const treeArea = container.querySelector(".overflow-y-auto");
    fireEvent.contextMenu(treeArea!);
    await user.click(screen.getByRole("menuitem", { name: "New File" }));
    await user.type(screen.getByRole("textbox", { name: "Entry name" }), "todo.md{Enter}");

    expect(await findToast('"todo.md" already exists.')).toBeInTheDocument();
  });

  it("renames the active file and updates the open editor's path without a reload", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability();
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };
    render(<App adapter={adapter} />);

    await openFolderFromWelcome(user);
    await user.click(screen.getByText("readme.md"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Hello Vista" })).toBeVisible());

    const explorer = screen.getByRole("navigation", { name: "File Explorer" });
    fireEvent.contextMenu(within(explorer).getByText("readme.md"));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Entry name" });
    await user.clear(input);
    await user.type(input, "guide.md{Enter}");

    expect(mockWorkspace.move).toHaveBeenCalledWith(
      expect.objectContaining({ id: "workspace-1" }),
      "readme.md",
      "guide.md",
    );
    // The mocked readTree always returns the same static list, so this verifies the
    // in-place document path update rather than a refreshed tree from disk.
    await waitFor(() => expect(getTab("guide.md")).toBeInTheDocument());
    expect(shownPath("My Notes / guide.md")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting a file and deletes it when confirmed", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability();
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };
    render(<App adapter={adapter} />);

    await openFolderFromWelcome(user);
    await user.click(screen.getByText("readme.md"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Hello Vista" })).toBeVisible());

    const explorer = screen.getByRole("navigation", { name: "File Explorer" });
    fireEvent.contextMenu(within(explorer).getByText("readme.md"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog", { name: 'Delete "readme.md"?' });
    expect(within(dialog).getByText("This file will be permanently deleted.")).toBeInTheDocument();
    expect(mockWorkspace.remove).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(mockWorkspace.remove).toHaveBeenCalledWith(expect.objectContaining({ id: "workspace-1" }), "readme.md");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Hello Vista" })).not.toBeInTheDocument());
    expect(await screen.findByText('"readme.md" was deleted.')).toBeInTheDocument();
  });

  it("keeps a file when its delete confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability();
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };
    render(<App adapter={adapter} />);

    await openFolderFromWelcome(user);
    await user.click(screen.getByText("readme.md"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Hello Vista" })).toBeVisible());

    const explorer = screen.getByRole("navigation", { name: "File Explorer" });
    fireEvent.contextMenu(within(explorer).getByText("readme.md"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: 'Delete "readme.md"?' });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockWorkspace.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Hello Vista" })).toBeVisible();
  });

  it("describes a folder's deletion as recursive in its confirmation", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability({
      readTree: vi
        .fn()
        .mockResolvedValue([{ id: "notes", name: "notes", path: "notes", kind: "directory", children: [] }]),
    });
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };
    render(<App adapter={adapter} />);

    await user.click(await screen.findByRole("button", { name: "Open Folder…" }));
    await screen.findByText("notes");
    const explorer = screen.getByRole("navigation", { name: "File Explorer" });
    fireEvent.contextMenu(within(explorer).getByText("notes"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog", { name: 'Delete "notes"?' });
    expect(
      within(dialog).getByText("This folder and everything in it will be permanently deleted."),
    ).toBeInTheDocument();
  });

  describe("rail", () => {
    it("shows neither the rail nor the explorer while no workspace is open", async () => {
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await screen.findByRole("button", { name: "Open Folder…" });

      expect(screen.queryByRole("navigation", { name: "Activity bar" })).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "File Explorer" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /explorer$/ })).not.toBeInTheDocument();
    });

    it("goes to the explorer from its Explorer button, which never hides it and stays marked while it is collapsed", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      const rail = screen.getByRole("navigation", { name: "Activity bar" });
      const explorer = within(rail).getByRole("button", { name: "Explorer" });
      expect(explorer).toHaveAttribute("aria-current", "true");

      await user.click(explorer);
      expect(explorer).toHaveAttribute("aria-current", "true");
      expect(explorerPanel()).not.toHaveAttribute("inert");

      // The rail marks what the frame shows, the workspace's files, whether or not the panel shows.
      await user.click(screen.getByRole("button", { name: "Toggle Explorer" }));
      expect(explorer).toHaveAttribute("aria-current", "true");
      expect(explorerPanel()).toHaveAttribute("inert");

      await user.click(explorer);
      expect(explorer).toHaveAttribute("aria-current", "true");
      expect(explorerPanel()).not.toHaveAttribute("inert");
      expect(screen.getByRole("button", { name: "Toggle Explorer" })).toHaveAttribute("aria-pressed", "true");
    });

    it("puts Settings in the explorer's place, and brings the explorer back as Settings closes", async () => {
      const viewport = stubViewport(true);
      try {
        const user = userEvent.setup();
        render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
        await openFolderFromWelcome(user);
        const rail = screen.getByRole("navigation", { name: "Activity bar" });
        const explorer = within(rail).getByRole("button", { name: "Explorer" });
        const settings = within(rail).getByRole("button", { name: "Settings" });

        await user.click(settings);

        expect(explorer).not.toHaveAttribute("aria-current");
        expect(explorerPanel()).toHaveAttribute("inert");
        expect(screen.getByRole("button", { name: "Toggle Explorer" })).toHaveAttribute("aria-disabled", "true");

        // Closing Settings from its own button brings the explorer back as it was.
        await user.click(settings);
        expect(explorer).toHaveAttribute("aria-current", "true");
        expect(explorerPanel()).not.toHaveAttribute("inert");

        await user.click(settings);
        await user.click(explorer);

        expect(screen.queryByRole("region", { name: "Settings" })).not.toBeInTheDocument();
        expect(explorer).toHaveAttribute("aria-current", "true");
        expect(explorerPanel()).not.toHaveAttribute("inert");
      } finally {
        viewport.restore();
      }
    });

    it("toggles the status bar from the title bar, only while there is a document for it", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      const toggle = screen.getByRole("button", { name: "Toggle Status Bar" });
      expect(toggle).toHaveAttribute("aria-disabled", "true");
      await user.click(toggle);

      await user.click(screen.getByText("readme.md"));
      expect(await screen.findByRole("contentinfo", { name: "Status Bar" })).toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(toggle).not.toHaveAttribute("aria-disabled");

      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      await waitFor(() => expect(screen.queryByRole("contentinfo", { name: "Status Bar" })).not.toBeInTheDocument());

      await user.click(toggle);
      expect(statusBar()).toBeInTheDocument();
    });

    it("shows Search and Graph as coming soon, doing nothing when chosen", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      const rail = screen.getByRole("navigation", { name: "Activity bar" });

      const search = within(rail).getByRole("button", { name: "Search" });
      const graph = within(rail).getByRole("button", { name: "Graph" });
      for (const button of [search, graph]) {
        expect(button).toHaveAttribute("aria-disabled", "true");
        expect(button).toHaveAccessibleDescription("Coming soon");
      }
      await user.click(search);
      await user.click(graph);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "File Explorer" })).toBeInTheDocument();
    });

    it("opens Settings from the gear, in the rail and at the top of the drawer", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.click(
        within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", { name: "Settings" }),
      );
      expect(screen.getByRole("region", { name: "Settings" })).toBeInTheDocument();
      expect(
        within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", { name: "Settings" }),
      ).toHaveAttribute("aria-pressed", "true");
      await user.click(
        within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", { name: "Settings" }),
      );
      expect(screen.queryByRole("region", { name: "Settings" })).not.toBeInTheDocument();

      const drawer = screen.getByRole("navigation", { name: "File Explorer" });
      expect(within(drawer).getByRole("button", { name: "Search" })).toHaveAttribute("aria-disabled", "true");
      expect(within(drawer).getByRole("button", { name: "Graph" })).toHaveAttribute("aria-disabled", "true");
      await user.click(within(drawer).getByRole("button", { name: "Settings" }));
      expect(screen.getByRole("region", { name: "Settings" })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("region", { name: "Settings" })).not.toBeInTheDocument();
    });
  });

  describe("settings", () => {
    function settingsDialog() {
      return screen.findByRole("region", { name: "Settings" });
    }

    it("opens with Ctrl+, on its first section, and lists every section", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await screen.findByRole("button", { name: "Open Folder…" });

      await user.keyboard("{Control>},{/Control}");
      const dialog = await settingsDialog();

      expect(
        within(within(dialog).getByRole("navigation", { name: "Settings sections" }))
          .getAllByRole("button")
          .map((item) => item.textContent),
      ).toEqual(["Appearance", "Editor", "Files", "Keyboard Shortcuts", "About"]);
      expect(within(dialog).getByRole("button", { name: "Appearance" })).toHaveAttribute("aria-current", "page");
      expect(within(dialog).getByRole("button", { name: "Appearance" })).toHaveFocus();
      await user.click(within(dialog).getByRole("button", { name: "Editor" }));
      expect(within(dialog).getByRole("switch", { name: "Word wrap" })).toBeInTheDocument();
    });

    it("sets the theme in Appearance, and has no theme button outside it", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await screen.findByRole("button", { name: "Open Folder…" });
      expect(screen.queryByRole("button", { name: /theme/i })).not.toBeInTheDocument();

      await user.keyboard("{Control>},{/Control}");
      const dialog = await settingsDialog();
      await user.click(within(dialog).getByRole("radio", { name: "Light" }));
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
      expect(localStorage.getItem("vista-theme")).toBe("light");

      await user.click(within(dialog).getByRole("radio", { name: "System" }));
      expect(localStorage.getItem("vista-theme")).toBeNull();
      expect(within(dialog).getByRole("radio", { name: "System" })).toBeChecked();
    });

    it("shows the version in About, and checks for updates on request where the host has an updater", async () => {
      const user = userEvent.setup();
      const updater = { check: vi.fn().mockResolvedValue(null) };
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), updater }} />);
      await screen.findByRole("button", { name: "Open Folder…" });

      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
      await user.click(screen.getByRole("option", { name: "Settings: About Vista" }));

      const dialog = await settingsDialog();
      expect(within(dialog).getByRole("button", { name: "About" })).toHaveAttribute("aria-current", "page");
      expect(within(dialog).getByText(`Vista ${APP_VERSION}`)).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Check for Updates" }));
      expect(await findToast("Vista is up to date.")).toBeInTheDocument();
      expect(updater.check).toHaveBeenCalledTimes(1);
    });

    it("turns checking at startup on in About, and remembers it", async () => {
      const user = userEvent.setup();
      const updater = { check: vi.fn().mockResolvedValue(null) };
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), updater }} />);
      await screen.findByRole("button", { name: "Open Folder…" });

      await user.keyboard("{Control>},{/Control}");
      const dialog = await settingsDialog();
      await user.click(within(dialog).getByRole("button", { name: "About" }));
      const startupSwitch = within(dialog).getByRole("switch", { name: "Check at startup" });
      expect(startupSwitch).not.toBeChecked();
      await user.click(startupSwitch);

      expect(startupSwitch).toBeChecked();
      expect(JSON.parse(localStorage.getItem("vista.settings") ?? "null")).toMatchObject({
        updates: { checkAtStartup: true },
      });
      // It applies from the next start; turning it on asks nothing now.
      expect(updater.check).not.toHaveBeenCalled();
    });

    it("offers no update check in About when the host has no updater", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await screen.findByRole("button", { name: "Open Folder…" });

      await user.keyboard("{Control>},{/Control}");
      const dialog = await settingsDialog();
      await user.click(within(dialog).getByRole("button", { name: "About" }));

      expect(within(dialog).getByText(`Vista ${APP_VERSION}`)).toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: "Check for Updates" })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole("switch", { name: "Check at startup" })).not.toBeInTheDocument();
    });
  });

  describe("workspace settings", () => {
    async function openWorkspaceSettings(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole("button", { name: "Research" }));
      await user.click(screen.getByRole("menuitem", { name: "Workspace Settings…" }));
      return screen.findByRole("region", { name: "Settings" });
    }

    function storedWorkspace() {
      return JSON.parse(localStorage.getItem("vista.workspaces") ?? "null").workspaces[0];
    }

    it("renames the workspace as the name is typed, and keeps the old name while it is invalid", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await openWorkspaceSettings(user);
      const name = within(dialog).getByRole("textbox", { name: "Name" });

      await user.clear(name);
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a name. The name stays “Research”.");
      expect(storedWorkspace().name).toBe("Research");
      await user.type(name, "  Thesis ");

      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
      expect(storedWorkspace().name).toBe("Thesis");
      await user.click(within(dialog).getByRole("button", { name: "Close Settings" }));
      expect(screen.getByRole("button", { name: "Thesis" })).toBeInTheDocument();
    });

    it("refuses a name longer than 80 characters", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await openWorkspaceSettings(user);
      const name = within(dialog).getByRole("textbox", { name: "Name" });

      await user.clear(name);
      await user.paste("x".repeat(81));

      expect(within(dialog).getByRole("alert")).toHaveTextContent("Use at most 80 characters.");
      expect(storedWorkspace().name).toBe("Research");
    });

    it("changes the icon and colour at once", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await openWorkspaceSettings(user);

      await user.click(within(dialog).getByRole("radio", { name: "Book" }));
      await user.click(within(dialog).getByRole("radio", { name: "Rose" }));

      expect(within(dialog).getByRole("radio", { name: "Book" })).toBeChecked();
      expect(within(dialog).getByRole("radio", { name: "Rose" })).toBeChecked();
      expect(storedWorkspace()).toMatchObject({ icon: "book-open", color: "rose" });
    });

    it("takes a custom colour once the picker commits it, and leaves the palette's swatches unchosen", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await openWorkspaceSettings(user);
      const picker = within(dialog).getByLabelText("Custom colour");

      // Moving across the picker previews the colour without saving it.
      fireEvent.input(picker, { target: { value: "#3a7bd5" } });
      expect(storedWorkspace().color).not.toBe("#3a7bd5");

      fireEvent.change(picker, { target: { value: "#3A7BD5" } });

      expect(storedWorkspace().color).toBe("#3a7bd5");
      for (const radio of within(dialog).getAllByRole("radio", { name: /^(Neutral|Indigo|Emerald|Amber|Rose)$/ })) {
        expect(radio).not.toBeChecked();
      }

      await user.click(within(dialog).getByRole("radio", { name: "Rose" }));
      expect(storedWorkspace().color).toBe("rose");
    });

    it("lists the folders, and removes one after asking", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await openWorkspaceSettings(user);
      expect(
        within(dialog)
          .getAllByRole("listitem")
          .map((item) => item.querySelector(".truncate")?.textContent),
      ).toEqual(["notes", "sources"]);

      await user.click(within(dialog).getByRole("button", { name: 'Remove "sources" from the workspace' }));
      const confirm = await screen.findByRole("dialog", { name: 'Remove "sources" from the workspace?' });
      await user.click(within(confirm).getByRole("button", { name: "Remove" }));

      await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(1));
      expect(storedWorkspace().folderIds).toEqual(["notes"]);
      expect(within(dialog).queryByRole("button", { name: /^Remove "notes"/ })).not.toBeInTheDocument();
    });

    it("adds a folder from Settings", async () => {
      const user = userEvent.setup();
      const extra = { id: "drafts", name: "drafts", rootPath: "/drafts" };
      const { capability } = createFoldersCapability([
        ...storedFolders(),
        { folder: extra, files: { "d.txt": PLAIN_TEXT } },
      ]);
      localStorage.setItem(
        "vista.workspaces",
        JSON.stringify({
          version: 1,
          lastWorkspaceId: "w1",
          workspaces: [{ id: "w1", name: "Research", folderIds: ["notes"], lastOpenedAt: 1 }],
        }),
      );
      vi.mocked(capability.pickFolder).mockResolvedValueOnce(extra);
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("a.txt");
      const dialog = await openWorkspaceSettings(user);

      await user.click(within(dialog).getByRole("button", { name: "Add Folder to Workspace" }));

      await waitFor(() =>
        expect(
          within(dialog)
            .getAllByRole("listitem")
            .map((item) => item.querySelector(".truncate")?.textContent),
        ).toEqual(["notes", "drafts"]),
      );
      expect(storedWorkspace().folderIds).toEqual(["notes", "drafts"]);
    });
  });

  describe("workspace details in the folder", () => {
    async function openWorkspaceSettings(user: ReturnType<typeof userEvent.setup>, name = "Research") {
      const buttons = await screen.findAllByRole("button", { name });
      await user.click(buttons.find((button) => button.getAttribute("aria-haspopup") === "menu")!);
      await user.click(screen.getByRole("menuitem", { name: "Workspace Settings…" }));
      return screen.findByRole("region", { name: "Settings" });
    }

    function storedWorkspace() {
      return JSON.parse(localStorage.getItem("vista.workspaces") ?? "null").workspaces[0];
    }

    function workspaceFile(text: string | undefined) {
      return text === undefined ? undefined : JSON.parse(text);
    }

    async function storeInNotes(user: ReturnType<typeof userEvent.setup>, folder: (id: string) => MemoryWorkspace) {
      const dialog = await openWorkspaceSettings(user);
      await user.click(within(dialog).getByRole("radio", { name: "In notes/.vista" }));
      await waitFor(() => expect(folder("notes").textOf(".vista/workspace.json")).toBeDefined());
      return dialog;
    }

    it("stores the details in the home folder, with each folder's location", async () => {
      const user = userEvent.setup();
      const { capability, folder } = createFoldersCapability(storedFolders(), {
        relativeLocation: vi.fn(async () => null),
      });
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await openWorkspaceSettings(user);
      expect(within(dialog).getByRole("radio", { name: "On this device" })).toBeChecked();

      await user.click(within(dialog).getByRole("radio", { name: "In notes/.vista" }));

      await waitFor(() => expect(within(dialog).getByRole("radio", { name: "In notes/.vista" })).toBeChecked());
      expect(workspaceFile(folder("notes").textOf(".vista/workspace.json"))).toEqual({
        version: 1,
        name: "Research",
        icon: "folder",
        color: "neutral",
        folders: [".", "../sources"],
      });
      expect(storedWorkspace()).toMatchObject({
        storage: "folder",
        locations: { ".": "notes", "../sources": "sources" },
      });
    });

    it("uses the location the host gives for a folder", async () => {
      const user = userEvent.setup();
      const { capability, folder } = createFoldersCapability(storedFolders(), {
        relativeLocation: vi.fn(async () => "deep/sources"),
      });
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      await storeInNotes(user, folder);

      expect(workspaceFile(folder("notes").textOf(".vista/workspace.json"))?.folders).toEqual([".", "deep/sources"]);
    });

    it("keeps the details on the device when two folders would share a location, and says why", async () => {
      const user = userEvent.setup();
      const other: WorkspaceFolder = { id: "other", name: "sources", rootPath: "/elsewhere/sources" };
      const { capability, folder } = createFoldersCapability(
        [...storedFolders(), { folder: other, files: { "b.txt": PLAIN_TEXT } }],
        { relativeLocation: vi.fn(async () => null) },
      );
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await openWorkspaceSettings(user);

      await user.click(within(dialog).getByRole("radio", { name: "In notes/.vista" }));

      expect(
        await findToast(
          'Two folders named "sources" would both be recorded as "../sources", so the details stay on this device.',
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("radio", { name: "On this device" })).toBeChecked();
      expect(folder("notes").textOf(".vista/workspace.json")).toBeUndefined();
      expect(storedWorkspace().storage).not.toBe("folder");
    });

    it("refuses adding a folder that would share another folder's location in the file", async () => {
      const user = userEvent.setup();
      const { capability, folder } = createFoldersCapability(storedFolders(), {
        relativeLocation: vi.fn(async () => null),
      });
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      await storeInNotes(user, folder);
      vi.mocked(capability.pickFolder).mockResolvedValueOnce({
        id: "other",
        name: "sources",
        rootPath: "/elsewhere/sources",
      });

      await user.click(within(explorerPanel()).getByRole("button", { name: "Add Folder to Workspace" }));

      expect(
        await findToast(
          '"sources" would be recorded as "../sources", like another folder of this workspace, so it can\'t be added while the details are stored in "notes".',
        ),
      ).toBeInTheDocument();
      expect(storedWorkspace().folderIds).toEqual(["notes", "sources"]);
      expect(capability.forgetFolder).toHaveBeenCalledWith("other");
    });

    it("forgets a folder the workspace file no longer lists once no workspace holds it", async () => {
      const { capability } = createFoldersCapability([
        {
          folder: NOTES_FOLDER,
          files: {
            "a.txt": PLAIN_TEXT,
            ".vista/workspace.json": JSON.stringify({ version: 1, name: "Research", folders: ["."] }),
          },
        },
        { folder: SOURCES_FOLDER, files: { "plan.txt": PLAIN_TEXT } },
      ]);
      localStorage.setItem(
        "vista.workspaces",
        JSON.stringify({
          version: 1,
          lastWorkspaceId: "w1",
          workspaces: [
            {
              id: "w1",
              name: "Research",
              folderIds: ["notes", "sources"],
              storage: "folder",
              locations: { ".": "notes", "../sources": "sources" },
              lastOpenedAt: 1,
            },
          ],
        }),
      );
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      await findFileRows("a.txt");

      await waitFor(() => expect(capability.forgetFolder).toHaveBeenCalledWith("sources"));
      expect(storedWorkspace().folderIds).toEqual(["notes"]);
    });

    it("rewrites the file when the workspace's details change", async () => {
      const user = userEvent.setup();
      const { capability, folder } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await storeInNotes(user, folder);

      const name = within(dialog).getByRole("textbox", { name: "Name" });
      await user.clear(name);
      await user.type(name, "Thesis");
      await user.click(within(dialog).getByRole("radio", { name: "Rose" }));

      await waitFor(() =>
        expect(workspaceFile(folder("notes").textOf(".vista/workspace.json"))).toMatchObject({
          name: "Thesis",
          color: "rose",
        }),
      );
    });

    it("keeps the details on the device when the file can't be written, and says why", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(storedFolders());
      vi.mocked(capability.writeFile).mockRejectedValueOnce(
        new Error("Permission to write to this folder was not granted."),
      );
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await openWorkspaceSettings(user);

      await user.click(within(dialog).getByRole("radio", { name: "In notes/.vista" }));

      expect(
        await screen.findByText(
          'Couldn\'t store the details in "notes/.vista". Permission to write to this folder was not granted.',
        ),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("radio", { name: "On this device" })).toBeChecked();
      expect(storedWorkspace().storage).toBe("device");
    });

    it("deletes the file after asking when the details move back to the device", async () => {
      const user = userEvent.setup();
      const { capability, folder } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await storeInNotes(user, folder);

      await user.click(within(dialog).getByRole("radio", { name: "On this device" }));
      const confirm = await screen.findByRole("dialog", { name: "Store the details on this device?" });
      expect(confirm).toHaveTextContent('Vista deletes "notes/.vista/workspace.json"');
      await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
      expect(folder("notes").textOf(".vista/workspace.json")).toBeDefined();
      expect(within(dialog).getByRole("radio", { name: "In notes/.vista" })).toBeChecked();

      await user.click(within(dialog).getByRole("radio", { name: "On this device" }));
      await user.click(
        within(await screen.findByRole("dialog", { name: "Store the details on this device?" })).getByRole("button", {
          name: "Delete File",
        }),
      );

      await waitFor(() => expect(folder("notes").textOf(".vista/workspace.json")).toBeUndefined());
      expect(within(dialog).getByRole("radio", { name: "On this device" })).toBeChecked();
      expect(storedWorkspace().storage).toBe("device");
      expect(storedWorkspace().locations).toBeUndefined();
    });

    it("won't remove the home folder while the details are stored in it", async () => {
      const user = userEvent.setup();
      const { capability, folder } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await storeInNotes(user, folder);

      await user.click(within(dialog).getByRole("button", { name: 'Remove "notes" from the workspace' }));

      expect(
        await screen.findByText("The workspace's details are stored in this folder. Store them on this device first."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: 'Remove "notes" from the workspace?' })).not.toBeInTheDocument();
      expect(storedWorkspace().folderIds).toEqual(["notes", "sources"]);
    });

    it("rewrites the file without a folder removed from the workspace", async () => {
      const user = userEvent.setup();
      const { capability, folder } = createFoldersCapability(storedFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("plan.txt");
      const dialog = await storeInNotes(user, folder);

      await user.click(within(dialog).getByRole("button", { name: 'Remove "sources" from the workspace' }));
      await user.click(
        within(await screen.findByRole("dialog", { name: 'Remove "sources" from the workspace?' })).getByRole(
          "button",
          { name: "Remove" },
        ),
      );

      await waitFor(() =>
        expect(workspaceFile(folder("notes").textOf(".vista/workspace.json"))?.folders).toEqual(["."]),
      );
    });

    it("doesn't offer the folder for a folder this browser can't write to", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability({
        pickFolder: vi.fn().mockResolvedValue({ id: "f1", name: "My Notes", rootPath: "/", accessMode: "fallback" }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await user.click(await screen.findByRole("button", { name: "Open Folder…" }));
      const dialog = await openWorkspaceSettings(user, "My Notes");

      // With one place to keep them, there is nothing to choose.
      expect(within(dialog).getByRole("textbox", { name: "Name" })).toBeInTheDocument();
      expect(within(dialog).queryByRole("radio", { name: "On this device" })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole("radio", { name: "In My Notes/.vista" })).not.toBeInTheDocument();
    });
  });

  describe("opening a folder that holds workspace details", () => {
    const DRAFTS_FOLDER: WorkspaceFolder = { id: "drafts", name: "drafts", rootPath: "/drafts" };
    const fileText = (details: object) => JSON.stringify({ version: 1, ...details });

    /** `drafts` holds the details of Thesis, whose other folder is `../sources`; Research holds `notes`. */
    function thesisFolders(
      text = fileText({ name: "Thesis", icon: "book-open", folders: [".", "../sources"] }),
    ): StoredFolder[] {
      return [
        { folder: NOTES_FOLDER, files: { "a.txt": PLAIN_TEXT } },
        { folder: DRAFTS_FOLDER, files: { "d.txt": PLAIN_TEXT, ".vista/workspace.json": text } },
        { folder: SOURCES_FOLDER, files: { "plan.txt": PLAIN_TEXT } },
      ];
    }

    function researchOnly(setup: ReturnType<typeof createFoldersCapability>) {
      localStorage.setItem(
        "vista.workspaces",
        JSON.stringify({
          version: 1,
          lastWorkspaceId: "w1",
          workspaces: [{ id: "w1", name: "Research", folderIds: ["notes"], lastOpenedAt: 1 }],
        }),
      );
      return setup;
    }

    async function openFolderFromSwitcher(user: ReturnType<typeof userEvent.setup>, current: string) {
      const buttons = await screen.findAllByRole("button", { name: current });
      await user.click(buttons.find((button) => button.getAttribute("aria-haspopup") === "menu")!);
      await user.click(screen.getByRole("menuitem", { name: "Open Folder…" }));
    }

    function switcherButton(name: string) {
      return screen.getAllByRole("button", { name }).find((button) => button.getAttribute("aria-haspopup") === "menu");
    }

    function storedThesis() {
      const list = JSON.parse(localStorage.getItem("vista.workspaces") ?? "null");
      return list.workspaces.find((workspace: { name: string }) => workspace.name === "Thesis");
    }

    it("opens the workspace the file describes, finding its other folders on the desktop", async () => {
      const user = userEvent.setup();
      const { capability } = researchOnly(
        createFoldersCapability(thesisFolders(), {
          resolveRelative: vi.fn(async (_from, location: string) =>
            location === "../sources" ? SOURCES_FOLDER : null,
          ),
        }),
      );
      vi.mocked(capability.pickFolder).mockResolvedValueOnce(DRAFTS_FOLDER);
      render(<App adapter={{ platform: "native", workspace: capability }} />);
      await findFileRows("a.txt");

      await openFolderFromSwitcher(user, "Research");

      expect(await within(await findExplorerPanel()).findByRole("button", { name: "plan.txt" })).toBeInTheDocument();
      expect(within(explorerPanel()).getByRole("button", { name: "d.txt" })).toBeInTheDocument();
      expect(switcherButton("Thesis")).toBeDefined();
      expect(storedThesis()).toMatchObject({
        icon: "book-open",
        folderIds: ["drafts", "sources"],
        storage: "folder",
        locations: { ".": "drafts", "../sources": "sources" },
      });
      expect(capability.writeFile).not.toHaveBeenCalled();
    });

    it("asks for a folder the browser can't find by itself, by its name", async () => {
      const user = userEvent.setup();
      const { capability } = researchOnly(
        createFoldersCapability(thesisFolders(fileText({ name: "Thesis", folders: [".", "../shelf/sources"] }))),
      );
      vi.mocked(capability.pickFolder)
        .mockResolvedValueOnce(DRAFTS_FOLDER)
        .mockResolvedValueOnce(NOTES_FOLDER)
        .mockResolvedValueOnce(SOURCES_FOLDER);
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("a.txt");
      await openFolderFromSwitcher(user, "Research");
      await within(await findExplorerPanel()).findByRole("button", { name: "d.txt" });
      expect(
        within(explorerPanel()).getByText("This folder can't be found. It may have been moved or deleted."),
      ).toBeInTheDocument();

      await user.click(within(explorerPanel()).getByRole("button", { name: "Locate…" }));
      expect(await screen.findByText('Pick the folder named "sources".')).toBeInTheDocument();
      expect(capability.forgetFolder).not.toHaveBeenCalledWith("notes");

      await user.click(within(explorerPanel()).getByRole("button", { name: "Locate…" }));

      expect(await within(await findExplorerPanel()).findByRole("button", { name: "plan.txt" })).toBeInTheDocument();
      expect(storedThesis()).toMatchObject({
        folderIds: ["drafts", "sources"],
        locations: { ".": "drafts", "../shelf/sources": "sources" },
      });
      expect(capability.writeFile).not.toHaveBeenCalled();
    });

    it("drops a folder that wasn't found from the workspace and its file", async () => {
      const user = userEvent.setup();
      const { capability, folder } = researchOnly(createFoldersCapability(thesisFolders()));
      vi.mocked(capability.pickFolder).mockResolvedValueOnce(DRAFTS_FOLDER);
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("a.txt");
      await openFolderFromSwitcher(user, "Research");
      await within(await findExplorerPanel()).findByRole("button", { name: "Locate…" });

      await user.click(within(explorerPanel()).getByRole("button", { name: "Remove Folder from Workspace" }));
      const dialog = await screen.findByRole("dialog", { name: 'Remove "sources" from the workspace?' });
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      await waitFor(() =>
        expect(within(explorerPanel()).queryByRole("button", { name: "Locate…" })).not.toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(JSON.parse(folder("drafts").textOf(".vista/workspace.json") ?? "null")?.folders).toEqual(["."]),
      );
    });

    it("opens a folder whose file it can't read as a plain folder, and leaves the file alone", async () => {
      const user = userEvent.setup();
      const text = JSON.stringify({ version: 2, name: "Thesis" });
      const { capability, folder } = researchOnly(createFoldersCapability(thesisFolders(text)));
      vi.mocked(capability.pickFolder).mockResolvedValueOnce(DRAFTS_FOLDER);
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("a.txt");

      await openFolderFromSwitcher(user, "Research");

      expect(
        await screen.findByText(
          '"drafts" has workspace details this version of Vista can\'t read, so it opened as a plain folder.',
        ),
      ).toBeInTheDocument();
      expect(switcherButton("drafts")).toBeDefined();
      expect(storedThesis()).toBeUndefined();
      expect(folder("drafts").textOf(".vista/workspace.json")).toBe(text);
    });

    it("doesn't read a file over the size limit, and opens the folder as a plain folder", async () => {
      const user = userEvent.setup();
      const { capability, folder } = researchOnly(createFoldersCapability(thesisFolders()));
      vi.mocked(capability.stat).mockImplementation(async (target, path) =>
        path === ".vista/workspace.json"
          ? { size: 20 * 1024 * 1024, modifiedAt: 1 }
          : folder(target.id).stat(target, path),
      );
      vi.mocked(capability.pickFolder).mockResolvedValueOnce(DRAFTS_FOLDER);
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("a.txt");

      await openFolderFromSwitcher(user, "Research");

      expect(
        await screen.findByText(
          '"drafts" has workspace details this version of Vista can\'t read, so it opened as a plain folder.',
        ),
      ).toBeInTheDocument();
      expect(capability.readFile).not.toHaveBeenCalledWith(DRAFTS_FOLDER, ".vista/workspace.json");
      expect(storedThesis()).toBeUndefined();
    });

    it("reads the file again when the workspace reopens, so changes made elsewhere show", async () => {
      const { capability, folder } = createFoldersCapability(thesisFolders());
      localStorage.setItem(
        "vista.workspaces",
        JSON.stringify({
          version: 1,
          lastWorkspaceId: "w2",
          workspaces: [
            {
              id: "w2",
              name: "Thesis",
              folderIds: ["drafts", "sources"],
              storage: "folder",
              locations: { ".": "drafts", "../sources": "sources" },
              lastOpenedAt: 1,
            },
          ],
        }),
      );
      await folder("drafts").writeFile(
        DRAFTS_FOLDER,
        ".vista/workspace.json",
        new TextEncoder().encode(fileText({ name: "Dissertation", color: "amber", folders: [".", "../sources"] })),
      );
      vi.mocked(capability.writeFile).mockClear();
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      expect(await within(await findExplorerPanel()).findByRole("button", { name: "plan.txt" })).toBeInTheDocument();
      expect(switcherButton("Dissertation")).toBeDefined();
      expect(JSON.parse(localStorage.getItem("vista.workspaces") ?? "null").workspaces[0]).toMatchObject({
        name: "Dissertation",
        color: "amber",
      });
      expect(capability.writeFile).not.toHaveBeenCalled();
    });

    /** Thesis, stored in `drafts` with `sources` at `sourcesLocation`, opened last; `drafts` holds `text`. */
    async function storedThesisWith(text: string, sourcesLocation = "../sources") {
      const setup = createFoldersCapability(thesisFolders());
      localStorage.setItem(
        "vista.workspaces",
        JSON.stringify({
          version: 1,
          lastWorkspaceId: "w2",
          workspaces: [
            {
              id: "w2",
              name: "Thesis",
              folderIds: ["drafts", "sources"],
              storage: "folder",
              locations: { ".": "drafts", [sourcesLocation]: "sources" },
              lastOpenedAt: 1,
            },
          ],
        }),
      );
      await setup.folder("drafts").writeFile(DRAFTS_FOLDER, ".vista/workspace.json", new TextEncoder().encode(text));
      vi.mocked(setup.capability.writeFile).mockClear();
      return setup;
    }

    it("writes the file again once the details change after it was read", async () => {
      const user = userEvent.setup();
      const { capability, folder } = await storedThesisWith(fileText({ name: "Thesis", folders: [".", "../sources"] }));
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await within(await findExplorerPanel()).findByRole("button", { name: "plan.txt" });

      await user.click(switcherButton("Thesis")!);
      await user.click(screen.getByRole("menuitem", { name: "Workspace Settings…" }));
      const dialog = await screen.findByRole("region", { name: "Settings" });
      await user.clear(within(dialog).getByRole("textbox", { name: "Name" }));
      await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Dissertation");

      await waitFor(() =>
        expect(JSON.parse(folder("drafts").textOf(".vista/workspace.json") ?? "null")).toMatchObject({
          name: "Dissertation",
          folders: [".", "../sources"],
        }),
      );
    });

    it("reads the file once access to its folder is allowed, and doesn't write over it", async () => {
      const user = userEvent.setup();
      const { capability } = await storedThesisWith(
        fileText({ name: "Dissertation", color: "amber", folders: [".", "../sources"] }),
      );
      let isAllowed = false;
      capability.restoreFolder.mockImplementation(async (id) => {
        if (id === "sources") {
          return { status: "restored", folder: SOURCES_FOLDER };
        }
        return isAllowed
          ? { status: "restored", folder: DRAFTS_FOLDER }
          : { status: "needs-permission", name: "drafts" };
      });
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await user.click(await screen.findByRole("button", { name: "Thesis" }));
      await within(await findExplorerPanel()).findByRole("button", { name: "plan.txt" });

      isAllowed = true;
      await user.click(within(explorerPanel()).getByRole("button", { name: "Allow access" }));

      expect(await within(await findExplorerPanel()).findByRole("button", { name: "d.txt" })).toBeInTheDocument();
      expect(switcherButton("Dissertation")).toBeDefined();
      expect(JSON.parse(localStorage.getItem("vista.workspaces") ?? "null").workspaces[0]).toMatchObject({
        name: "Dissertation",
        color: "amber",
      });
      expect(capability.writeFile).not.toHaveBeenCalled();
    });

    it("keeps a folder's location when access to it is allowed", async () => {
      const user = userEvent.setup();
      const { capability, folder } = await storedThesisWith(
        fileText({ name: "Thesis", folders: [".", "inner/sources"] }),
        "inner/sources",
      );
      let isAllowed = false;
      capability.restoreFolder.mockImplementation(async (id) => {
        if (id === "drafts") {
          return { status: "restored", folder: DRAFTS_FOLDER };
        }
        return isAllowed
          ? { status: "restored", folder: SOURCES_FOLDER }
          : { status: "needs-permission", name: "sources" };
      });
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await user.click(await screen.findByRole("button", { name: "Thesis" }));
      await within(await findExplorerPanel()).findByRole("button", { name: "d.txt" });

      isAllowed = true;
      await user.click(within(explorerPanel()).getByRole("button", { name: "Allow access" }));
      expect(await within(explorerPanel()).findByRole("button", { name: "plan.txt" })).toBeInTheDocument();

      await user.click(switcherButton("Thesis")!);
      await user.click(screen.getByRole("menuitem", { name: "Workspace Settings…" }));
      const dialog = await screen.findByRole("region", { name: "Settings" });
      await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "!");
      await waitFor(() =>
        expect(JSON.parse(folder("drafts").textOf(".vista/workspace.json") ?? "null")).toMatchObject({
          name: "Thesis!",
          folders: [".", "inner/sources"],
        }),
      );
    });

    it("reopens a workspace whose file it can no longer read as a plain folder", async () => {
      const text = JSON.stringify({ version: 2, name: "Thesis" });
      const { capability, folder } = await storedThesisWith(text);
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      expect(
        await screen.findByText(
          '"drafts" has workspace details this version of Vista can\'t read, so it opened as a plain folder.',
        ),
      ).toBeInTheDocument();
      expect(await within(await findExplorerPanel()).findByRole("button", { name: "d.txt" })).toBeInTheDocument();
      expect(within(explorerPanel()).queryByRole("button", { name: "plan.txt" })).not.toBeInTheDocument();
      expect(switcherButton("drafts")).toBeDefined();
      expect(folder("drafts").textOf(".vista/workspace.json")).toBe(text);
    });

    it("keeps the details on the device when the file is gone from the folder", async () => {
      const { capability } = createFoldersCapability([{ folder: DRAFTS_FOLDER, files: { "d.txt": PLAIN_TEXT } }]);
      localStorage.setItem(
        "vista.workspaces",
        JSON.stringify({
          version: 1,
          lastWorkspaceId: "w2",
          workspaces: [
            {
              id: "w2",
              name: "Thesis",
              folderIds: ["drafts"],
              storage: "folder",
              locations: { ".": "drafts" },
              lastOpenedAt: 1,
            },
          ],
        }),
      );
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      expect(
        await screen.findByText(
          '"drafts/.vista/workspace.json" is gone, so the workspace\'s details are kept on this device now.',
        ),
      ).toBeInTheDocument();
      expect(await within(await findExplorerPanel()).findByRole("button", { name: "d.txt" })).toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("vista.workspaces") ?? "null").workspaces[0].storage).toBe("device");
      expect(capability.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("recent workspaces", () => {
    /** Research holds `notes`, Work holds `sources`; Research was used last unless `lastWorkspaceId` says otherwise. */
    function twoWorkspaces(lastWorkspaceId: string | null = "w1", workFolderIds = ["sources"]) {
      const setup = createFoldersCapability(storedFolders());
      localStorage.setItem(
        "vista.workspaces",
        JSON.stringify({
          version: 1,
          lastWorkspaceId,
          workspaces: [
            { id: "w1", name: "Research", icon: "book-open", folderIds: ["notes"], lastOpenedAt: 2 },
            { id: "w2", name: "Work", folderIds: workFolderIds, lastOpenedAt: 1 },
          ],
        }),
      );
      return setup;
    }

    it("switches workspaces from the switcher, and each keeps its own tabs", async () => {
      const user = userEvent.setup();
      const { capability } = twoWorkspaces();
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await user.click((await findFileRows("a.txt"))[0]!);
      await screen.findByRole("textbox", { name: "Raw text content of a.txt" });

      await user.click(screen.getByRole("button", { name: "Research" }));
      expect(screen.getByRole("menuitemradio", { name: "Research" })).toBeChecked();
      const work = await screen.findByRole("menuitemradio", { name: "Work" });
      await user.click(work);

      expect(await within(await findExplorerPanel()).findByRole("button", { name: "plan.txt" })).toBeInTheDocument();
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Work" }));
      await user.click(screen.getByRole("menuitemradio", { name: "Research" }));

      expect(await screen.findByRole("textbox", { name: "Raw text content of a.txt" })).toBeInTheDocument();
      expect(capability.restoreFolder).toHaveBeenLastCalledWith("notes", { interactive: true });
    });

    it("still shows a restored tab after switching to a workspace with the same folder mid-read", async () => {
      const user = userEvent.setup();
      // Both workspaces hold `notes` and restore a tab of its a.txt; the host opens a new folder object each time.
      const { capability, folder } = twoWorkspaces("w1", ["notes"]);
      for (const id of ["w1", "w2"]) {
        localStorage.setItem(
          `vista.session.${id}`,
          JSON.stringify({ version: 1, tabs: [{ folderId: "notes", path: "a.txt", viewMode: "raw" }], activeIndex: 0 }),
        );
      }
      capability.restoreFolder.mockImplementation(async (id) =>
        id === "notes" ? { status: "restored", folder: { ...NOTES_FOLDER } } : { status: "none" },
      );
      let releaseFirstRead = () => {};
      const firstRead = new Promise<void>((resolve) => {
        releaseFirstRead = resolve;
      });
      let reads = 0;
      capability.readFile.mockImplementation(async (target, path) => {
        if (path === "a.txt" && reads++ === 0) {
          await firstRead;
        }
        return folder("notes").readFile(target, path);
      });
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await waitFor(() => expect(reads).toBe(1));

      await user.click(screen.getByRole("button", { name: "Research" }));
      await user.click(await screen.findByRole("menuitemradio", { name: "Work" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument());
      releaseFirstRead();

      expect(await screen.findByRole("textbox", { name: "Raw text content of a.txt" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /^a.txt/ })).toBeInTheDocument();
    });

    it("closes the workspace to the start screen, and reopening it brings back its tabs", async () => {
      const user = userEvent.setup();
      const { capability } = twoWorkspaces();
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await user.click((await findFileRows("a.txt"))[0]!);
      await screen.findByRole("textbox", { name: "Raw text content of a.txt" });

      await user.click(screen.getByRole("button", { name: "Research" }));
      await user.click(await screen.findByRole("menuitem", { name: "Close Workspace" }));

      expect(await screen.findByRole("heading", { name: "Recent workspaces" })).toBeInTheDocument();
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("vista.workspaces") ?? "null").lastWorkspaceId).toBeNull();

      await user.click(screen.getByRole("button", { name: "Research" }));
      expect(await screen.findByRole("textbox", { name: "Raw text content of a.txt" })).toBeInTheDocument();
    });

    it("lists every remembered workspace on the start screen, without its folders", async () => {
      const { capability } = twoWorkspaces(null);
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      expect(await screen.findByRole("heading", { name: "Recent workspaces" })).toBeInTheDocument();
      const research = await screen.findByRole("button", { name: "Research" });
      expect(research).not.toHaveAccessibleDescription(/notes/);
      expect(screen.getByRole("button", { name: "Work" })).not.toHaveAccessibleDescription(/sources/);
      expect(capability.restoreFolder).not.toHaveBeenCalledWith(expect.anything(), { interactive: true });
    });

    it("removes a workspace from Recent after asking, forgetting the folders no workspace holds", async () => {
      const user = userEvent.setup();
      // Work shares `notes` with Research, so only `sources` is forgotten.
      const { capability, folder } = twoWorkspaces(null, ["sources", "notes"]);
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      await user.click(await screen.findByRole("button", { name: 'Remove "Work" from Recent' }));
      const dialog = await screen.findByRole("dialog", { name: 'Remove "Work" from Recent?' });
      expect(dialog).toHaveTextContent(
        "Vista forgets this workspace and its tabs. Your folders and files aren't changed.",
      );
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      await waitFor(() => expect(screen.queryByRole("button", { name: "Work" })).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Research" })).toBeInTheDocument();
      expect(capability.forgetFolder).toHaveBeenCalledWith("sources");
      expect(capability.forgetFolder).not.toHaveBeenCalledWith("notes");
      expect(JSON.parse(localStorage.getItem("vista.workspaces") ?? "null").workspaces).toHaveLength(1);
      expect(folder("sources").textOf("plan.txt")).toBe(PLAIN_TEXT);
    });

    it("keeps a workspace in Recent when removing it is cancelled", async () => {
      const user = userEvent.setup();
      const { capability } = twoWorkspaces(null);
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      await user.click(await screen.findByRole("button", { name: 'Remove "Work" from Recent' }));
      const dialog = await screen.findByRole("dialog", { name: 'Remove "Work" from Recent?' });
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument();
      expect(capability.forgetFolder).not.toHaveBeenCalled();
    });
  });

  describe("sessions", () => {
    const SESSION_KEY = "vista.session.w1";

    function sessionFolders(): StoredFolder[] {
      return [
        {
          folder: NOTES_FOLDER,
          files: { "a.txt": PLAIN_TEXT, "docs/guide.md": README_CONTENT },
          tree: [
            { id: "a.txt", name: "a.txt", path: "a.txt", kind: "file", extension: "txt" },
            {
              id: "docs",
              name: "docs",
              path: "docs",
              kind: "directory",
              children: [
                { id: "docs/guide.md", name: "guide.md", path: "docs/guide.md", kind: "file", extension: "md" },
              ],
            },
          ],
        },
        { folder: SOURCES_FOLDER, files: { "plan.txt": PLAIN_TEXT } },
      ];
    }

    function storeSession(tabs: { folderId: string; path: string; viewMode: string }[], activeIndex: number) {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ version: 1, tabs, activeIndex, expanded: { notes: ["docs"] } }),
      );
    }

    function tabNames(): string[] {
      return screen.getAllByRole("tab").map((tab) => tab.textContent ?? "");
    }

    it("reopens the tabs in order with the active one, view modes, and expanded folders", async () => {
      const user = userEvent.setup();
      storeSession(
        [
          { folderId: "notes", path: "a.txt", viewMode: "raw" },
          { folderId: "notes", path: "docs/guide.md", viewMode: "raw" },
          { folderId: "sources", path: "plan.txt", viewMode: "raw" },
        ],
        2,
      );
      const { capability } = createFoldersCapability(sessionFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      expect(await screen.findByRole("textbox", { name: "Raw text content of plan.txt" })).toBeInTheDocument();
      expect(tabNames().map((name) => name.split(/\W/)[0])).toEqual(["a", "guide", "plan"]);
      expect(within(explorerPanel()).getByRole("button", { name: "docs", expanded: true })).toBeInTheDocument();
      // A tab's file is read when the tab is first shown.
      expect(capability.readFile).not.toHaveBeenCalledWith(NOTES_FOLDER, "docs/guide.md");

      await user.click(getTab("guide.md"));

      expect(await screen.findByRole("textbox", { name: "Raw text content of guide.md" })).toBeInTheDocument();
    });

    it("saves a moved tab's place in the session", async () => {
      const user = userEvent.setup();
      storeSession(
        [
          { folderId: "notes", path: "a.txt", viewMode: "raw" },
          { folderId: "sources", path: "plan.txt", viewMode: "raw" },
        ],
        1,
      );
      const { capability } = createFoldersCapability(sessionFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await screen.findByRole("textbox", { name: "Raw text content of plan.txt" });

      await runFromPalette(user, "Tabs: Move Tab Left");

      await waitFor(() => {
        const session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "{}");
        expect(session.tabs.map((tab: { path: string }) => tab.path)).toEqual(["plan.txt", "a.txt"]);
        expect(session.activeIndex).toBe(0);
      });
    });

    it("drops a tab whose file no longer exists and names it", async () => {
      storeSession(
        [
          { folderId: "notes", path: "gone.txt", viewMode: "raw" },
          { folderId: "notes", path: "a.txt", viewMode: "raw" },
        ],
        0,
      );
      const { capability } = createFoldersCapability(sessionFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      expect(await findToast('"gone.txt" from your last session no longer exists.')).toBeInTheDocument();
      expect(await screen.findByRole("textbox", { name: "Raw text content of a.txt" })).toBeInTheDocument();
      expect(tabNames()).toHaveLength(1);
    });

    it("counts the tabs it drops when several files no longer exist", async () => {
      storeSession(
        [
          { folderId: "notes", path: "gone.txt", viewMode: "raw" },
          { folderId: "sources", path: "lost.txt", viewMode: "raw" },
        ],
        0,
      );
      const { capability } = createFoldersCapability(sessionFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      expect(await findToast("2 files from your last session no longer exist.")).toBeInTheDocument();
      expect(screen.queryAllByRole("tab")).toHaveLength(0);
    });

    it("closes a restored tab whose file is deleted before it is shown", async () => {
      const user = userEvent.setup();
      storeSession(
        [
          { folderId: "notes", path: "a.txt", viewMode: "raw" },
          { folderId: "sources", path: "plan.txt", viewMode: "raw" },
        ],
        0,
      );
      const { capability, folder } = createFoldersCapability(sessionFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await screen.findByRole("textbox", { name: "Raw text content of a.txt" });

      folder("sources").deleteExternally("plan.txt");
      await user.click(getTab("plan.txt"));

      expect(await findToast('"plan.txt" no longer exists. It may have been moved or deleted.')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("tab", { name: /^plan\.txt/ })).not.toBeInTheDocument());
    });

    it("remembers the open tabs, the active one, and the expanded folders", async () => {
      const user = userEvent.setup();
      const { capability } = createFoldersCapability(sessionFolders());
      render(<App adapter={{ platform: "web", workspace: capability }} />);

      await user.click((await findFileRows("plan.txt"))[0]!);
      await user.click(within(explorerPanel()).getByRole("button", { name: "docs" }));
      await user.click(await within(await findExplorerPanel()).findByRole("button", { name: "guide.md" }));
      await user.click(await screen.findByRole("button", { name: "Raw" }));
      await user.click(getTab("plan.txt"));

      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null")).toEqual({
          version: 1,
          tabs: [
            { folderId: "sources", path: "plan.txt", viewMode: "raw" },
            { folderId: "notes", path: "docs/guide.md", viewMode: "raw" },
          ],
          activeIndex: 0,
          expanded: { notes: ["docs"] },
        }),
      );
    });

    it("keeps the stored session until it has been restored", async () => {
      storeSession([{ folderId: "notes", path: "a.txt", viewMode: "raw" }], 0);
      const stored = localStorage.getItem(SESSION_KEY);
      const { capability, folder } = createFoldersCapability(sessionFolders());
      // Restoring checks each tab's file first; this check never finishes.
      capability.stat = vi.fn((target: WorkspaceFolder, path: string) =>
        path === "a.txt" ? new Promise<never>(() => {}) : folder(target.id).stat(target, path),
      );
      render(<App adapter={{ platform: "web", workspace: capability }} />);
      await findFileRows("a.txt");

      expect(localStorage.getItem(SESSION_KEY)).toBe(stored);
    });
  });

  describe("tabs row", () => {
    it("ends with the active file's view switch and Find, with no header above the document", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await screen.findByRole("heading", { name: "Hello Vista" });

      const actions = screen.getByRole("group", { name: "Document actions" });
      const tabs = screen.getByRole("tablist", { name: "Open files" });
      expect(actions.parentElement).toBe(tabs.parentElement);
      expect(within(actions).getByRole("button", { name: "Rich text" })).toHaveAttribute("aria-pressed", "true");
      expect(within(actions).getByRole("button", { name: "Raw" })).toHaveAttribute("aria-pressed", "false");
      expect(within(actions).getByRole("button", { name: "Find" })).toBeInTheDocument();
      expect(within(actions).getAllByRole("button")).toHaveLength(3);
      expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
      expect(screen.getByRole("main").querySelector("header")).toBeNull();
    });

    it("names the CSV views Table and Raw, and shows no switch for a format with one view", async () => {
      const user = userEvent.setup();
      render(
        <App
          adapter={{
            platform: "web",
            workspace: createMemoryWorkspace({ "data.csv": CSV_CONTENT, "notes.txt": PLAIN_TEXT }),
          }}
        />,
      );
      await user.click(await screen.findByRole("button", { name: "Open Folder…" }));

      await user.click(await screen.findByText("data.csv"));
      const actions = screen.getByRole("group", { name: "Document actions" });
      expect(within(actions).getByRole("button", { name: "Table" })).toBeInTheDocument();
      await user.click(within(actions).getByRole("button", { name: "Raw" }));
      expect(await screen.findByRole("textbox", { name: /Raw text content of data\.csv/ })).toBeInTheDocument();

      await user.click(screen.getByText("notes.txt"));
      await screen.findByRole("textbox", { name: /Raw text content of notes\.txt/ });
      const textActions = screen.getByRole("group", { name: "Document actions" });
      expect(within(textActions).queryByRole("group", { name: "Document view mode" })).not.toBeInTheDocument();
      expect(within(textActions).getByRole("button", { name: "Find" })).toBeInTheDocument();
    });

    it("shows the editor settings gear only while the raw editor shows, and toggles a setting from it", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await screen.findByRole("heading", { name: "Hello Vista" });
      const actions = screen.getByRole("group", { name: "Document actions" });
      expect(within(actions).queryByRole("button", { name: "Editor settings" })).not.toBeInTheDocument();

      await user.click(within(actions).getByRole("button", { name: "Raw" }));
      await screen.findByRole("textbox", { name: /Raw text content of readme\.md/ });
      expect(document.querySelector(".cm-lineNumbers")).toBeInTheDocument();
      await user.click(await within(actions).findByRole("button", { name: "Editor settings" }));
      await user.click(
        within(screen.getByRole("menu", { name: "Editor settings" })).getByRole("menuitemcheckbox", {
          name: "Line numbers",
        }),
      );

      expect(document.querySelector(".cm-lineNumbers")).not.toBeInTheDocument();
      await user.click(within(actions).getByRole("button", { name: "Rich text" }));
      await waitFor(() =>
        expect(within(actions).queryByRole("button", { name: "Editor settings" })).not.toBeInTheDocument(),
      );
    });

    it("shows no view switch for a read-only file, which only opens raw", async () => {
      const user = userEvent.setup();
      // "café" in Windows-1252, which is not valid UTF-8.
      const mockWorkspace = createMemoryWorkspace(
        { "legacy.md": new Uint8Array([0x63, 0x61, 0x66, 0xe9]) },
        { tree: [{ id: "legacy.md", name: "legacy.md", path: "legacy.md", kind: "file", extension: "md" }] },
      );
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await user.click(await screen.findByRole("button", { name: "Open Folder…" }));
      await user.click(await screen.findByText("legacy.md"));
      await screen.findByRole("textbox", { name: /Raw text content of legacy\.md/i });

      const actions = screen.getByRole("group", { name: "Document actions" });
      expect(within(actions).queryByRole("group", { name: "Document view mode" })).not.toBeInTheDocument();
    });

    it("adds each tab's folder when two tabs share a file name, and shows the path bar's path in the tooltip", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMemoryWorkspace({ "docs/readme.md": "# Docs", "readme.md": "# Home" });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await user.click(await screen.findByRole("button", { name: "Open Folder…" }));
      const explorer = await findExplorerPanel();
      const [docsRow, homeRow] = await within(explorer).findAllByText("readme.md");
      await user.click(homeRow!);
      await screen.findByRole("heading", { name: "Home" });
      expect(screen.getByRole("tab", { name: "readme.md" })).toHaveAttribute("title", "My Notes / readme.md");

      await user.click(docsRow!);
      await screen.findByRole("heading", { name: "Docs" });
      expect(screen.getByRole("tab", { name: "readme.md · My Notes" })).toBeInTheDocument();
      const docsTab = screen.getByRole("tab", { name: "readme.md · docs" });
      expect(docsTab).toHaveAttribute("title", "My Notes / docs / readme.md");

      await user.click(screen.getByRole("button", { name: "Close readme.md · My Notes" }));
      expect(await screen.findByRole("tab", { name: "readme.md" })).toBe(docsTab);
    });

    it("covers the tabs with Settings and keeps them, with the document, until it closes", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await makeReadmeDirty(user);

      await user.keyboard("{Control>},{/Control}");
      const page = await screen.findByRole("region", { name: "Settings" });
      expect(within(page).getByRole("button", { name: "My Notes" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("tablist", { name: "Open files", hidden: true })).not.toBeVisible();
      await user.keyboard("{Escape}");

      expect(screen.queryByRole("region", { name: "Settings" })).not.toBeInTheDocument();
      expect(getTab("readme.md")).toBeVisible();
      expect(rawEditorText(editor)).not.toBe(README_CONTENT);
    });

    it("closes Settings when a file is opened from the explorer", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.keyboard("{Control>},{/Control}");
      await screen.findByRole("region", { name: "Settings" });
      await user.click(screen.getByText("readme.md"));

      expect(screen.queryByRole("region", { name: "Settings" })).not.toBeInTheDocument();
      expect(await screen.findByRole("heading", { name: "Hello Vista" })).toBeInTheDocument();
    });
  });

  describe("tabs", () => {
    it("opens each selected file in its own tab and switches between them", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.click(screen.getByText("readme.md"));
      await user.click(screen.getByText("data.csv"));
      await user.click(screen.getByRole("button", { name: "Raw" }));

      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["readme.md", "data.csv"]);
      expect(getTab("data.csv")).toHaveAttribute("aria-selected", "true");
      expect(rawEditorText(await screen.findByRole("textbox", { name: /Raw text content of data\.csv/i }))).toBe(
        CSV_CONTENT,
      );

      await user.click(getTab("readme.md"));

      expect(await screen.findByRole("heading", { name: "Hello Vista" })).toBeVisible();
    });

    it("moves the focused tab one place with Shift+Arrow keys, keeping it focused and active", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await user.click(screen.getByText("data.csv"));
      await user.click(getTab("readme.md"));
      getTab("readme.md").focus();

      await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["data.csv", "readme.md"]);
      expect(getTab("readme.md")).toHaveFocus();
      expect(getTab("readme.md")).toHaveAttribute("aria-selected", "true");

      // It stops at the end of the row.
      await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["data.csv", "readme.md"]);

      await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["readme.md", "data.csv"]);
      expect(getTab("readme.md")).toHaveFocus();
    });

    it("leaves focus alone on a later change after Shift+Arrow at the end of the row moved nothing", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      getTab("readme.md").focus();

      await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
      await user.click(screen.getByText("data.csv"));
      await waitFor(() => expect(getTab("data.csv")).toBeInTheDocument());

      expect(getTab("readme.md")).not.toHaveFocus();
    });

    it("moves the active tab with Move Tab Left and Move Tab Right in the palette", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await user.click(screen.getByText("data.csv"));

      await runFromPalette(user, "Tabs: Move Tab Left");
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["data.csv", "readme.md"]);

      await runFromPalette(user, "Tabs: Move Tab Right");
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["readme.md", "data.csv"]);
    });

    it("keeps unsaved edits in a tab while another file is opened, without asking", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);

      await user.click(screen.getByText("data.csv"));
      await user.click(screen.getByRole("button", { name: "Raw" }));
      await screen.findByRole("textbox", { name: /Raw text content of data\.csv/i });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.click(getTab("readme.md"));

      expect(rawEditorText(screen.getByRole("textbox", { name: /Raw text content of readme\.md/i }))).toBe(
        EDITED_README_CONTENT,
      );
      expect(mockWorkspace.writeFile).not.toHaveBeenCalled();
    });

    it("remembers each tab's view mode", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await user.click(await screen.findByRole("button", { name: "Raw" }));
      await user.click(screen.getByText("data.csv"));
      await user.click(await screen.findByRole("button", { name: "Table" }));

      await user.click(getTab("readme.md"));

      expect(await screen.findByRole("textbox", { name: /Raw text content of readme\.md/i })).toBeInTheDocument();
    });

    it("closes a clean tab without asking and shows the neighboring tab", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await user.click(screen.getByText("data.csv"));

      await user.click(screen.getByRole("button", { name: "Close data.csv" }));

      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["readme.md"]);
      expect(await screen.findByRole("heading", { name: "Hello Vista" })).toBeVisible();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes a tab with a middle click", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));

      fireEvent(getTab("readme.md"), new MouseEvent("auxclick", { bubbles: true, button: 1 }));

      await waitFor(() => expect(screen.queryByRole("tab")).not.toBeInTheDocument());
    });

    it("closes the active tab with Alt+W on the web host", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));

      await user.keyboard("{Alt>}w{/Alt}");

      await waitFor(() => expect(screen.queryByRole("tab")).not.toBeInTheDocument());
    });

    it("moves between tabs with the arrow keys", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await user.click(screen.getByText("data.csv"));
      getTab("data.csv").focus();

      await user.keyboard("{ArrowLeft}");

      expect(getTab("readme.md")).toHaveAttribute("aria-selected", "true");
      expect(getTab("readme.md")).toHaveFocus();
    });

    it("moves focus to the next active tab after closing a tab from the keyboard", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await user.click(screen.getByText("data.csv"));
      screen.getByRole("button", { name: "Close data.csv" }).focus();

      await user.keyboard("{Enter}");

      await waitFor(() => expect(getTab("readme.md")).toHaveFocus());
    });

    it("closes every tab inside a deleted folder", async () => {
      const user = userEvent.setup();
      const nestedTree: WorkspaceNode[] = [
        {
          id: "docs",
          name: "docs",
          path: "docs",
          kind: "directory",
          children: [
            { id: "docs/a.txt", name: "a.txt", path: "docs/a.txt", kind: "file", extension: "txt" },
            { id: "docs/b.txt", name: "b.txt", path: "docs/b.txt", kind: "file", extension: "txt" },
          ],
        },
        ...ROOT_TREE,
      ];
      render(
        <App
          adapter={{
            platform: "web",
            workspace: createMockWorkspaceCapability({ readTree: vi.fn().mockResolvedValue(nestedTree) }),
          }}
        />,
      );
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("docs"));
      await user.click(screen.getByText("a.txt"));
      await user.click(screen.getByText("b.txt"));
      await user.click(within(screen.getByRole("navigation", { name: "File Explorer" })).getByText("readme.md"));

      const explorer = screen.getByRole("navigation", { name: "File Explorer" });
      fireEvent.contextMenu(within(explorer).getByText("docs"));
      await user.click(screen.getByRole("menuitem", { name: "Delete" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));

      expect(await screen.findByText("2 open files were deleted.")).toBeInTheDocument();
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["readme.md"]);
    });
  });

  describe("raw editor", () => {
    it("shows the cursor position in the status bar only while the raw editor is shown", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      const statusBar = screen.getByRole("contentinfo", { name: "Status Bar" });
      await screen.findByRole("heading", { name: "Hello Vista" });
      expect(statusBar).not.toHaveTextContent("Ln");

      await user.click(screen.getByRole("button", { name: "Raw" }));
      await appendToRawEditor(
        user,
        await screen.findByRole("textbox", { name: /Raw text content of readme\.md/i }),
        "!",
      );
      expect(statusBar).toHaveTextContent("Ln 2, Col 16");

      await user.click(screen.getByRole("button", { name: "Rich text" }));
      expect(statusBar).not.toHaveTextContent("Ln");
    });

    it("starts a reopened file with a fresh editor state after its tab was closed", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await makeReadmeDirty(user);
      await user.click(screen.getByRole("button", { name: "Close readme.md" }));
      const dialog = await screen.findByRole("dialog", { name: "Save changes to readme.md?" });
      await user.click(within(dialog).getByRole("button", { name: "Don't Save" }));
      await waitFor(() => expect(screen.queryByRole("tab")).not.toBeInTheDocument());

      await user.click(screen.getByText("readme.md"));
      await user.click(await screen.findByRole("button", { name: "Raw" }));

      expect(screen.getByRole("contentinfo", { name: "Status Bar" })).toHaveTextContent("Ln 1, Col 1");
    });

    it("describes the document's lines, size, line endings, and format in the status bar", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.click(screen.getByText("data.csv"));

      const statusBar = screen.getByRole("contentinfo", { name: "Status Bar" });
      for (const fact of ["3 lines", "24 B", "LF", "CSV"]) {
        expect(within(statusBar).getByText(fact)).toBeInTheDocument();
      }
    });

    it("applies a setting from the Editor section of Settings and remembers it", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openRawReadme(user);
      expect(document.querySelector(".cm-lineNumbers")).toBeInTheDocument();

      await user.keyboard("{Control>},{/Control}");
      const page = await screen.findByRole("region", { name: "Settings" });
      await user.click(within(page).getByRole("button", { name: "Editor" }));
      await user.click(within(page).getByRole("switch", { name: "Line numbers" }));
      await user.keyboard("{Escape}");

      expect(document.querySelector(".cm-lineNumbers")).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("vista.settings") ?? "null")).toMatchObject({
        version: 1,
        editor: { lineNumbers: false },
      });
    });
  });

  describe("find", () => {
    it("finds and replaces text in the raw editor", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await openRawReadme(user);

      await user.keyboard("{Control>}f{/Control}");
      await user.keyboard("notes");
      const findBar = screen.getByLabelText("Find in file");
      expect(within(findBar).getByRole("status")).toHaveTextContent("1 of 1");

      await user.keyboard("{Control>}h{/Control}");
      await user.type(within(findBar).getByRole("textbox", { name: "Replace" }), "docs");
      await user.click(within(findBar).getByRole("button", { name: "Replace all" }));

      expect(rawEditorText(editor)).toBe("# Hello Vista\nThis is docs.");
      expect(within(findBar).getByRole("status")).toHaveTextContent("No results");
    });

    it("closes when the last tab closes, and stays closed for the next file", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openRawReadme(user);
      await user.keyboard("{Control>}f{/Control}");

      await user.click(screen.getByRole("button", { name: "Close readme.md" }));
      await user.click(screen.getByText("data.csv"));

      expect(screen.queryByLabelText("Find in file")).not.toBeInTheDocument();
    });

    it("closes with Escape and returns focus to the editor", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await openRawReadme(user);

      await user.keyboard("{Control>}f{/Control}");
      await user.keyboard("{Escape}");

      expect(screen.queryByLabelText("Find in file")).not.toBeInTheDocument();
      expect(editor).toHaveFocus();
    });

    it("finds text in the rendered Markdown view, without replace", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await screen.findByRole("heading", { name: "Hello Vista" });

      await user.keyboard("{Control>}h{/Control}");
      await user.keyboard("notes");

      const findBar = screen.getByLabelText("Find in file");
      expect(within(findBar).getByRole("status")).toHaveTextContent("1 of 1");
      expect(within(findBar).queryByRole("textbox", { name: "Replace" })).not.toBeInTheDocument();
    });

    it("finds text in CSV table cells", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("data.csv"));
      await user.click(screen.getByRole("button", { name: "Table" }));
      await screen.findByDisplayValue("Alice");

      await user.keyboard("{Control>}f{/Control}");
      await user.keyboard("bob");

      expect(screen.getByDisplayValue("Bob")).toHaveAttribute("data-find-match", "current");
      expect(screen.getByDisplayValue("Alice")).not.toHaveAttribute("data-find-match");
    });
  });

  describe("go to", () => {
    it("opens a file at a line and column with Ctrl+P", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.keyboard("{Control>}p{/Control}");
      await user.keyboard("readme:2:3");
      expect(screen.getByRole("option", { name: "readme.mdMy Notes" })).toHaveAttribute("aria-selected", "true");
      await user.keyboard("{Enter}");

      const editor = await screen.findByRole("textbox", { name: "Raw text content of readme.md" });
      expect(getTab("readme.md")).toHaveAttribute("aria-selected", "true");
      await waitFor(() => expect(editor).toHaveFocus());
      expect(screen.getByRole("contentinfo", { name: "Status Bar" })).toHaveTextContent("Ln 2, Col 3");
    });

    it("moves to a line in the current file with Ctrl+G", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openRawReadme(user);

      await user.keyboard("{Control>}g{/Control}");
      expect(screen.getByRole("combobox", { name: "Go to file, or :line:column" })).toHaveValue(":");
      await user.keyboard("2{Enter}");

      expect(screen.queryByRole("dialog", { name: "Go to file" })).not.toBeInTheDocument();
      expect(screen.getByRole("contentinfo", { name: "Status Bar" })).toHaveTextContent("Ln 2, Col 1");
    });

    it("goes past the last line to the end of the file", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openRawReadme(user);

      await user.keyboard("{Control>}g{/Control}");
      await user.keyboard("99:99{Enter}");

      expect(screen.getByRole("contentinfo", { name: "Status Bar" })).toHaveTextContent("Ln 2, Col 15");
    });
  });

  describe("commands picker", () => {
    it("lists commands with Ctrl+Shift+P and runs the chosen one", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
      expect(screen.getByRole("combobox", { name: "Run a command" })).toHaveValue(">");
      expect(screen.getByRole("option", { name: "Workspace: Open Folder…" })).toHaveAttribute("aria-selected", "true");
      await user.keyboard("about{Enter}");

      const settings = await screen.findByRole("region", { name: "Settings" });
      expect(within(settings).getByRole("button", { name: "About" })).toHaveAttribute("aria-current", "page");
      expect(screen.queryByRole("dialog", { name: "Commands" })).not.toBeInTheDocument();
    });

    it("lists the commands by category, in the order the spec gives", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
      const categories = screen.getAllByRole("option").map((option) => option.textContent?.split(":")[0]);

      expect([...new Set(categories)]).toEqual([
        "Workspace",
        "File",
        "Tabs",
        "Edit",
        "Selection",
        "View",
        "Go",
        "Settings",
      ]);
    });

    it("opens Workspace Settings from the palette", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
      await user.click(screen.getByRole("option", { name: "Workspace: Workspace Settings…" }));

      const page = await screen.findByRole("region", { name: "Settings" });
      expect(within(page).getByRole("button", { name: "My Notes" })).toHaveAttribute("aria-current", "page");
    });

    it("shows a command that cannot run now as disabled and does not run it", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openRawReadme(user);

      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
      await user.keyboard("file save");
      const save = screen.getByRole("option", { name: /^File: Save\s*Ctrl \+ S$/ });
      expect(save).toHaveAttribute("aria-selected", "true");
      expect(save).toHaveAttribute("aria-disabled", "true");
      await user.keyboard("{Enter}");

      expect(screen.getByRole("dialog", { name: "Commands" })).toBeInTheDocument();
      expect(mockWorkspace.writeFile).not.toHaveBeenCalled();
    });

    it("runs an editing command in the editor the picker was opened from", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await makeReadmeDirty(user);

      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
      await user.keyboard("undo{Enter}");

      await waitFor(() => expect(rawEditorText(editor)).not.toBe(EDITED_README_CONTENT));
    });

    it("runs an editing command in the editor when opened by clicking the go-to-file field", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await makeReadmeDirty(user);

      await user.click(within(screen.getByRole("banner")).getByRole("button", { name: "Go to file" }));
      await user.keyboard(">undo{Enter}");

      await waitFor(() => expect(rawEditorText(editor)).not.toBe(EDITED_README_CONTENT));
    });

    it("switches the open picker between files, commands, and lines by shortcut", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openRawReadme(user);

      await user.keyboard("{Control>}p{/Control}");
      await user.keyboard("read");
      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
      expect(screen.getByRole("combobox", { name: "Run a command" })).toHaveValue(">");

      await user.keyboard("{Control>}g{/Control}");
      expect(screen.getByRole("combobox", { name: "Go to file, or :line:column" })).toHaveValue(":");

      await user.keyboard("{Control>}p{/Control}");
      expect(screen.getByRole("combobox", { name: "Go to file, or :line:column" })).toHaveValue("");
    });

    it("says to open a folder when searching files with none open, and opens on files from the title bar's field once one is", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await screen.findByRole("button", { name: "Open Folder…" });
      // With no workspace the title bar has nothing to show, so it is not there.
      expect(screen.queryByRole("button", { name: "Go to file" })).not.toBeInTheDocument();

      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}{Backspace}");
      expect(screen.getByRole("combobox", { name: "Go to file, or :line:column" })).toHaveValue("");
      expect(screen.getByText("Open a folder to find its files. Type > for commands.")).toBeInTheDocument();
      // jsdom does not turn Escape into the dialog's cancel event.
      fireEvent(screen.getByRole("dialog", { name: "Go to file" }), new Event("cancel", { cancelable: true }));

      await openFolderFromWelcome(user);
      await user.click(within(screen.getByRole("banner")).getByRole("button", { name: "Go to file" }));
      expect(screen.getByRole("combobox", { name: "Go to file, or :line:column" })).toHaveValue("");
    });
  });

  describe("start screen", () => {
    it("shows key hints, not buttons, once a folder is open", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      const main = screen.getByRole("main");

      expect(within(main).queryByRole("heading")).not.toBeInTheDocument();
      expect(within(main).getByText("Go to file")).toBeInTheDocument();
      expect(within(main).getByText("Ctrl + P")).toBeInTheDocument();
    });

    it("gives way to the document when a file is opened", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.click(screen.getByText("readme.md"));

      await screen.findByRole("heading", { name: "Hello Vista" });
      expect(within(screen.getByRole("main")).queryByText("Ctrl + P")).not.toBeInTheDocument();
    });
  });

  describe("explorer", () => {
    it("expands the folders of a file opened from the picker", async () => {
      const user = userEvent.setup();
      const guide: WorkspaceNode = {
        id: "docs/guide.md",
        name: "guide.md",
        path: "docs/guide.md",
        kind: "file",
        extension: "md",
      };
      const mockWorkspace = createMockWorkspaceCapability({
        readTree: vi
          .fn()
          .mockResolvedValue([
            ...ROOT_TREE,
            { id: "docs", name: "docs", path: "docs", kind: "directory", children: [guide] },
          ]),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);
      const explorer = screen.getByRole("navigation", { name: "File Explorer" });
      expect(within(explorer).getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "false");

      await user.keyboard("{Control>}p{/Control}");
      await user.keyboard("guide{Enter}");

      await waitFor(() =>
        expect(within(explorer).getByRole("button", { name: "docs" })).toHaveAttribute("aria-expanded", "true"),
      );
      expect(within(explorer).getByRole("button", { name: "guide.md" })).toBeInTheDocument();
    });

    it("marks a file with unsaved changes", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const explorer = () => screen.getByRole("navigation", { name: "File Explorer" });

      await makeReadmeDirty(user);
      expect(within(explorer()).getByRole("button", { name: /^readme\.md\s*\(unsaved\)$/ })).toBeInTheDocument();

      await user.keyboard("{Control>}s{/Control}");
      await waitFor(() => expect(within(explorer()).getByRole("button", { name: "readme.md" })).toBeInTheDocument());
    });
  });

  describe("unsaved changes", () => {
    it("keeps a dirty tab open when closing it is cancelled", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await makeReadmeDirty(user);

      await user.click(screen.getByRole("button", { name: "Close readme.md" }));
      const dialog = await screen.findByRole("dialog", { name: "Save changes to readme.md?" });
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(rawEditorText(screen.getByRole("textbox", { name: /Raw text content of readme\.md/i }))).toBe(
        EDITED_README_CONTENT,
      );
    });

    it("closes a dirty tab without saving when Don't Save is chosen", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);

      await user.click(screen.getByRole("button", { name: "Close readme.md" }));
      const dialog = await screen.findByRole("dialog", { name: "Save changes to readme.md?" });
      await user.click(within(dialog).getByRole("button", { name: "Don't Save" }));

      await waitFor(() => expect(screen.queryByRole("tab")).not.toBeInTheDocument());
      expect(mockWorkspace.writeFile).not.toHaveBeenCalled();
    });

    it("saves and then closes a dirty tab when Save is chosen", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);

      await user.click(screen.getByRole("button", { name: "Close readme.md" }));
      const dialog = await screen.findByRole("dialog", { name: "Save changes to readme.md?" });
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      await waitFor(() => expect(screen.queryByRole("tab")).not.toBeInTheDocument());
      expect(writtenTexts(mockWorkspace, "readme.md")).toEqual([EDITED_README_CONTENT]);
    });

    it("keeps a dirty tab open when saving fails during close", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability({
        writeFile: vi.fn().mockRejectedValue(new Error("Write access was denied.")),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);

      await user.click(screen.getByRole("button", { name: "Close readme.md" }));
      const dialog = await screen.findByRole("dialog", { name: "Save changes to readme.md?" });
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      expect(await findToast("Write access was denied.")).toBeInTheDocument();
      expect(rawEditorText(screen.getByRole("textbox", { name: /Raw text content of readme\.md/i }))).toBe(
        EDITED_README_CONTENT,
      );
    });

    it("saves the active tab with Ctrl+S", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);

      await user.keyboard("{Control>}s{/Control}");

      expect(writtenTexts(mockWorkspace, "readme.md")).toEqual([EDITED_README_CONTENT]);
      await waitFor(() => expect(getTab("readme.md")).not.toHaveTextContent("(unsaved)"));
    });

    it("keeps a tab marked unsaved when it was edited while its save was in flight", async () => {
      const user = userEvent.setup();
      let finishWrite: () => void = () => {};
      const mockWorkspace = createMockWorkspaceCapability({
        writeFile: () =>
          new Promise<FileStat>((resolve) => {
            finishWrite = () => resolve({ size: 1, modifiedAt: 99_000 });
          }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      const editor = await makeReadmeDirty(user);

      await user.keyboard("{Control>}s{/Control}");
      await appendToRawEditor(user, editor, "!");
      await act(async () => finishWrite());

      expect(mockWorkspace.writeFile).toHaveBeenCalledTimes(1);
      expect(getTab("readme.md")).toHaveTextContent("(unsaved)");
    });

    it("asks again when the tab was edited while its save-then-close was in flight", async () => {
      const user = userEvent.setup();
      let finishWrite: () => void = () => {};
      const mockWorkspace = createMockWorkspaceCapability({
        writeFile: () =>
          new Promise<FileStat>((resolve) => {
            finishWrite = () => resolve({ size: 1, modifiedAt: 99_000 });
          }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      const editor = await makeReadmeDirty(user);

      await user.click(screen.getByRole("button", { name: "Close readme.md" }));
      await user.click(
        within(await screen.findByRole("dialog", { name: "Save changes to readme.md?" })).getByRole("button", {
          name: "Save",
        }),
      );
      await appendToRawEditor(user, editor, "!");
      await act(async () => finishWrite());

      const dialog = await screen.findByRole("dialog", { name: "Save changes to readme.md?" });
      expect(getTab("readme.md")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(rawEditorText(screen.getByRole("textbox", { name: /Raw text content of readme\.md/i }))).toBe(
        `${EDITED_README_CONTENT}!`,
      );
    });

    it("ignores Save and Close Tab shortcuts while a save prompt is open", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);

      await user.click(screen.getByRole("button", { name: "Close readme.md" }));
      const dialog = await screen.findByRole("dialog", { name: "Save changes to readme.md?" });
      await user.keyboard("{Control>}s{/Control}{Alt>}w{/Alt}");
      await user.click(within(dialog).getByRole("button", { name: "Don't Save" }));

      await waitFor(() => expect(screen.queryByRole("tab")).not.toBeInTheDocument());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mockWorkspace.writeFile).not.toHaveBeenCalled();
    });

    it("warns that unsaved edits will be lost when deleting an open file", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await makeReadmeDirty(user);

      const explorer = screen.getByRole("navigation", { name: "File Explorer" });
      fireEvent.contextMenu(within(explorer).getByText("readme.md"));
      await user.click(screen.getByRole("menuitem", { name: "Delete" }));

      const dialog = await screen.findByRole("dialog", { name: 'Delete "readme.md"?' });
      expect(dialog).toHaveTextContent('Unsaved changes in "readme.md" will be lost.');
    });

    it("does not discard edits when the open file is selected again", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);

      await user.click(within(screen.getByRole("navigation", { name: "File Explorer" })).getByText("readme.md"));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(rawEditorText(screen.getByRole("textbox", { name: /Raw text content of readme\.md/i }))).toBe(
        EDITED_README_CONTENT,
      );
    });

    it("warns before unload only while a tab has unsaved edits", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await user.click(await screen.findByRole("button", { name: "Raw" }));
      await screen.findByRole("textbox", { name: /Raw text content of readme\.md/i });

      const cleanEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(cleanEvent);
      expect(cleanEvent.defaultPrevented).toBe(false);

      await appendToRawEditor(user, screen.getByRole("textbox", { name: /Raw text content of readme\.md/i }), "!");

      const dirtyEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(dirtyEvent);
      expect(dirtyEvent.defaultPrevented).toBe(true);
    });
  });

  describe("startup folder restore", () => {
    const REMEMBERED_WORKSPACE = { id: "workspace-1", name: "My Notes", rootPath: "/notes" };

    it("reopens the last folder on startup without showing the picker", async () => {
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi.fn().mockResolvedValue({ status: "restored", folder: REMEMBERED_WORKSPACE }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(await screen.findByText("readme.md")).toBeInTheDocument();
      expect(mockWorkspace.restoreFolder).toHaveBeenCalledWith(LEGACY_FOLDER_ID, { interactive: false });
      expect(mockWorkspace.pickFolder).not.toHaveBeenCalled();
    });

    it("reopens a remembered folder that needs permission when the user clicks its recent entry", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi
          .fn()
          .mockResolvedValueOnce({ status: "needs-permission", name: "My Notes" })
          .mockResolvedValueOnce({ status: "restored", folder: REMEMBERED_WORKSPACE }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      await user.click(await screen.findByRole("button", { name: "My Notes" }));

      expect(mockWorkspace.restoreFolder).toHaveBeenLastCalledWith(LEGACY_FOLDER_ID, { interactive: true });
      expect(await screen.findByText("readme.md")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Recent workspaces" })).not.toBeInTheDocument();
    });

    it("keeps the recent entry and shows no message when permission is dismissed again", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi.fn().mockResolvedValue({ status: "needs-permission", name: "My Notes" }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      await user.click(await screen.findByRole("button", { name: "My Notes" }));

      await waitFor(() =>
        expect(mockWorkspace.restoreFolder).toHaveBeenCalledWith(LEGACY_FOLDER_ID, { interactive: true }),
      );
      expect(screen.getByRole("button", { name: "My Notes" })).toHaveAccessibleDescription(/^Click to allow access/);
      expect(document.querySelector(".coden-toast")).not.toBeInTheDocument();
    });

    it("shows an info message and no reopen button when the last folder can no longer be opened", async () => {
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi.fn().mockResolvedValue({ status: "unavailable", name: "My Notes" }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(
        await screen.findByText('Couldn\'t reopen "My Notes". It may have been moved or deleted.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Recent workspaces" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open Folder…" })).toBeInTheDocument();
    });

    it("reopens the last workspace's folder by its id", async () => {
      localStorage.setItem(
        "vista.workspaces",
        JSON.stringify({
          version: 1,
          lastWorkspaceId: "w1",
          workspaces: [{ id: "w1", name: "Notes", folderIds: ["folder-7"], lastOpenedAt: 1 }],
        }),
      );
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi.fn().mockResolvedValue({ status: "restored", folder: REMEMBERED_WORKSPACE }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(await screen.findByText("readme.md")).toBeInTheDocument();
      expect(mockWorkspace.restoreFolder).toHaveBeenCalledTimes(1);
      expect(mockWorkspace.restoreFolder).toHaveBeenCalledWith("folder-7", { interactive: false });
    });

    it("remembers a picked folder as the workspace to reopen next time", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);

      await openFolderFromWelcome(user);

      const stored = JSON.parse(localStorage.getItem("vista.workspaces") ?? "null");
      expect(stored.workspaces).toMatchObject([{ name: "My Notes", folderIds: ["workspace-1"] }]);
      expect(stored.lastWorkspaceId).toBe(stored.workspaces[0].id);
    });

    it("offers Open Folder on the start screen when no folder is remembered", async () => {
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(await screen.findByRole("button", { name: "Open Folder…" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Recent workspaces" })).not.toBeInTheDocument();
    });

    it("shows an error message when restoring the last folder fails unexpectedly", async () => {
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi.fn().mockRejectedValue(new Error("Storage is unavailable.")),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(await findToast("Storage is unavailable.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open Folder…" })).toBeInTheDocument();
    });

    it("restores the last folder once under StrictMode", async () => {
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi.fn().mockResolvedValue({ status: "unavailable", name: "My Notes" }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />, { wrapper: StrictMode });

      expect(
        await screen.findByText('Couldn\'t reopen "My Notes". It may have been moved or deleted.'),
      ).toBeInTheDocument();
      expect(mockWorkspace.restoreFolder).toHaveBeenCalledTimes(1);
    });

    it("skips restore entirely when the host cannot access folders", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability({ isSupported: false });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      await user.click(await screen.findByRole("button", { name: "Open Folder…" }));

      expect(mockWorkspace.restoreFolder).not.toHaveBeenCalled();
      expect(
        await findToast("Local folder access is not supported in this browser or environment."),
      ).toBeInTheDocument();
    });
  });

  describe("commands", () => {
    it("has no menu bar", async () => {
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await screen.findByRole("button", { name: "Open Folder…" });

      expect(screen.queryByRole("menubar")).not.toBeInTheDocument();
    });

    it("saves every dirty file with Save All", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);
      await user.click(screen.getByText("data.csv"));
      await user.click(screen.getByRole("button", { name: "Raw" }));
      await appendToRawEditor(user, await screen.findByRole("textbox", { name: "Raw text content of data.csv" }), "!");

      await runFromPalette(user, "File: Save All");

      await waitFor(() => expect(mockWorkspace.writeFile).toHaveBeenCalledTimes(2));
      expect(writtenTexts(mockWorkspace, "readme.md")).toEqual([EDITED_README_CONTENT]);
      expect(writtenTexts(mockWorkspace, "data.csv")).toEqual([`${CSV_CONTENT}!`]);
    });

    it("starts naming a new file at the root with New File", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);

      await runFromPalette(user, "File: New File");
      await user.type(await screen.findByRole("textbox", { name: "Entry name" }), "todo.md{Enter}");

      expect(mockWorkspace.createFile).toHaveBeenCalledWith(expect.objectContaining({ id: "workspace-1" }), "todo.md");
    });

    it("closes Settings to show the explorer when New File runs from it", async () => {
      const viewport = stubViewport(true);
      try {
        const user = userEvent.setup();
        render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
        await openFolderFromWelcome(user);
        const rail = screen.getByRole("navigation", { name: "Activity bar" });
        await user.click(within(rail).getByRole("button", { name: "Settings" }));

        await runFromPalette(user, "File: New File");

        expect(screen.queryByRole("region", { name: "Settings" })).not.toBeInTheDocument();
        expect(explorerPanel()).not.toHaveAttribute("inert");
        expect(await screen.findByRole("textbox", { name: "Entry name" })).toBeVisible();
      } finally {
        viewport.restore();
      }
    });

    it("toggles word wrap from the palette and with Alt+Z", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openRawReadme(user);

      const storedWordWrap = () => JSON.parse(localStorage.getItem("vista.settings") ?? "null")?.editor?.wordWrap;
      await runFromPalette(user, "View: Word Wrap");
      expect(storedWordWrap()).toBe(false);
      await user.keyboard("{Alt>}z{/Alt}");

      expect(storedWordWrap()).toBe(true);
    });

    it("undoes in the raw editor with Undo, returning focus to it", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await makeReadmeDirty(user);

      await runFromPalette(user, "Edit: Undo");

      expect(rawEditorText(editor)).toBe(README_CONTENT);
      expect(editor).toHaveFocus();
    });

    it("lists every command with a key in the Keyboard Shortcuts section", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);

      await screen.findByRole("button", { name: "Open Folder…" });
      await runFromPalette(user, "Settings: Keyboard Shortcuts");

      const dialog = await screen.findByRole("region", { name: "Settings" });
      expect(within(dialog).getByRole("row", { name: "Save Ctrl + S" })).toBeInTheDocument();
      expect(within(dialog).getByRole("row", { name: "Word Wrap Alt + Z" })).toBeInTheDocument();
      expect(within(dialog).getByRole("row", { name: "Undo Ctrl + Z" })).toBeInTheDocument();
      const tabsSection = within(dialog).getByRole("table", { name: "Tabs" });
      expect(within(tabsSection).getByRole("row", { name: "Close Tab Alt + W" })).toBeInTheDocument();
    });

    it("closes the other tabs from a tab's menu", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await user.click(screen.getByText("data.csv"));

      fireEvent.contextMenu(getTab("readme.md"));
      await user.click(screen.getByRole("menuitem", { name: "Close Others" }));

      await waitFor(() => expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["readme.md"]));
    });

    it("moves focus to the remaining tab when a tab closes itself from its menu", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await user.click(screen.getByText("data.csv"));
      getTab("data.csv").focus();

      // The context menu key: a key press, then the contextmenu event.
      fireEvent.keyDown(getTab("data.csv"), { key: "ContextMenu" });
      fireEvent.contextMenu(getTab("data.csv"));
      await user.keyboard("{Enter}");

      await waitFor(() => expect(getTab("readme.md")).toHaveFocus());
    });

    it("does not move focus to the tabs later after a tab's close was cancelled", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await makeReadmeDirty(user);
      await user.click(screen.getByText("data.csv"));
      await user.click(getTab("readme.md"));
      getTab("readme.md").focus();
      // The context menu key: a key press, then the contextmenu event.
      fireEvent.keyDown(getTab("readme.md"), { key: "ContextMenu" });
      fireEvent.contextMenu(getTab("readme.md"));
      await user.keyboard("{Enter}");
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));

      // Closing the same tab another way, from the editor, leaves the tabs alone.
      await user.click(editor);
      await runFromPalette(user, "Tabs: Close Tab");
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Don't Save" }));

      await waitFor(() => expect(screen.queryByRole("tab", { name: /readme\.md/ })).not.toBeInTheDocument());
      expect(getTab("data.csv")).not.toHaveFocus();
    });

    it("shows the active file's folder and path in the path bar, and copies its relative path", async () => {
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      expect(screen.queryByRole("contentinfo", { name: "Status Bar" })).not.toBeInTheDocument();

      await user.click(screen.getByText("data.csv"));

      expect(shownPath("My Notes / data.csv")).toBeInTheDocument();
      expect(within(statusBar()).getByRole("tooltip", { name: "My Notes / data.csv" })).toBeInTheDocument();
      expect(within(statusBar()).queryByRole("button", { name: "Copy Path" })).not.toBeInTheDocument();
      expect(within(statusBar()).queryByRole("button", { name: /^Reveal/ })).not.toBeInTheDocument();
      await user.click(within(statusBar()).getByRole("button", { name: "Copy Relative Path" }));
      expect(writeText).toHaveBeenCalledWith("data.csv");
      expect(within(statusBar()).getByRole("status")).toHaveTextContent("Copied");
    });

    it("does not report a copy that failed", async () => {
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("data.csv"));

      await user.click(within(statusBar()).getByRole("button", { name: "Copy Relative Path" }));
      expect(await screen.findByText("Couldn't copy to the clipboard.")).toBeInTheDocument();
      expect(within(statusBar()).getByRole("status")).toHaveTextContent("");
    });

    it("shows the active file's full path on desktop, copies it, and reveals the file", async () => {
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
      const reveal = vi.fn(async () => {});
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability({ reveal }) }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("data.csv"));

      expect(shownPath("/notes/data.csv")).toBeInTheDocument();
      await user.click(within(statusBar()).getByRole("button", { name: "Copy Path" }));
      expect(writeText).toHaveBeenCalledWith("/notes/data.csv");
      await user.click(within(statusBar()).getByRole("button", { name: "Reveal in File Explorer" }));
      expect(reveal).toHaveBeenCalledWith(expect.objectContaining({ rootPath: "/notes" }), "data.csv");
    });

    it("says so when the file manager can't show the file", async () => {
      const user = userEvent.setup();
      const reveal = vi.fn(async () => {
        throw new Error("No file manager.");
      });
      vi.spyOn(console, "error").mockImplementation(() => {});
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability({ reveal }) }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("data.csv"));

      await user.click(within(statusBar()).getByRole("button", { name: "Reveal in File Explorer" }));

      expect(await findToast(`Couldn't show "data.csv" in the file manager.`)).toBeInTheDocument();
    });

    it("copies a tree entry's relative path, and offers its full path only on desktop", async () => {
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      fireEvent.contextMenu(screen.getByText("readme.md"));
      expect(screen.queryByRole("menuitem", { name: "Copy Path" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("menuitem", { name: "Copy Relative Path" }));

      expect(writeText).toHaveBeenCalledWith("readme.md");
    });

    it("copies a tree entry's full path on desktop", async () => {
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      fireEvent.contextMenu(screen.getByText("readme.md"));
      await user.click(screen.getByRole("menuitem", { name: "Copy Path" }));

      expect(writeText).toHaveBeenCalledWith("/notes/readme.md");
    });

    it("ends the tab menu with Copy Path, Copy Relative Path, and Reveal on desktop", async () => {
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
      const reveal = vi.fn(async () => {});
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability({ reveal }) }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("data.csv"));

      fireEvent.contextMenu(getTab("data.csv"));
      const menu = screen.getByRole("menu", { name: "Tab actions" });
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => item.textContent),
      ).toEqual([
        "Close",
        "Close Others",
        "Close to the Right",
        "Close Saved",
        "Close All",
        "Copy Path",
        "Copy Relative Path",
        "Reveal in File Explorer",
      ]);
      await user.click(within(menu).getByRole("menuitem", { name: "Copy Path" }));
      expect(writeText).toHaveBeenCalledWith("/notes/data.csv");

      fireEvent.contextMenu(getTab("data.csv"));
      await user.click(screen.getByRole("menuitem", { name: "Reveal in File Explorer" }));
      expect(reveal).toHaveBeenCalledWith(expect.objectContaining({ rootPath: "/notes" }), "data.csv");
    });

    it("offers only Copy Relative Path in the tab menu on the web", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("data.csv"));

      fireEvent.contextMenu(getTab("data.csv"));

      const menu = screen.getByRole("menu", { name: "Tab actions" });
      expect(within(menu).getAllByRole("menuitem").at(-1)).toHaveTextContent("Copy Relative Path");
      expect(within(menu).queryByRole("menuitem", { name: "Copy Path" })).not.toBeInTheDocument();
      expect(within(menu).queryByRole("menuitem", { name: /^Reveal/ })).not.toBeInTheDocument();
    });

    it("reveals a file, a folder, and a root row from the explorer on desktop", async () => {
      const user = userEvent.setup();
      const reveal = vi.fn<NonNullable<WorkspaceCapability["reveal"]>>(async () => {});
      const readTree = vi
        .fn()
        .mockResolvedValue([{ id: "docs", name: "docs", path: "docs", kind: "directory", children: [] }, ...ROOT_TREE]);
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability({ reveal, readTree }) }} />);
      await openFolderFromWelcome(user);
      const explorer = explorerPanel();

      fireEvent.contextMenu(within(explorer).getByText("readme.md"));
      await user.click(screen.getByRole("menuitem", { name: "Reveal in File Explorer" }));
      fireEvent.contextMenu(within(explorer).getByRole("button", { name: "docs" }));
      await user.click(screen.getByRole("menuitem", { name: "Reveal in File Explorer" }));
      fireEvent.contextMenu(within(explorer).getByRole("button", { name: "My Notes" }));
      expect(
        within(screen.getByRole("menu"))
          .getAllByRole("menuitem")
          .map((item) => item.textContent),
      ).toEqual(["New File", "New Folder", "Copy Path", "Reveal in File Explorer"]);
      await user.click(screen.getByRole("menuitem", { name: "Reveal in File Explorer" }));

      expect(reveal.mock.calls.map(([, path]) => path)).toEqual(["readme.md", "docs", ""]);
    });

    it("offers no Reveal in the explorer on the web", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      fireEvent.contextMenu(within(explorerPanel()).getByText("readme.md"));

      expect(screen.queryByRole("menuitem", { name: /^Reveal/ })).not.toBeInTheDocument();
    });

    it("copies and reveals the active file from the palette on desktop", async () => {
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
      const reveal = vi.fn(async () => {});
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability({ reveal }) }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("data.csv"));

      await runFromPalette(user, "File: Copy Path");
      expect(writeText).toHaveBeenLastCalledWith("/notes/data.csv");
      await runFromPalette(user, "File: Copy Relative Path");
      expect(writeText).toHaveBeenLastCalledWith("data.csv");
      await runFromPalette(user, "File: Reveal in File Explorer");
      expect(reveal).toHaveBeenCalledWith(expect.objectContaining({ rootPath: "/notes" }), "data.csv");
    });

    it("lists only Copy Relative Path of the three in the palette on the web", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("data.csv"));

      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");

      expect(screen.getByRole("option", { name: /^File: Copy Relative Path/ })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /^File: Copy Path/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /^File: Reveal/ })).not.toBeInTheDocument();
    });

    it("opens the app's editor menu on right click, and leaves Shift+right click to the browser", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await openRawReadme(user);

      expect(fireEvent.contextMenu(editor, { shiftKey: true })).toBe(true);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();

      fireEvent.contextMenu(editor);
      const menu = screen.getByRole("menu", { name: "Editor actions" });
      expect(within(menu).getByRole("menuitem", { name: "Replace" })).toBeInTheDocument();
      expect(within(menu).getByRole("menuitem", { name: "Go to Line" })).toBeInTheDocument();
    });

    it("says how to paste when the clipboard cannot be read", async () => {
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, "readText").mockRejectedValue(new Error("denied"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await openRawReadme(user);

      fireEvent.contextMenu(editor);
      await user.click(screen.getByRole("menuitem", { name: "Paste" }));

      expect(await screen.findByText("Press Ctrl + V to paste.")).toBeInTheDocument();
      expect(rawEditorText(editor)).toBe(README_CONTENT);
    });

    it("pastes the clipboard's text into the raw editor", async () => {
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, "readText").mockResolvedValue("Pasted. ");
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await openRawReadme(user);

      fireEvent.contextMenu(editor);
      await user.click(screen.getByRole("menuitem", { name: "Paste" }));

      await waitFor(() => expect(rawEditorText(editor)).toBe(`Pasted. ${README_CONTENT}`));
    });
  });

  it("lists the path of every file with unsaved changes when closing several", async () => {
    const user = userEvent.setup();
    render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
    await makeReadmeDirty(user);
    await user.click(screen.getByText("data.csv"));
    await user.click(screen.getByRole("button", { name: "Raw" }));
    await appendToRawEditor(user, await screen.findByRole("textbox", { name: "Raw text content of data.csv" }), "!");

    await runFromPalette(user, "Tabs: Close All Tabs");

    const dialog = await screen.findByRole("dialog", { name: "Save changes to 2 files?" });
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["readme.md", "data.csv"]);
  });

  it("drops a file read that finishes after another folder was opened", async () => {
    const user = userEvent.setup();
    let finishRead: (content: string) => void = () => {};
    const mockWorkspace = createMockWorkspaceCapability({
      pickFolder: vi
        .fn()
        .mockResolvedValueOnce({ id: "workspace-1", name: "My Notes", rootPath: "/notes" })
        .mockResolvedValueOnce({ id: "workspace-1", name: "My Notes", rootPath: "/notes" }),
      readFile: () =>
        new Promise((resolve) => {
          finishRead = (content) =>
            resolve({ bytes: new TextEncoder().encode(content), stat: { size: content.length, modifiedAt: 1 } });
        }),
    });
    render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
    await openFolderFromWelcome(user);

    await user.click(screen.getByText("readme.md"));
    await runFromPalette(user, "Workspace: Open Folder…");
    await waitFor(() => expect(mockWorkspace.readTree).toHaveBeenCalledTimes(2));
    await act(async () => finishRead(README_CONTENT));

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
  describe("files on disk", () => {
    const MB = 1024 * 1024;

    function fileNode(path: string): WorkspaceNode {
      return { id: path, name: path, path, kind: "file", extension: path.split(".").pop() ?? "" };
    }

    it("asks before overwriting a file another program changed, and overwrites when confirmed", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);
      mockWorkspace.changeExternally("readme.md", "Their version");

      await user.keyboard("{Control>}s{/Control}");
      const dialog = await screen.findByRole("dialog", { name: '"readme.md" changed on disk' });
      await user.click(within(dialog).getByRole("button", { name: "Overwrite" }));

      await waitFor(() => expect(mockWorkspace.textOf("readme.md")).toBe(EDITED_README_CONTENT));
      expect(getTab("readme.md")).not.toHaveTextContent("(unsaved)");
    });

    it("keeps the other program's version and the unsaved edits when overwriting is cancelled", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);
      mockWorkspace.changeExternally("readme.md", "Their version");

      await user.keyboard("{Control>}s{/Control}");
      const dialog = await screen.findByRole("dialog", { name: '"readme.md" changed on disk' });
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(mockWorkspace.textOf("readme.md")).toBe("Their version");
      expect(getTab("readme.md")).toHaveTextContent("(unsaved)");
    });

    it("reloads a clean tab whose file changed on disk when the window regains focus", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await waitFor(() => expect(screen.getByRole("heading", { name: "Hello Vista" })).toBeVisible());
      mockWorkspace.changeExternally("readme.md", "# Changed elsewhere");

      fireEvent.focus(window);

      expect(await screen.findByRole("heading", { name: "Changed elsewhere" })).toBeVisible();
      expect(getTab("readme.md")).not.toHaveTextContent("(unsaved)");
    });

    it("keeps unsaved edits and marks the tab when its file changed on disk", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      const editor = await makeReadmeDirty(user);
      mockWorkspace.changeExternally("readme.md", "Their version");

      fireEvent.focus(window);

      expect(
        await findToast('"readme.md" changed on disk. Saving it will ask before overwriting the other version.'),
      ).toBeInTheDocument();
      expect(within(statusBar()).getByText("Changed on disk")).toHaveAttribute(
        "title",
        "Another program changed this file. Saving asks before overwriting it.",
      );
      expect(rawEditorText(editor)).toBe(EDITED_README_CONTENT);
    });

    it("marks a tab whose file was deleted on disk", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);
      await user.click(screen.getByText("readme.md"));
      await screen.findByRole("heading", { name: "Hello Vista" });
      mockWorkspace.deleteExternally("readme.md");

      fireEvent.focus(window);

      expect(await within(statusBar()).findByText("Deleted on disk")).toBeInTheDocument();
      expect(getTab("readme.md")).toBeInTheDocument();
    });

    it("refuses a file over the size limit without reading it", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability({
        stat: async () => ({ size: 20 * MB, modifiedAt: 1 }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);

      await user.click(screen.getByText("readme.md"));

      expect(
        await findToast('"readme.md" is 20.0 MB, over the 10 MB limit. You can raise the limit in Settings.'),
      ).toBeInTheDocument();
      expect(mockWorkspace.readFile).not.toHaveBeenCalled();
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    });

    it("opens a larger file once the limit is raised in Settings", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability({
        stat: async () => ({ size: 20 * MB, modifiedAt: 1 }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);

      await user.keyboard("{Control>},{/Control}");
      const dialog = await screen.findByRole("region", { name: "Settings" });
      await user.click(within(dialog).getByRole("button", { name: "Files" }));
      const limit = within(dialog).getByRole("spinbutton", { name: "Largest file to open (MB)" });
      await user.clear(limit);
      await user.type(limit, "0");
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a whole number from 1 to 512.");
      await user.clear(limit);
      await user.type(limit, "30");
      await user.click(within(dialog).getByRole("button", { name: "Close Settings" }));
      await user.click(screen.getByText("readme.md"));

      expect(await screen.findByRole("tab", { name: /readme\.md/ })).toBeInTheDocument();
    });

    it("lists a folder it couldn't read, and says so", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMemoryWorkspace(
        {},
        {
          tree: [
            { id: "private", name: "private", path: "private", kind: "directory", children: [], isUnreadable: true },
          ],
        },
      );
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      await user.click(await screen.findByRole("button", { name: "Open Folder…" }));

      expect(await screen.findByRole("button", { name: "private" })).toHaveAccessibleDescription(
        "Vista can't read this folder, so its files aren't listed",
      );
    });

    it("refuses a binary file", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMemoryWorkspace({ "photo.bin": new Uint8Array([0x89, 0x00, 0x01]) });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await user.click(await screen.findByRole("button", { name: "Open Folder…" }));

      await user.click(await screen.findByText("photo.bin"));

      expect(await findToast("Vista can't open \"photo.bin\" because it isn't a text file.")).toBeInTheDocument();
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    });

    it("opens a file that isn't UTF-8 read-only, so its characters are never rewritten", async () => {
      const user = userEvent.setup();
      // "café" in Windows-1252, which is not valid UTF-8.
      const mockWorkspace = createMemoryWorkspace(
        { "legacy.txt": new Uint8Array([0x63, 0x61, 0x66, 0xe9]) },
        { tree: [fileNode("legacy.txt")] },
      );
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await user.click(await screen.findByRole("button", { name: "Open Folder…" }));

      await user.click(await screen.findByText("legacy.txt"));
      const editor = await screen.findByRole("textbox", { name: /Raw text content of legacy\.txt/i });
      await appendToRawEditor(user, editor, "!");

      expect(
        await findToast('"legacy.txt" isn\'t UTF-8 text, so it opened read-only to keep its characters intact.'),
      ).toBeInTheDocument();
      expect(within(statusBar()).getByText("Read-only")).toBeInTheDocument();
      expect(rawEditorText(editor)).toBe("caf�");
      expect(getTab("legacy.txt")).not.toHaveTextContent("(unsaved)");
    });

    it("finds in a read-only file without offering replace", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMemoryWorkspace(
        { "legacy.txt": new Uint8Array([0x63, 0x61, 0x66, 0xe9]) },
        { tree: [fileNode("legacy.txt")] },
      );
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await user.click(await screen.findByRole("button", { name: "Open Folder…" }));
      await user.click(await screen.findByText("legacy.txt"));
      await screen.findByRole("textbox", { name: /Raw text content of legacy\.txt/i });

      await user.keyboard("{Control>}h{/Control}");
      await user.keyboard("caf");

      const findBar = screen.getByLabelText("Find in file");
      expect(within(findBar).getByRole("status")).toHaveTextContent("1 of 1");
      expect(within(findBar).queryByRole("textbox", { name: "Replace" })).not.toBeInTheDocument();
    });

    it("keeps a UTF-8 byte order mark when saving", async () => {
      const user = userEvent.setup();
      const bom = [0xef, 0xbb, 0xbf];
      const mockWorkspace = createMemoryWorkspace(
        { "notes.txt": new Uint8Array([...bom, ...new TextEncoder().encode("Hi")]) },
        { tree: [fileNode("notes.txt")] },
      );
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await user.click(await screen.findByRole("button", { name: "Open Folder…" }));
      await user.click(await screen.findByText("notes.txt"));
      const editor = await screen.findByRole("textbox", { name: /Raw text content of notes\.txt/i });

      await appendToRawEditor(user, editor, "!");
      await user.keyboard("{Control>}s{/Control}");

      await waitFor(() => expect(mockWorkspace.writeFile).toHaveBeenCalledTimes(1));
      const [, , bytes] = mockWorkspace.writeFile.mock.calls[0] ?? [];
      expect([...(bytes ?? [])]).toEqual([...bom, ...new TextEncoder().encode("Hi!")]);
    });
  });

  describe("closing the desktop window", () => {
    function createWindow() {
      let check: () => Promise<boolean> = async () => true;
      const window = {
        onCloseRequested: vi.fn((next: () => Promise<boolean>) => {
          check = next;
          return () => {};
        }),
      };
      return { window, requestClose: () => check() };
    }

    it("closes at once when nothing is unsaved", async () => {
      const { window, requestClose } = createWindow();
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), window }} />);
      await screen.findByRole("button", { name: "Open Folder…" });

      await expect(requestClose()).resolves.toBe(true);
    });

    it("asks about unsaved edits, and stays open when the user cancels", async () => {
      const user = userEvent.setup();
      const { window, requestClose } = createWindow();
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), window }} />);
      await makeReadmeDirty(user);

      let closing: Promise<boolean> = Promise.resolve(true);
      act(() => {
        closing = requestClose();
      });
      const dialog = await screen.findByRole("dialog", { name: "Save changes to readme.md?" });
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await expect(closing).resolves.toBe(false);
      expect(getTab("readme.md")).toHaveTextContent("(unsaved)");
    });

    it("closes after the user saves", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      const { window, requestClose } = createWindow();
      render(<App adapter={{ platform: "native", workspace: mockWorkspace, window }} />);
      await makeReadmeDirty(user);

      let closing: Promise<boolean> = Promise.resolve(false);
      act(() => {
        closing = requestClose();
      });
      const dialog = await screen.findByRole("dialog", { name: "Save changes to readme.md?" });
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      await expect(closing).resolves.toBe(true);
      expect(mockWorkspace.textOf("readme.md")).toBe(EDITED_README_CONTENT);
    });
  });

  describe("updating the desktop app", () => {
    beforeEach(() => {
      localStorage.setItem("vista.settings", JSON.stringify({ version: 1, updates: { checkAtStartup: true } }));
    });

    function createUpdater(options: { check?: () => Promise<unknown>; install?: () => Promise<void> } = {}) {
      const install = vi.fn(options.install ?? (async () => {}));
      const updater = {
        check: vi.fn(options.check ?? (async () => ({ version: "0.3.0", install }))),
      } as unknown as NonNullable<AppAdapter["updater"]>;
      return { updater, install };
    }

    it("offers a new version and installs it when accepted", async () => {
      const user = userEvent.setup();
      const { updater, install } = createUpdater();
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), updater }} />);

      const dialog = await screen.findByRole("dialog", { name: "Vista 0.3.0 is available" });
      await user.click(within(dialog).getByRole("button", { name: "Install and Restart" }));

      await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
      expect(await findToast("Downloading Vista 0.3.0. Vista restarts when it's installed.")).toBeInTheDocument();
    });

    it("installs nothing when the user declines", async () => {
      const user = userEvent.setup();
      const { updater, install } = createUpdater();
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), updater }} />);

      const dialog = await screen.findByRole("dialog", { name: "Vista 0.3.0 is available" });
      await user.click(within(dialog).getByRole("button", { name: "Later" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(install).not.toHaveBeenCalled();
    });

    it("asks about unsaved edits before restarting, and stays when the user cancels", async () => {
      const user = userEvent.setup();
      let release: () => void = () => {};
      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { updater, install } = createUpdater({
        check: async () => {
          await ready;
          return { version: "0.3.0", install };
        },
      });
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), updater }} />);
      await makeReadmeDirty(user);
      release();

      const offer = await screen.findByRole("dialog", { name: "Vista 0.3.0 is available" });
      await user.click(within(offer).getByRole("button", { name: "Install and Restart" }));
      const unsaved = await screen.findByRole("dialog", { name: "Save changes to readme.md?" });
      await user.click(within(unsaved).getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(install).not.toHaveBeenCalled();
      expect(getTab("readme.md")).toHaveTextContent("(unsaved)");
    });

    it("stays quiet when the check fails, such as offline", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { updater } = createUpdater({ check: async () => Promise.reject(new Error("offline")) });
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), updater }} />);

      await waitFor(() => expect(warn).toHaveBeenCalledWith("Could not check for updates:", expect.any(Error)));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByText(/Couldn't check for updates/)).not.toBeInTheDocument();
      warn.mockRestore();
    });

    it("says so when the update fails to install", async () => {
      const user = userEvent.setup();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const { updater } = createUpdater({ install: async () => Promise.reject(new Error("signature mismatch")) });
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), updater }} />);

      const dialog = await screen.findByRole("dialog", { name: "Vista 0.3.0 is available" });
      await user.click(within(dialog).getByRole("button", { name: "Install and Restart" }));

      expect(
        await findToast("Couldn't install Vista 0.3.0. You can try again from About in Settings."),
      ).toBeInTheDocument();
      error.mockRestore();
    });

    it("asks nothing at startup unless the user turned it on", async () => {
      localStorage.removeItem("vista.settings");
      const { updater } = createUpdater();
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), updater }} />);
      await screen.findByRole("button", { name: "Open Folder…" });

      expect(updater.check).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("offers nothing when Vista is up to date", async () => {
      const { updater } = createUpdater({ check: async () => null });
      render(<App adapter={{ platform: "native", workspace: createMockWorkspaceCapability(), updater }} />);

      await waitFor(() => expect(updater.check).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
