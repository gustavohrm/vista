import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StartScreen } from "./start-screen";

function renderStartScreen(isLoading: boolean) {
  render(
    <StartScreen
      workspaceName={null}
      isLoading={isLoading}
      restorableFolderName={null}
      onOpenFolder={vi.fn()}
      onReopenFolder={vi.fn()}
      actions={[]}
    />,
  );
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
});
