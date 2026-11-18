import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RecentWorkspace } from "../workspace/workspace-switcher";
import { formatLastOpened, resetStartIntro, StartScreen } from "./start-screen";

function renderStartScreen(
  isLoading: boolean,
  recents: RecentWorkspace[] = [],
  hasWorkspace = false,
  entrance?: "single-stroke" | "opening",
) {
  const props = { onOpenRecent: vi.fn(), onRemoveRecent: vi.fn(), onOpenSettings: vi.fn() };
  const { container } = render(
    <StartScreen
      hasWorkspace={hasWorkspace}
      isLoading={isLoading}
      entrance={entrance}
      recents={recents}
      onOpenFolder={vi.fn()}
      settingsShortcut="Mod+,"
      hints={[{ label: "Go to file", shortcut: "Mod+P" }]}
      {...props}
    />,
  );
  return { ...props, container };
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
    expect(screen.getByRole("button", { name: "Open Folder…" })).not.toHaveAccessibleDescription();
  });

  it("writes the logo in the Single stroke when the start screen is the first view, once a run", () => {
    resetStartIntro();
    const first = renderStartScreen(false, [], false, "single-stroke");

    // The written logo is an image of the stroke; the still logo is drawn inline.
    expect(first.container.querySelector("img")).toBeInTheDocument();
    expect(first.container.querySelector('svg[data-motion="enter"]')).not.toBeInTheDocument();

    cleanup();
    const second = renderStartScreen(false, [], false, "single-stroke");

    expect(second.container.querySelector("img")).not.toBeInTheDocument();
  });

  it("plays the opening in the logo's place once a workspace has been open", () => {
    resetStartIntro();
    const { container } = renderStartScreen(false, [], false, "opening");

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector('svg[data-motion="enter"]')).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vista" })).toBeInTheDocument();
  });

  it("opens Settings from the Start list", async () => {
    const user = userEvent.setup();
    const { onOpenSettings } = renderStartScreen(false);

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("shows only key hints, and no buttons, while a workspace is open", () => {
    renderStartScreen(false, [], true);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Go to file")).toBeInTheDocument();
    expect(screen.getByText("Ctrl + P")).toBeInTheDocument();
  });

  it("says when each recent workspace was last opened", () => {
    const now = new Date(2026, 10, 15, 12).getTime();
    expect(formatLastOpened(new Date(2026, 10, 15, 8).getTime(), now)).toBe("Today");
    expect(formatLastOpened(new Date(2026, 10, 14, 23).getTime(), now)).toBe("Yesterday");
    expect(formatLastOpened(new Date(2026, 10, 3).getTime(), now)).toMatch(/3/);
    expect(formatLastOpened(new Date(2025, 10, 3).getTime(), now)).toMatch(/2025/);
  });

  it("calls all of yesterday Yesterday when it was 25 hours long", () => {
    const zone = process.env.TZ;
    // New York's clocks went back on 2026-11-01, so that day ran 25 hours.
    process.env.TZ = "America/New_York";
    try {
      const now = new Date(2026, 10, 2, 12).getTime();
      expect(formatLastOpened(new Date(2026, 10, 1, 0, 30).getTime(), now)).toBe("Yesterday");
    } finally {
      if (zone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = zone;
      }
    }
  });

  it("lists the recent workspaces without their folders, and says which one needs permission", async () => {
    const user = userEvent.setup();
    const { onOpenRecent, onRemoveRecent } = renderStartScreen(false, [
      {
        id: "w1",
        name: "Research",
        icon: "book-open",
        color: "indigo",
        lastOpenedAt: Date.now(),
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

    expect(screen.getByRole("button", { name: "Research" })).toHaveAccessibleDescription("Today");
    expect(screen.getByRole("button", { name: "Work" })).toHaveAccessibleDescription("Click to allow access");
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: 'Remove "Research" from Recent' }));

    expect(onOpenRecent).toHaveBeenCalledWith("w2");
    expect(onRemoveRecent).toHaveBeenCalledWith("w1");
  });
});
