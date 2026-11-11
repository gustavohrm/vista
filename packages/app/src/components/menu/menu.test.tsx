import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Menu, MENU_SEPARATOR, type MenuEntry } from "./menu";

const MENU_WIDTH_PX = 160;
const MENU_HEIGHT_PX = 200;
const VIEWPORT_WIDTH_PX = 300;
const VIEWPORT_HEIGHT_PX = 400;

function renderMenu(overrides: Partial<ComponentProps<typeof Menu>> = {}) {
  const items: MenuEntry[] = [
    { label: "Cut", shortcut: "Mod+X", onSelect: vi.fn() },
    { label: "Copy", disabled: true, onSelect: vi.fn() },
    MENU_SEPARATOR,
    { label: "Word Wrap", checked: true, onSelect: vi.fn() },
  ];
  const props = { label: "Actions", items, x: 10, y: 20, onClose: vi.fn(), ...overrides };
  render(<Menu {...props} />);
  return props;
}

describe("Menu", () => {
  it("shows items, shortcuts, separators, and checkbox items", () => {
    renderMenu();

    expect(screen.getByRole("menuitem", { name: "Cut" })).toHaveAttribute("aria-keyshortcuts", "Control+X");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Word Wrap" })).toBeChecked();
  });

  it("focuses the first item and moves with the arrow keys, skipping disabled items", async () => {
    const user = userEvent.setup();
    renderMenu();
    expect(screen.getByRole("menuitem", { name: "Cut" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemcheckbox", { name: "Word Wrap" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Cut" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitemcheckbox", { name: "Word Wrap" })).toHaveFocus();
  });

  it("returns focus, then runs the chosen item", async () => {
    const user = userEvent.setup();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    let focusedWhenRun: Element | null = null;
    const props = renderMenu({
      items: [{ label: "Paste", onSelect: () => (focusedWhenRun = document.activeElement) }],
    });

    await user.keyboard("{Enter}");

    expect(props.onClose).toHaveBeenCalledOnce();
    expect(focusedWhenRun).toBe(field);
    field.remove();
  });

  it("ignores a disabled item", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const props = renderMenu();
    const copy = props.items[1];

    await user.click(screen.getByRole("menuitem", { name: "Copy" }));

    expect(copy !== MENU_SEPARATOR && copy?.onSelect).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape and returns focus", async () => {
    const user = userEvent.setup();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    const props = renderMenu();

    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledOnce();
    expect(field).toHaveFocus();
    field.remove();
  });

  it("closes on a pointer down outside it, but not inside it", async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole("menu"));
    expect(props.onClose).not.toHaveBeenCalled();

    await user.click(document.body);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("reports ArrowLeft and ArrowRight to a menu bar", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderMenu({ onNavigate });

    await user.keyboard("{ArrowRight}{ArrowLeft}");

    expect(onNavigate.mock.calls).toEqual([[1], [-1]]);
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

    it("moves the menu left and up so it does not overflow the right and bottom edges", () => {
      mockMenuSize();
      renderMenu({ x: 290, y: 390 });
      expect(screen.getByRole("menu")).toHaveStyle({ left: "132px", top: "192px" });
    });
  });
});
