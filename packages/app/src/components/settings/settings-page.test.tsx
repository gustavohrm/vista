import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./settings-page";
import type { ManagedWorkspace } from "./workspace-manager";
import { NAV_FIRST_COUNT } from "./workspace-nav";

const WORKSPACES: ManagedWorkspace[] = [
  {
    id: "a",
    name: "Archive",
    icon: "folder",
    color: "neutral",
    folders: [{ id: "f1", name: "Archive", status: "unavailable" }],
    status: "unavailable",
  },
  {
    id: "n",
    name: "Notes",
    icon: "folder",
    color: "neutral",
    folders: [{ id: "f2", name: "Notes", status: "ready" }],
    status: null,
  },
  {
    id: "r",
    name: "Research",
    icon: "book-open",
    color: "indigo",
    folders: [
      { id: "f3", name: "papers", status: "ready" },
      { id: "f4", name: "sources", status: "needs-permission" },
    ],
    status: "open",
  },
];

function settingsProps(overrides: Partial<ComponentProps<typeof SettingsPage>> = {}) {
  const props: ComponentProps<typeof SettingsPage> = {
    section: "appearance",
    onSectionChange: vi.fn(),
    workspaces: WORKSPACES,
    shownWorkspaceId: null,
    onSelectWorkspace: vi.fn(),
    onNewWorkspace: vi.fn(),
    onClose: vi.fn(),
    children: <p>Section</p>,
    ...overrides,
  };
  return props;
}

function renderSettings(overrides: Partial<ComponentProps<typeof SettingsPage>> = {}) {
  const props = settingsProps(overrides);
  render(<SettingsPage {...props} />);
  return props;
}

function Shell({ isOpen }: { isOpen: boolean }) {
  return (
    <>
      <button type="button">Opener</button>
      {isOpen && (
        <SettingsPage
          section="appearance"
          onSectionChange={() => undefined}
          workspaces={[]}
          shownWorkspaceId={null}
          onSelectWorkspace={() => undefined}
          onNewWorkspace={() => undefined}
          onClose={() => undefined}
        >
          <p>Section</p>
        </SettingsPage>
      )}
    </>
  );
}

