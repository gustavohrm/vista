import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./settings-page";
import type { ManagedWorkspace } from "./workspace-manager";

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

function renderSettings(overrides: Partial<ComponentProps<typeof SettingsPage>> = {}) {
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

  it("has no folder list for a workspace that is just its one folder, nor for the one whose page shows", () => {
    renderSettings({ section: "workspaces", shownWorkspaceId: "r" });

    expect(screen.getByRole("button", { name: "Notes" })).not.toHaveAccessibleDescription();
    // Archive's one folder isn't found, so its list says so.
    expect(screen.getByRole("button", { name: "Archive" })).toHaveAccessibleDescription(/Archive, ?Not found/);
    expect(screen.getByRole("button", { name: "Research" })).toHaveAccessibleDescription("Open");
  });
});
