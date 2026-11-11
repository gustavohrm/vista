import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./app";
import type { AppAdapter, RestoreFolderResult, WorkspaceCapability, WorkspaceNode } from "./ports";

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

function createMockWorkspaceCapability(overrides?: Partial<WorkspaceCapability>): WorkspaceCapability {
  return {
    isSupported: true,
    openFolder: vi.fn().mockResolvedValue({
      id: "workspace-1",
      name: "My Notes",
      rootPath: "/notes",
    }),
    readTree: vi.fn().mockResolvedValue(ROOT_TREE),
    readFile: vi.fn().mockImplementation((path: string) => {
      if (path === "readme.md") {
        return Promise.resolve(README_CONTENT);
      }
      if (path === "data.csv") {
        return Promise.resolve(CSV_CONTENT);
      }
      return Promise.resolve("Plain text");
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    createFile: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    restoreFolder: vi.fn().mockResolvedValue({ status: "none" } satisfies RestoreFolderResult),
    ...overrides,
  };
}

/**
 * Opens the mock folder from the explorer's welcome state and waits for its tree to appear.
 *
 * @param user - The user-event instance driving the interaction.
 */
async function openFolderFromWelcome(user: UserEvent) {
  await user.click(await screen.findByRole("button", { name: "Open Folder" }));
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

function getTab(name: string): HTMLElement {
  return screen.getByRole("tab", { name: new RegExp(`^${name.replaceAll(".", "\\.")}`) });
}

describe("App", () => {
  it.each(["web", "native"] as const)("renders an empty editor surface for the %s host", async (platform) => {
    const adapter: AppAdapter = {
      platform,
      workspace: createMockWorkspaceCapability(),
    };

    const { container } = render(<App adapter={adapter} />);

    await screen.findByRole("button", { name: "Open Folder" });
    expect(screen.getByRole("main")).toBeEmptyDOMElement();
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

    expect(mockWorkspace.openFolder).toHaveBeenCalled();
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

    // Save button should be enabled
    const saveBtn = screen.getByRole("button", { name: "Save file" });
    expect(saveBtn).toBeEnabled();

    // Click save
    await user.click(saveBtn);
    expect(mockWorkspace.writeFile).toHaveBeenCalledWith("readme.md", EDITED_README_CONTENT);
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

    // Toggle to enriched mode
    const enrichedBtn = screen.getByRole("button", { name: "View" });
    await user.click(enrichedBtn);

    // Should display table actions and cells
    await waitFor(() => {
      expect(screen.getByText("Table Actions:")).toBeVisible();
      expect(screen.getByDisplayValue("Alice")).toBeVisible();
    });

    // Edit cell
    const cellInput = screen.getByDisplayValue("Alice");
    await user.clear(cellInput);
    await user.type(cellInput, "Alicia");

    // Save changes
    const saveBtn = screen.getByRole("button", { name: "Save file" });
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    // The file's LF line breaks survive the table's rewrite.
    expect(mockWorkspace.writeFile).toHaveBeenCalledWith("data.csv", "Name,Age\nAlicia,30\nBob,25");
  });

  it("shows an error toast when opening a folder fails for a reason other than user cancellation", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability({
      openFolder: vi.fn().mockRejectedValue(new Error("Permission to read this folder was not granted.")),
    });
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };

    render(<App adapter={adapter} />);

    await user.click(await screen.findByRole("button", { name: "Open Folder" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Permission to read this folder was not granted.");
  });

  it("shows no error toast when the user cancels the folder picker", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability({
      openFolder: vi.fn().mockResolvedValue(null),
    });
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };

    render(<App adapter={adapter} />);

    await user.click(await screen.findByRole("button", { name: "Open Folder" }));

    await waitFor(() => expect(mockWorkspace.openFolder).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("No folder open")).toBeInTheDocument();
  });

  it("shows an info toast when a folder is opened through the fallback (non-direct) access mode", async () => {
    const user = userEvent.setup();
    const mockWorkspace = createMockWorkspaceCapability({
      openFolder: vi.fn().mockResolvedValue({
        id: "workspace-1",
        name: "My Notes",
        rootPath: "/notes",
        accessMode: "fallback",
      }),
    });
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };

    render(<App adapter={adapter} />);

    await user.click(await screen.findByRole("button", { name: "Open Folder" }));

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
    await user.click(screen.getByRole("button", { name: "Save file" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Write access was denied.");
  });

  it("toggles the mobile explorer drawer open and closed", async () => {
    const user = userEvent.setup();
    const adapter: AppAdapter = { platform: "web", workspace: createMockWorkspaceCapability() };

    render(<App adapter={adapter} />);

    // Startup opens the explorer on phones when no folder is restored, so it starts open here.
    const toggleBtn = await screen.findByRole("button", { name: "Close explorer" });
    expect(toggleBtn).toHaveAttribute("aria-pressed", "true");

    await user.click(toggleBtn);

    expect(screen.getByRole("button", { name: "Open explorer" })).toHaveAttribute("aria-pressed", "false");
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

    expect(mockWorkspace.createFile).toHaveBeenCalledWith("todo.md");
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

    expect(await screen.findByRole("alert")).toHaveTextContent('"todo.md" already exists.');
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

    expect(mockWorkspace.move).toHaveBeenCalledWith("readme.md", "guide.md");
    // The mocked readTree always returns the same static list, so this verifies the
    // in-place document path update rather than a refreshed tree from disk.
    const editor = screen.getByRole("main");
    await waitFor(() => expect(within(editor).getByText("guide.md")).toBeInTheDocument());
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

    expect(mockWorkspace.remove).toHaveBeenCalledWith("readme.md");
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

    await user.click(await screen.findByRole("button", { name: "Open Folder" }));
    await screen.findByText("notes");
    const explorer = screen.getByRole("navigation", { name: "File Explorer" });
    fireEvent.contextMenu(within(explorer).getByText("notes"));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog", { name: 'Delete "notes"?' });
    expect(
      within(dialog).getByText("This folder and everything in it will be permanently deleted."),
    ).toBeInTheDocument();
  });

  it("toggles theme between dark and light", async () => {
    const user = userEvent.setup();
    const adapter: AppAdapter = {
      platform: "web",
      workspace: createMockWorkspaceCapability(),
    };

    render(<App adapter={adapter} />);

    const themeBtn = screen.getByRole("button", { name: /switch to (light|dark) theme/i });
    expect(themeBtn).toBeVisible();

    await user.click(themeBtn);

    expect(document.documentElement.getAttribute("data-theme")).toBeDefined();
  });

  describe("tabs", () => {
    it("opens each selected file in its own tab and switches between them", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.click(screen.getByText("readme.md"));
      await user.click(screen.getByText("data.csv"));

      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["readme.md", "data.csv"]);
      expect(getTab("data.csv")).toHaveAttribute("aria-selected", "true");
      expect(rawEditorText(await screen.findByRole("textbox", { name: /Raw text content of data\.csv/i }))).toBe(
        CSV_CONTENT,
      );

      await user.click(getTab("readme.md"));

      expect(await screen.findByRole("heading", { name: "Hello Vista" })).toBeVisible();
    });

    it("keeps unsaved edits in a tab while another file is opened, without asking", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);

      await user.click(screen.getByText("data.csv"));
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
      await user.click(await screen.findByRole("button", { name: "View" }));

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

      await user.click(screen.getByRole("button", { name: "View" }));
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

    it("applies a setting from the editor settings popover and remembers it", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openRawReadme(user);
      expect(document.querySelector(".cm-lineNumbers")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Editor settings" }));
      await user.click(screen.getByRole("switch", { name: "Line numbers" }));

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
      await user.click(screen.getByRole("button", { name: "View" }));
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
      expect(screen.getByRole("option", { name: "readme.md" })).toHaveAttribute("aria-selected", "true");
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
      expect(mockWorkspace.writeFile).toHaveBeenCalledWith("readme.md", EDITED_README_CONTENT);
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

      expect(await screen.findByRole("alert")).toHaveTextContent("Write access was denied.");
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

      expect(mockWorkspace.writeFile).toHaveBeenCalledWith("readme.md", EDITED_README_CONTENT);
      await waitFor(() => expect(getTab("readme.md")).not.toHaveTextContent("(unsaved)"));
    });

    it("keeps a tab marked unsaved when it was edited while its save was in flight", async () => {
      const user = userEvent.setup();
      let finishWrite: () => void = () => {};
      const mockWorkspace = createMockWorkspaceCapability({
        writeFile: vi.fn().mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              finishWrite = resolve;
            }),
        ),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      const editor = await makeReadmeDirty(user);

      await user.click(screen.getByRole("button", { name: "Save file" }));
      await appendToRawEditor(user, editor, "!");
      await act(async () => finishWrite());

      expect(mockWorkspace.writeFile).toHaveBeenCalledTimes(1);
      expect(getTab("readme.md")).toHaveTextContent("(unsaved)");
      expect(screen.getByRole("button", { name: "Save file" })).toBeEnabled();
    });

    it("asks again when the tab was edited while its save-then-close was in flight", async () => {
      const user = userEvent.setup();
      let finishWrite: () => void = () => {};
      const mockWorkspace = createMockWorkspaceCapability({
        writeFile: vi.fn().mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              finishWrite = resolve;
            }),
        ),
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
        restoreFolder: vi.fn().mockResolvedValue({ status: "restored", workspace: REMEMBERED_WORKSPACE }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(await screen.findByText("readme.md")).toBeInTheDocument();
      expect(mockWorkspace.restoreFolder).toHaveBeenCalledWith({ interactive: false });
      expect(mockWorkspace.openFolder).not.toHaveBeenCalled();
    });

    it("reopens a remembered folder that needs permission when the user clicks its button", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi
          .fn()
          .mockResolvedValueOnce({ status: "needs-permission", name: "My Notes" })
          .mockResolvedValueOnce({ status: "restored", workspace: REMEMBERED_WORKSPACE }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      await user.click(await screen.findByRole("button", { name: "Reopen My Notes" }));

      expect(mockWorkspace.restoreFolder).toHaveBeenLastCalledWith({ interactive: true });
      expect(await screen.findByText("readme.md")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reopen My Notes" })).not.toBeInTheDocument();
    });

    it("keeps the reopen button and shows no message when permission is dismissed again", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi.fn().mockResolvedValue({ status: "needs-permission", name: "My Notes" }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      await user.click(await screen.findByRole("button", { name: "Reopen My Notes" }));

      await waitFor(() => expect(mockWorkspace.restoreFolder).toHaveBeenCalledWith({ interactive: true }));
      expect(screen.getByRole("button", { name: "Reopen My Notes" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows an info message and no reopen button when the last folder can no longer be opened", async () => {
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi.fn().mockResolvedValue({ status: "unavailable", name: "My Notes" }),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(
        await screen.findByText('Couldn\'t reopen "My Notes". It may have been moved or deleted.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Reopen/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open Folder" })).toBeInTheDocument();
    });

    it("shows the Open Folder state and an open explorer when no folder is remembered", async () => {
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(await screen.findByRole("button", { name: "Open Folder" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Reopen/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close explorer" })).toBeInTheDocument();
    });

    it("shows an error message when restoring the last folder fails unexpectedly", async () => {
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi.fn().mockRejectedValue(new Error("Storage is unavailable.")),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(await screen.findByRole("alert")).toHaveTextContent("Storage is unavailable.");
      expect(screen.getByRole("button", { name: "Open Folder" })).toBeInTheDocument();
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

      await user.click(await screen.findByRole("button", { name: "Open Folder" }));

      expect(mockWorkspace.restoreFolder).not.toHaveBeenCalled();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Local folder access is not supported in this browser or environment.",
      );
    });
  });
});
