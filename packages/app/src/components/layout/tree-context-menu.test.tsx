import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TreeContextMenu } from "./tree-context-menu";

const MENU_WIDTH_PX = 160;
const MENU_HEIGHT_PX = 200;
const VIEWPORT_WIDTH_PX = 300;
const VIEWPORT_HEIGHT_PX = 400;

function renderMenu(overrides?: Partial<Parameters<typeof TreeContextMenu>[0]>) {
  const props = {
    x: 10,
    y: 20,
    canCreateChildren: true,
    canRenameOrDelete: true,
    onNewFile: vi.fn(),
    onNewFolder: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<TreeContextMenu {...props} />);
  return props;
}

describe("TreeContextMenu", () => {
  it("shows New File, New Folder, Rename, and Delete for a directory target", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: "New File" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "New Folder" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  });

  it("hides New File and New Folder for a file target", () => {
    renderMenu({ canCreateChildren: false });
    expect(screen.queryByRole("menuitem", { name: "New File" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "New Folder" })).not.toBeInTheDocument();
  });

  it("hides Rename and Delete for the workspace root", () => {
    renderMenu({ canRenameOrDelete: false });
    expect(screen.queryByRole("menuitem", { name: "Rename" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("shows a separator only when both item groups are present", () => {
    renderMenu();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("shows no separator for the workspace root", () => {
    renderMenu({ canRenameOrDelete: false });
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("shows no separator for a file target", () => {
    renderMenu({ canCreateChildren: false });
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("calls the matching callback and closes when an item is clicked", async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole("menuitem", { name: "New File" }));

    expect(props.onNewFile).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("closes on outside click", async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(document.body);

    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("does not close when clicking inside the menu itself, outside any item", async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole("menu"));

    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledOnce();
  });

  describe("viewport clamping", () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    function mockMenuSize() {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        width: MENU_WIDTH_PX,
        height: MENU_HEIGHT_PX,
        top: 0,
        left: 0,
        right: MENU_WIDTH_PX,
        bottom: MENU_HEIGHT_PX,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      window.innerWidth = VIEWPORT_WIDTH_PX;
      window.innerHeight = VIEWPORT_HEIGHT_PX;
    }

    afterEach(() => {
      vi.restoreAllMocks();
      window.innerWidth = originalInnerWidth;
      window.innerHeight = originalInnerHeight;
    });

    it("keeps the requested position when the menu fits in the viewport", () => {
      mockMenuSize();
      renderMenu({ x: 10, y: 20 });
      expect(screen.getByRole("menu")).toHaveStyle({ left: "10px", top: "20px" });
    });

    it("shifts the menu left and up so it does not overflow the right and bottom edges", () => {
      mockMenuSize();
      renderMenu({ x: 290, y: 390 });
      expect(screen.getByRole("menu")).toHaveStyle({ left: "132px", top: "192px" });
    });
  });
});
