import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SWITCHER_MATCH_LIMIT, WorkspaceSwitcher, type RecentWorkspace } from "./workspace-switcher";

function workspace(id: string, name: string): RecentWorkspace {
  return { id, name, icon: "folder", color: "neutral", folders: null };
}

function renderSwitcher(recents: RecentWorkspace[], workspaces: RecentWorkspace[]) {
  render(
    <WorkspaceSwitcher
      current={recents[0] ?? null}
      recents={recents}
      workspaces={workspaces}
      onSwitch={vi.fn()}
      onOpenFolder={vi.fn()}
      onOpenSettings={vi.fn()}
      onClose={vi.fn()}
      onRemoveFromRecent={vi.fn()}
    />,
  );
}

async function search(text: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Notes|No workspace/ }));
  await user.keyboard(text);
  return screen.getByRole("listbox", { name: "Workspaces" });
}

function optionNames(list: HTMLElement) {
  return within(list)
    .getAllByRole("option")
    .map((option) => option.textContent);
}

describe("WorkspaceSwitcher search", () => {
  it("lists the best matches first: a name it starts, then a word it starts, then the rest", async () => {
    const recents = [workspace("n", "Notes"), workspace("p", "Piano")];
    // The others, the most recently opened first.
    const others = [workspace("w", "Work notes"), workspace("a", "Annotated"), workspace("o", "Notebook")];
    renderSwitcher(recents, [...recents, ...others]);

    const list = await search("no");

    expect(optionNames(list)).toEqual([
      "Notes",
      "Notebook",
      "Work notes",
      "Piano",
      "Annotated",
      "Open Folder…",
      "Close Workspace",
    ]);
  });

  it(`lists at most ${SWITCHER_MATCH_LIMIT} matches and says how many more there are`, async () => {
    const recents = [workspace("n", "Notes")];
    const others = Array.from({ length: 11 }, (_, index) => workspace(`w${index}`, `Work ${index}`));
    renderSwitcher(recents, [...recents, ...others]);

    const list = await search("work");

    expect(within(list).getAllByRole("option")).toHaveLength(SWITCHER_MATCH_LIMIT + 2);
    expect(within(list).getByText("3 more — keep typing")).toBeInTheDocument();

    await userEvent.setup().keyboard(" 1");
    expect(optionNames(list)).toEqual(["Work 1", "Work 10", "Open Folder…", "Close Workspace"]);
    expect(within(list).queryByText(/more — keep typing/)).not.toBeInTheDocument();
  });

  it("finds a name without regard to accents", async () => {
    const recents = [workspace("n", "Notes"), workspace("p", "Programação")];
    renderSwitcher(recents, recents);

    const list = await search("programacao");

    expect(optionNames(list)).toEqual(["Programação", "Open Folder…", "Close Workspace"]);
  });
});
