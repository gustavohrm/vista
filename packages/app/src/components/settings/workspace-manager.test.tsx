import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { FolderStatus } from "../workspace/workspace-switcher";
import { WorkspacePage, type WorkspaceLock } from "./workspace-manager";

function renderPage(overrides: Partial<ComponentProps<typeof WorkspacePage>> = {}, homeStatus: FolderStatus = "ready") {
  const props: ComponentProps<typeof WorkspacePage> = {
    workspace: {
      id: "w",
      name: "Research",
      icon: "folder",
      color: "neutral",
      folders: [{ id: "f", name: "notes", status: homeStatus }],
    },
    isOpen: false,
    storage: "folder",
    canStoreInFolder: homeStatus === "ready",
    lock: null,
    onOpen: vi.fn(),
    onAllowAccess: vi.fn(),
    onChange: vi.fn(),
    onAddFolder: vi.fn(),
    onRemoveFolder: vi.fn(),
    onChangeStorage: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const { rerender } = render(<WorkspacePage {...props} />);
  return {
    ...props,
    rerender: (changes: Partial<ComponentProps<typeof WorkspacePage>>) =>
      rerender(<WorkspacePage {...props} {...changes} />),
  };
}

describe("WorkspacePage", () => {
  it("drops a colour the picker showed but didn't commit once another colour is chosen", () => {
    const props = renderPage();
    const picker = screen.getByLabelText("Custom colour");
    const swatch = picker.closest("label")!;
    const idle = swatch.style.background;

    fireEvent.input(picker, { target: { value: "#123456" } });
    expect(swatch.style.background).not.toBe(idle);
    // The picker is dismissed, and a palette swatch is chosen instead.
    props.rerender({ workspace: { ...props.workspace, color: "rose" } });

    expect(swatch.style.background).toBe(idle);
  });

  it("offers Open for a workspace that isn't open", async () => {
    const user = userEvent.setup();
    const props = renderPage();

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(props.onOpen).toHaveBeenCalledOnce();
  });

  it("has no Open button for the open workspace", () => {
    renderPage({ isOpen: true });

    expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
  });

  it("offers where the details are kept while the home folder is ready", () => {
    renderPage();

    expect(screen.getByRole("radio", { name: "On this device" })).toBeInTheDocument();
  });

  // Moving the details either way reads or writes the home folder, so a choice it can't act on is hidden.
  it.each<FolderStatus>(["needs-permission", "unavailable"])(
    "offers no storage choice while the home folder is %s",
    (status) => {
      renderPage({}, status);

      expect(screen.queryByRole("radio", { name: "On this device" })).not.toBeInTheDocument();
    },
  );

  it("asks for access to the home folder before its details can be changed", async () => {
    const user = userEvent.setup();
    const props = renderPage({ lock: "needs-permission" }, "needs-permission");

    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Allow access" }));
    expect(props.onAllowAccess).toHaveBeenCalledOnce();
  });

  it.each<[WorkspaceLock, string]>([
    ["unavailable", `"notes" isn't found, so the details kept in it can't be changed.`],
    ["unreadable", `"notes" holds workspace details this version of Vista can't read, so they can't be changed here.`],
  ])("disables the details while the file is %s, and still deletes", async (lock, message) => {
    const user = userEvent.setup();
    const props = renderPage({ lock });

    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Folder to Workspace" })).toBeDisabled();
    expect(screen.queryByRole("radio", { name: "On this device" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Workspace…" }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it("applies a valid name as it is typed, and keeps the old one while it is empty", async () => {
    const user = userEvent.setup();
    const props = renderPage();
    const name = screen.getByRole("textbox", { name: "Name" });

    await user.clear(name);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(within(screen.getByRole("alert")).getByText(/The name stays/)).toBeInTheDocument();

    await user.type(name, "Lab");
    expect(props.onChange).toHaveBeenLastCalledWith({ name: "Lab" });
  });
});