describe("SettingsPage", () => {
  it("gives focus back to what had it when it closes, under StrictMode too", () => {
    const { rerender } = render(<Shell isOpen={false} />, { wrapper: StrictMode });
    const opener = screen.getByRole("button", { name: "Opener" });
    opener.focus();

    rerender(<Shell isOpen />);
    expect(opener).not.toHaveFocus();
    rerender(<Shell isOpen={false} />);

    expect(opener).toHaveFocus();
  });

  it("lists each workspace in the navigation before Vista's sections, and shows one's page when chosen", async () => {
    const user = userEvent.setup();
    const props = renderSettings({ section: "workspaces", shownWorkspaceId: "r" });

    const items = screen.getAllByRole("button").filter((button) => button.closest("nav"));
    const names = [
      "Search Workspaces",
      "New Workspace…",
      "Archive",
      "Notes",
      "Research",
      "Appearance",
      "Editor",
      "Files",
      "Keyboard Shortcuts",
      "About",
    ];
    expect(items).toEqual(names.map((name) => screen.getByRole("button", { name })));
    expect(screen.getByRole("button", { name: "Research" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(screen.getByRole("button", { name: "New Workspace…" }));

    expect(props.onSelectWorkspace).toHaveBeenCalledWith("n");
    expect(props.onNewWorkspace).toHaveBeenCalledOnce();
  });

  it("says which workspace is open and which isn't found", () => {
    renderSettings({ section: "appearance" });

    expect(screen.getByRole("button", { name: "Research" })).toHaveAccessibleDescription(/^Open/);
    expect(screen.getByRole("button", { name: "Archive" })).toHaveAccessibleDescription(/^Not found/);
    expect(screen.getByRole("button", { name: "Notes" })).not.toHaveAccessibleDescription();
  });

  it("shows a workspace's folders, with why one can't be reached, as the keyboard reaches it", async () => {
    const user = userEvent.setup();
    renderSettings({ section: "appearance" });

    screen.getByRole("button", { name: "Archive" }).focus();
    await user.tab();
    await user.tab();

    const research = screen.getByRole("button", { name: "Research" });
    expect(research).toHaveFocus();
    expect(research).toHaveAccessibleDescription(/^Open papers sources, ?Needs access$/);
    const popover = document.getElementById(research.getAttribute("aria-describedby")!.split(" ")[1]!)!;
    expect(popover).toHaveClass("visible");

    await user.keyboard("{Escape}");
    expect(popover).toHaveClass("invisible");
  });

  describe("placed near the window's bottom", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("moves a workspace's folder list up to end inside the window", async () => {
      const user = userEvent.setup();
      renderSettings({ section: "appearance" });
      const research = screen.getByRole("button", { name: "Research" });
      vi.spyOn(research, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: window.innerHeight - 28, width: 200, height: 28 }),
      );
      const popover = document.getElementById(research.getAttribute("aria-describedby")!.split(" ")[1]!)!;
      vi.spyOn(popover, "offsetHeight", "get").mockReturnValue(100);

      screen.getByRole("button", { name: "Notes" }).focus();
      await user.tab();

      expect(popover).toHaveClass("visible");
      expect(popover.style.top).toBe(`${window.innerHeight - 8 - 100}px`);
    });
  });

  it("has no folder list for a workspace that is just its one folder, nor for the one whose page shows", () => {
    renderSettings({ section: "workspaces", shownWorkspaceId: "r" });

    expect(screen.getByRole("button", { name: "Notes" })).not.toHaveAccessibleDescription();
    // Archive's one folder isn't found, so its list says so.
    expect(screen.getByRole("button", { name: "Archive" })).toHaveAccessibleDescription(/Archive, ?Not found/);
    expect(screen.getByRole("button", { name: "Research" })).toHaveAccessibleDescription("Open");
  });

  describe("with many workspaces", () => {
    /** Workspaces named W01 to W{count}, by name, none open. */
    function many(count: number): ManagedWorkspace[] {
      return Array.from({ length: count }, (_, index) => {
        const name = `W${String(index + 1).padStart(2, "0")}`;
        return { id: name, name, icon: "folder", color: "neutral", folders: null, status: null };
      });
    }

    function listedNames() {
      return screen
        .getAllByRole("button")
        .filter((button) => button.dataset.workspaceId !== undefined)
        .map((button) => button.dataset.workspaceId);
    }

    it("lists eight, then four more, then See all lists every one in place of Vista's sections", async () => {
      const user = userEvent.setup();
      renderSettings({ workspaces: many(20) });

      expect(listedNames()).toHaveLength(NAV_FIRST_COUNT);
      await user.click(screen.getByRole("button", { name: "Show 4 more" }));
      expect(listedNames()).toHaveLength(12);
      expect(screen.getByRole("button", { name: "W09" })).toHaveFocus();

      await user.click(screen.getByRole("button", { name: "See all" }));
      expect(listedNames()).toHaveLength(20);
      expect(screen.getByRole("button", { name: "W13" })).toHaveFocus();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("SettingsWorkspaces");
      expect(screen.queryByRole("button", { name: "Appearance" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Settings" }));
      expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
      expect(listedNames()).toHaveLength(12);
      expect(screen.getByRole("button", { name: "See all" })).toHaveFocus();
    });

    it("brings Vista's sections back when one is opened from elsewhere while every workspace is listed", async () => {
      const user = userEvent.setup();
      const props = settingsProps({ workspaces: many(20) });
      const { rerender } = render(<SettingsPage {...props} />);
      await user.click(screen.getByRole("button", { name: "Show 4 more" }));
      await user.click(screen.getByRole("button", { name: "See all" }));
      expect(screen.queryByRole("button", { name: "Appearance" })).not.toBeInTheDocument();

      // As the command palette opens Keyboard Shortcuts.
      rerender(<SettingsPage {...props} section="shortcuts" />);

      expect(screen.getByRole("button", { name: "Keyboard Shortcuts" })).toHaveAttribute("aria-current", "page");
      // As many as before See all, as when its heading brings the sections back.
      expect(listedNames()).toHaveLength(12);
    });

    it("shows only as many more as there are", async () => {
      const user = userEvent.setup();
      renderSettings({ workspaces: many(10) });

      await user.click(screen.getByRole("button", { name: "Show 2 more" }));

      expect(listedNames()).toHaveLength(10);
      expect(screen.queryByRole("button", { name: /^(Show|See)/ })).not.toBeInTheDocument();
    });

    it("always lists the open workspace and the one whose page shows, in their place", () => {
      const workspaces = many(20).map((workspace) =>
        workspace.id === "W15" ? { ...workspace, status: "open" as const } : workspace,
      );
      renderSettings({ workspaces, section: "workspaces", shownWorkspaceId: "W18" });

      expect(listedNames()).toEqual(["W01", "W02", "W03", "W04", "W05", "W06", "W07", "W08", "W15", "W18"]);
      expect(screen.getByRole("button", { name: "Show 4 more" })).toBeInTheDocument();
    });

    it("searches every workspace by name, uncapped, until the search closes", async () => {
      const user = userEvent.setup();
      renderSettings({ workspaces: many(20) });

      await user.click(screen.getByRole("button", { name: "Search Workspaces" }));
      const field = screen.getByRole("searchbox", { name: "Search workspaces" });
      expect(field).toHaveFocus();
      await user.type(field, "w1");
      expect(listedNames()).toEqual(["W10", "W11", "W12", "W13", "W14", "W15", "W16", "W17", "W18", "W19"]);
      expect(screen.queryByRole("button", { name: /^(Show|See)/ })).not.toBeInTheDocument();

      await user.clear(field);
      await user.type(field, "zz");
      expect(screen.getByText("No matching workspaces")).toBeInTheDocument();

      // Escape ends the search, not Settings.
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Search Workspaces" })).toHaveFocus();
      expect(listedNames()).toHaveLength(NAV_FIRST_COUNT);
    });

    it("closes the search with the button that opened it", async () => {
      const user = userEvent.setup();
      const props = renderSettings({ workspaces: many(3) });

      await user.click(screen.getByRole("button", { name: "Search Workspaces" }));
      await user.type(screen.getByRole("searchbox"), "W02");
      await user.click(screen.getByRole("button", { name: "Close Search" }));

      expect(listedNames()).toEqual(["W01", "W02", "W03"]);
      expect(props.onClose).not.toHaveBeenCalled();
    });
  });
});
