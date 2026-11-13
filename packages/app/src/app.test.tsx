import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./app";
import type { AppAdapter, FileStat, WorkspaceCapability, WorkspaceNode } from "./ports";
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
  it.each(["web", "native"] as const)("renders the start screen for the %s host", async (platform) => {
    const adapter: AppAdapter = {
      platform,
      workspace: createMockWorkspaceCapability(),
    };

    const { container } = render(<App adapter={adapter} />);

    await screen.findByRole("button", { name: "Open Folder" });
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

    // Toggle to enriched mode
    const enrichedBtn = screen.getByRole("button", { name: "Table" });
    await user.click(enrichedBtn);

    // Should display table actions and cells
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add Row" })).toBeVisible();
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
      openFolder: vi.fn().mockRejectedValue(new Error("Permission to read this folder was not granted.")),
    });
    const adapter: AppAdapter = { platform: "web", workspace: mockWorkspace };

    render(<App adapter={adapter} />);

    await user.click(await screen.findByRole("button", { name: "Open Folder" }));

    expect(await findToast("Permission to read this folder was not granted.")).toBeInTheDocument();
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
    expect(document.querySelector(".coden-toast")).not.toBeInTheDocument();
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
    await user.keyboard("{Control>}s{/Control}");

    expect(await findToast("Write access was denied.")).toBeInTheDocument();
  });

  it("toggles the mobile explorer drawer open and closed", async () => {
    const user = userEvent.setup();
    const adapter: AppAdapter = { platform: "web", workspace: createMockWorkspaceCapability() };

    render(<App adapter={adapter} />);

    // The explorer is a drawer at this width, and the start screen offers the folder, so it starts closed.
    const toggleBtn = await screen.findByRole("button", { name: "Open explorer" });
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");

    await user.click(toggleBtn);

    expect(screen.getByRole("button", { name: "Close explorer" })).toHaveAttribute("aria-pressed", "true");
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

    it("applies a setting from the editor settings popover and remembers it", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openRawReadme(user);
      expect(document.querySelector(".cm-lineNumbers")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Editor settings" }));
      await user.click(screen.getByRole("menuitemcheckbox", { name: "Line numbers" }));

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

  describe("commands picker", () => {
    it("lists commands with Ctrl+Shift+P and runs the chosen one", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
      expect(screen.getByRole("combobox", { name: "Run a command" })).toHaveValue(">");
      expect(screen.getByRole("option", { name: "File: Open Folder…" })).toHaveAttribute("aria-selected", "true");
      await user.keyboard("about{Enter}");

      expect(await screen.findByRole("dialog", { name: "About Vista" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Commands" })).not.toBeInTheDocument();
    });

    it("shows a command that cannot run now as disabled and does not run it", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openRawReadme(user);

      await user.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");
      await user.keyboard("file save");
      const save = screen.getByRole("option", { name: /^File: Save\s*Ctrl\+S$/ });
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

    it("runs an editing command in the editor when opened by clicking the search field", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await makeReadmeDirty(user);

      await user.click(screen.getByRole("button", { name: "Search files and commands" }));
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

    it("opens from the title bar's search field, listing commands while no folder is open", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await screen.findByRole("button", { name: "Open Folder" });

      await user.click(screen.getByRole("button", { name: "Search files and commands" }));
      expect(screen.getByRole("combobox", { name: "Run a command" })).toHaveValue(">");
      // jsdom does not turn Escape into the dialog's cancel event.
      fireEvent(screen.getByRole("dialog", { name: "Commands" }), new Event("cancel", { cancelable: true }));

      await openFolderFromWelcome(user);
      await user.click(screen.getByRole("button", { name: "Search files and commands" }));
      expect(screen.getByRole("combobox", { name: "Go to file, or :line:column" })).toHaveValue("");
    });
  });

  describe("start screen", () => {
    it("lists ways to get to a file once a folder is open", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);
      const main = screen.getByRole("main");

      expect(within(main).getByRole("heading", { name: "My Notes" })).toBeInTheDocument();
      await user.click(within(main).getByRole("button", { name: "Search files" }));
      // jsdom does not turn Escape into the dialog's cancel event.
      fireEvent(screen.getByRole("dialog", { name: "Go to file" }), new Event("cancel", { cancelable: true }));

      await user.click(within(main).getByRole("button", { name: "Create a new file" }));
      expect(screen.getByRole("textbox", { name: "Entry name" })).toBeInTheDocument();
    });

    it("gives way to the document when a file is opened", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openFolderFromWelcome(user);

      await user.click(screen.getByText("readme.md"));

      await screen.findByRole("heading", { name: "Hello Vista" });
      expect(screen.queryByRole("button", { name: "Search files" })).not.toBeInTheDocument();
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
      expect(screen.queryByRole("button", { name: /^Reopen/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open Folder" })).toBeInTheDocument();
    });

    it("offers Open Folder on the start screen when no folder is remembered", async () => {
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(await screen.findByRole("button", { name: "Open Folder" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Reopen/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open explorer" })).toBeInTheDocument();
    });

    it("shows an error message when restoring the last folder fails unexpectedly", async () => {
      const mockWorkspace = createMockWorkspaceCapability({
        restoreFolder: vi.fn().mockRejectedValue(new Error("Storage is unavailable.")),
      });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);

      expect(await findToast("Storage is unavailable.")).toBeInTheDocument();
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
      expect(
        await findToast("Local folder access is not supported in this browser or environment."),
      ).toBeInTheDocument();
    });
  });

  describe("menus", () => {
    function openMenu(user: UserEvent, name: string) {
      return user.click(screen.getByRole("menuitem", { name }));
    }

    it("saves every dirty file from File > Save All", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await makeReadmeDirty(user);
      await user.click(screen.getByText("data.csv"));
      await appendToRawEditor(user, await screen.findByRole("textbox", { name: "Raw text content of data.csv" }), "!");

      await openMenu(user, "File");
      await user.click(screen.getByRole("menuitem", { name: "Save All" }));

      await waitFor(() => expect(mockWorkspace.writeFile).toHaveBeenCalledTimes(2));
      expect(writtenTexts(mockWorkspace, "readme.md")).toEqual([EDITED_README_CONTENT]);
      expect(writtenTexts(mockWorkspace, "data.csv")).toEqual([`${CSV_CONTENT}!`]);
    });

    it("starts naming a new file at the root from File > New File", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMockWorkspaceCapability();
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await openFolderFromWelcome(user);

      await openMenu(user, "File");
      await user.click(screen.getByRole("menuitem", { name: "New File" }));
      await user.type(await screen.findByRole("textbox", { name: "Entry name" }), "todo.md{Enter}");

      expect(mockWorkspace.createFile).toHaveBeenCalledWith(expect.objectContaining({ id: "workspace-1" }), "todo.md");
    });

    it("toggles word wrap from the View menu and with Alt+Z", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      await openRawReadme(user);

      await openMenu(user, "View");
      const wordWrap = screen.getByRole("menuitemcheckbox", { name: "Word Wrap" });
      const wasChecked = wordWrap.getAttribute("aria-checked") === "true";
      await user.click(wordWrap);
      await user.keyboard("{Alt>}z{/Alt}");
      await openMenu(user, "View");

      expect(screen.getByRole("menuitemcheckbox", { name: "Word Wrap" })).toHaveAttribute(
        "aria-checked",
        String(wasChecked),
      );
    });

    it("undoes in the raw editor from Edit > Undo, returning focus to it", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);
      const editor = await makeReadmeDirty(user);

      await openMenu(user, "Edit");
      await user.click(screen.getByRole("menuitem", { name: "Undo" }));

      expect(rawEditorText(editor)).toBe(README_CONTENT);
      expect(editor).toHaveFocus();
    });

    it("lists every command with a key in the Keyboard Shortcuts dialog", async () => {
      const user = userEvent.setup();
      render(<App adapter={{ platform: "web", workspace: createMockWorkspaceCapability() }} />);

      await openMenu(user, "Help");
      await user.click(screen.getByRole("menuitem", { name: "Keyboard Shortcuts" }));

      const dialog = await screen.findByRole("dialog", { name: "Keyboard Shortcuts" });
      expect(within(dialog).getByRole("row", { name: "Save Ctrl+S" })).toBeInTheDocument();
      expect(within(dialog).getByRole("row", { name: "Word Wrap Alt+Z" })).toBeInTheDocument();
      expect(within(dialog).getByRole("row", { name: "Undo Ctrl+Z" })).toBeInTheDocument();
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
      fireEvent.contextMenu(getTab("readme.md"));
      await user.keyboard("{Enter}");
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));

      // Closing the same tab another way, from the editor, leaves the tabs alone.
      await user.click(editor);
      await openMenu(user, "File");
      await user.click(screen.getByRole("menuitem", { name: "Close Tab" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Don't Save" }));

      await waitFor(() => expect(screen.queryByRole("tab", { name: /readme\.md/ })).not.toBeInTheDocument());
      expect(getTab("data.csv")).not.toHaveFocus();
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

      expect(await screen.findByText("Press Ctrl+V to paste.")).toBeInTheDocument();
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
    await appendToRawEditor(user, await screen.findByRole("textbox", { name: "Raw text content of data.csv" }), "!");

    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.click(screen.getByRole("menuitem", { name: "Close All Tabs" }));

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
      openFolder: vi
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
    await user.click(screen.getByRole("button", { name: "Open Another Folder" }));
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
      expect(screen.getByText("Changed on disk")).toBeInTheDocument();
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

      expect(await screen.findByText("Deleted on disk")).toBeInTheDocument();
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
      const dialog = await screen.findByRole("dialog", { name: "Settings" });
      const limit = within(dialog).getByRole("spinbutton", { name: "Largest file to open (MB)" });
      await user.clear(limit);
      await user.type(limit, "0");
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a whole number from 1 to 512.");
      await user.clear(limit);
      await user.type(limit, "30");
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
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

      await user.click(await screen.findByRole("button", { name: "Open Folder" }));

      // jsdom's name computation drops the space a browser keeps before the hidden hint.
      expect(
        await screen.findByRole("button", {
          name: /^private ?\(Vista can't read this folder, so its files aren't listed\)$/,
        }),
      ).toBeInTheDocument();
    });

    it("refuses a binary file", async () => {
      const user = userEvent.setup();
      const mockWorkspace = createMemoryWorkspace({ "photo.bin": new Uint8Array([0x89, 0x00, 0x01]) });
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await user.click(await screen.findByRole("button", { name: "Open Folder" }));

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
      await user.click(await screen.findByRole("button", { name: "Open Folder" }));

      await user.click(await screen.findByText("legacy.txt"));
      const editor = await screen.findByRole("textbox", { name: /Raw text content of legacy\.txt/i });
      await appendToRawEditor(user, editor, "!");

      expect(
        await findToast('"legacy.txt" isn\'t UTF-8 text, so it opened read-only to keep its characters intact.'),
      ).toBeInTheDocument();
      expect(screen.getByText("Read-only")).toBeInTheDocument();
      expect(rawEditorText(editor)).toBe("caf�");
      expect(getTab("legacy.txt")).not.toHaveTextContent("(unsaved)");
    });

    it("keeps a UTF-8 byte order mark when saving", async () => {
      const user = userEvent.setup();
      const bom = [0xef, 0xbb, 0xbf];
      const mockWorkspace = createMemoryWorkspace(
        { "notes.txt": new Uint8Array([...bom, ...new TextEncoder().encode("Hi")]) },
        { tree: [fileNode("notes.txt")] },
      );
      render(<App adapter={{ platform: "web", workspace: mockWorkspace }} />);
      await user.click(await screen.findByRole("button", { name: "Open Folder" }));
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
      await screen.findByRole("button", { name: "Open Folder" });

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
});
