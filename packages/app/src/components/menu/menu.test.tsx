import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Menu, MENU_SEPARATOR, type MenuEntry } from "./menu";

const MENU_WIDTH_PX = 160;
const MENU_HEIGHT_PX = 200;
const VIEWPORT_WIDTH_PX = 300;
const VIEWPORT_HEIGHT_PX = 400;

/**
 * Renders a menu as if opened by the given input: a key press, such as Enter on a button or the
 * context menu key, or a pointer press, such as a click or a right click.
 */
function renderMenu(
  overrides: Partial<ComponentProps<typeof Menu>> = {},
  openedWith: "keyboard" | "pointer" = "keyboard",
) {
  if (openedWith === "keyboard") {
    fireEvent.keyDown(document.body, { key: "Enter" });
  } else {
    fireEvent.pointerDown(document.body);
  }
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

  it("shows a chosen option with its icon and a second line, keeping items with the same label apart", () => {
    renderMenu({
      items: [
        {
          id: "w1",
          label: "Notes",
          description: "notes, sources",
          selected: true,
          icon: <i data-testid="notes-icon" />,
          onSelect: vi.fn(),
        },
        { id: "w2", label: "Notes", description: "archive", selected: false, onSelect: vi.fn() },
      ],
    });

    const [chosen, other] = screen.getAllByRole("menuitemradio", { name: "Notes" });
    expect(chosen).toBeChecked();
    expect(chosen).toHaveAccessibleDescription("notes, sources");
    expect(within(chosen as HTMLElement).getByTestId("notes-icon")).toBeInTheDocument();
    expect(other).not.toBeChecked();
    expect(other).toHaveAccessibleDescription("archive");
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

  describe("an item that can be removed", () => {
    function RemovableList({ onClose }: { onClose: () => void }) {
      const [names, setNames] = useState(["Notes", "Work", "Archive"]);
      return (
        <Menu
          label="Workspaces"
          x={10}
          y={20}
          onClose={onClose}
          items={names.map((name) => ({
            label: name,
            onSelect: vi.fn(),
            remove: { label: `Remove "${name}"`, onRemove: () => setNames((all) => all.filter((n) => n !== name)) },
          }))}
        />
      );
    }

    it("removes the highlighted row on Delete, keeping the menu open and the highlight on the next row", async () => {
      const user = userEvent.setup();
      fireEvent.keyDown(document.body, { key: "Enter" });
      const onClose = vi.fn();
      render(<RemovableList onClose={onClose} />);
      const notes = screen.getByRole("menuitem", { name: "Notes" });
      expect(notes).toHaveAttribute("aria-keyshortcuts", "Delete");

      await user.keyboard("{ArrowDown}{Delete}");

      expect(screen.queryByRole("menuitem", { name: "Work" })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
      expect(onClose).not.toHaveBeenCalled();
      await user.keyboard("{Delete}");
      expect(screen.getByRole("menuitem", { name: "Notes" })).toHaveFocus();
    });

    it("removes a row with its X, without choosing the row or closing the menu", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<RemovableList onClose={onClose} />);

      await user.click(screen.getByTitle('Remove "Work"'));

      expect(screen.queryByRole("menuitem", { name: "Work" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Notes", "Archive"]);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("ignores Delete on a row that can't be removed", async () => {
      const user = userEvent.setup();
      const props = renderMenu();

      await user.keyboard("{Delete}");

      expect(screen.getByRole("menuitem", { name: "Cut" })).toHaveFocus();
      expect(props.onClose).not.toHaveBeenCalled();
    });
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

  it("closes on Tab without stopping it, so focus moves on from where it returned", () => {
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    const props = renderMenu();

    const isNotPrevented = fireEvent.keyDown(screen.getByRole("menuitem", { name: "Cut" }), { key: "Tab" });

    expect(isNotPrevented).toBe(true);
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(field).toHaveFocus();
    field.remove();
  });

  describe("highlight", () => {
    it("highlights nothing when opened with the pointer, and the arrow keys start from the first item", async () => {
      const user = userEvent.setup();
      renderMenu({}, "pointer");
      expect(screen.getByRole("menu")).toHaveFocus();

      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("menuitem", { name: "Cut" })).toHaveFocus();
    });

    it("highlights the first item when opened with the keyboard, after an earlier pointer press", () => {
      fireEvent.pointerDown(document.body);
      renderMenu({}, "keyboard");

      expect(screen.getByRole("menuitem", { name: "Cut" })).toHaveFocus();
    });

    it("highlights the item under the pointer, and clears it when the pointer leaves the menu", async () => {
      const user = userEvent.setup();
      renderMenu({}, "pointer");

      fireEvent.pointerMove(screen.getByRole("menuitemcheckbox", { name: "Word Wrap" }));
      expect(screen.getByRole("menuitemcheckbox", { name: "Word Wrap" })).toHaveFocus();

      fireEvent.pointerLeave(screen.getByRole("menu"));
      expect(screen.getByRole("menu")).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("menuitem", { name: "Cut" })).toHaveFocus();
    });

    it("clears the highlight when the pointer moves onto a disabled item", () => {
      renderMenu({}, "pointer");

      fireEvent.pointerMove(screen.getByRole("menuitem", { name: "Cut" }));
      fireEvent.pointerMove(screen.getByRole("menuitem", { name: "Copy" }));

      expect(screen.getByRole("menu")).toHaveFocus();
    });

    it("keeps the highlight the keyboard moved when the pointer leaves", async () => {
      const user = userEvent.setup();
      renderMenu({}, "pointer");

      fireEvent.pointerMove(screen.getByRole("menuitem", { name: "Cut" }));
      await user.keyboard("{ArrowDown}");
      fireEvent.pointerLeave(screen.getByRole("menu"));

      expect(screen.getByRole("menuitemcheckbox", { name: "Word Wrap" })).toHaveFocus();
    });
  });

  it("takes focus itself when every item is disabled, so Escape still closes it", async () => {
    const user = userEvent.setup();
    const props = renderMenu({ items: [{ label: "Copy", disabled: true, onSelect: vi.fn() }] });
    expect(screen.getByRole("menu")).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("closes on a pointer down outside it, but not inside it", async () => {
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole("menu"));
    expect(props.onClose).not.toHaveBeenCalled();

    await user.click(document.body);
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

    it("moves the menu left and up so it does not overflow the right and bottom edges", () => {
      mockMenuSize();
      renderMenu({ x: 290, y: 390 });
      expect(screen.getByRole("menu")).toHaveStyle({ left: "132px", top: "192px" });
    });
  });
});
