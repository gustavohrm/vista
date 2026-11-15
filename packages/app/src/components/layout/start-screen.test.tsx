import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RecentWorkspace } from "../workspace/workspace-switcher";
import { StartScreen } from "./start-screen";

function renderStartScreen(isLoading: boolean, recents: RecentWorkspace[] = []) {
  const props = { onOpenRecent: vi.fn(), onRemoveRecent: vi.fn() };
  render(
    <StartScreen
      workspaceName={null}
      isLoading={isLoading}
      recents={recents}
      onOpenFolder={vi.fn()}
      actions={[]}
      {...props}
    />,
  );
  return props;
}

describe("StartScreen", () => {
  it("shows the loader and offers nothing while a folder is being opened", () => {
    renderStartScreen(true);

    expect(screen.getByRole("status")).toHaveTextContent("Opening folder…");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("names the app with its logo once nothing is loading", () => {
    renderStartScreen(false);

    expect(screen.getByRole("heading", { name: "Vista" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Folder" })).toBeInTheDocument();
  });

  it("lists the recent workspaces with their folders, and says which one needs permission", async () => {
    const user = userEvent.setup();
    const { onOpenRecent, onRemoveRecent } = renderStartScreen(false, [
      {
        id: "w1",
        name: "Research",
        icon: "book-open",
        color: "indigo",
        folders: [
          { id: "f1", name: "notes", status: "ready" },
          { id: "f2", name: "sources", status: "ready" },
        ],
      },
      {
        id: "w2",
        name: "Work",
        icon: "folder",
        color: "neutral",
        folders: [{ id: "f3", name: "work", status: "needs-permission" }],
      },
    ]);

    expect(screen.getByRole("button", { name: "Research" })).toHaveAccessibleDescription("notes, sources");
    expect(screen.getByRole("button", { name: "Work" })).toHaveAccessibleDescription("Click to allow access");
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: 'Remove "Research" from Recent' }));

    expect(onOpenRecent).toHaveBeenCalledWith("w2");
    expect(onRemoveRecent).toHaveBeenCalledWith("w1");
  });
});
