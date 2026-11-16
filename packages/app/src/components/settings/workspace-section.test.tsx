import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FolderStatus } from "../workspace/workspace-switcher";
import { WorkspaceSection } from "./workspace-section";

function renderSection(homeStatus: FolderStatus) {
  render(
    <WorkspaceSection
      workspace={{
        id: "w",
        name: "Research",
        icon: "folder",
        color: "neutral",
        folders: [{ id: "f", name: "notes", status: homeStatus }],
      }}
      onChange={vi.fn()}
      onAddFolder={vi.fn()}
      onRemoveFolder={vi.fn()}
      storage="folder"
      canStoreInFolder={homeStatus === "ready"}
      onChangeStorage={vi.fn()}
    />,
  );
}

describe("WorkspaceSection", () => {
  it("offers where the details are kept while the home folder is ready", () => {
    renderSection("ready");

    expect(screen.getByRole("radio", { name: "On this device" })).toBeInTheDocument();
  });

  // Moving the details either way reads or writes the home folder, so a choice it can't act on is hidden.
  it.each<FolderStatus>(["needs-permission", "unavailable"])(
    "offers no storage choice while the home folder is %s",
    (status) => {
      renderSection(status);

      expect(screen.queryByRole("radio", { name: "On this device" })).not.toBeInTheDocument();
    },
  );
});
