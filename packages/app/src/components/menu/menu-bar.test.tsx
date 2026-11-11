import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Command } from "../../commands";
import { MENU_SEPARATOR } from "./menu";
import { MenuBar, type MenuBarMenu } from "./menu-bar";

const MENUS: MenuBarMenu[] = [
  { label: "File", items: ["file.save", MENU_SEPARATOR, "file.close", "file.missing"] },
  { label: "Edit", items: ["edit.undo"] },
];

function renderMenuBar() {
  const commands: Command[] = [
    { id: "file.save", label: "Save", shortcut: "Mod+S", run: vi.fn() },
    { id: "file.close", label: "Close Tab", isEnabled: false, run: vi.fn() },
    { id: "edit.undo", label: "Undo", shortcutHint: "Mod+Z", run: vi.fn() },
  ];
  render(<MenuBar menus={MENUS} commands={commands} />);
  return commands;
}

describe("MenuBar", () => {
  it("is one Tab stop that moves between menus with the arrow keys", async () => {
    const user = userEvent.setup();
    renderMenuBar();

    await user.tab();
    expect(screen.getByRole("menuitem", { name: "File" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "File" })).toHaveFocus();
  });

  it("opens a menu from its commands, leaving out unknown ids", async () => {
    const user = userEvent.setup();
    renderMenuBar();

    await user.click(screen.getByRole("menuitem", { name: "File" }));

    const menu = screen.getByRole("menu", { name: "File" });
    expect(menu).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Save" })).toHaveAttribute("aria-keyshortcuts", "Control+S");
    expect(screen.getByRole("menuitem", { name: "Close Tab" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByRole("menuitem").filter((item) => menu.contains(item))).toHaveLength(2);
  });

  it("runs a command and returns focus to where it was before the click", async () => {
    const user = userEvent.setup();
    const field = document.createElement("input");
    document.body.append(field);
    const [save] = renderMenuBar();
    field.focus();

    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.click(screen.getByRole("menuitem", { name: "Save" }));

    expect(save?.run).toHaveBeenCalledOnce();
    expect(field).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    field.remove();
  });

  it("moves to the next menu with ArrowRight while one is open, and closes on Escape", async () => {
    const user = userEvent.setup();
    renderMenuBar();

    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu", { name: "File" })).toBeVisible();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menu", { name: "Edit" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Undo" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "File" })).toHaveFocus();
  });
});
