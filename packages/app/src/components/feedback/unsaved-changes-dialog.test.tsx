import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UnsavedChangesDialog } from "./unsaved-changes-dialog";

describe("UnsavedChangesDialog", () => {
  it("names the document in its title and explains the consequence", () => {
    render(<UnsavedChangesDialog fileNames={["notes.md"]} onChoose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Save changes to notes.md?" })).toBeInTheDocument();
    expect(screen.getByText("Your changes will be lost if you don't save them.")).toBeInTheDocument();
  });

  it("counts the documents in its title and lists them when several have unsaved changes", () => {
    render(<UnsavedChangesDialog fileNames={["a.md", "b.csv"]} onChoose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Save changes to 2 files?" })).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveTextContent("a.mdb.csv");
    expect(screen.getByRole("button", { name: "Save All" })).toBeInTheDocument();
  });

  it("focuses the Save button when it opens", () => {
    render(<UnsavedChangesDialog fileNames={["notes.md"]} onChoose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  });

  it.each([
    ["Save", "save"],
    ["Don't Save", "discard"],
    ["Cancel", "cancel"],
  ] as const)("reports the %s button as the %s choice", async (buttonName, choice) => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<UnsavedChangesDialog fileNames={["notes.md"]} onChoose={onChoose} />);

    await user.click(screen.getByRole("button", { name: buttonName }));

    expect(onChoose).toHaveBeenCalledWith(choice);
  });

  it("reports cancel and prevents the native close when Escape is pressed", () => {
    const onChoose = vi.fn();
    render(<UnsavedChangesDialog fileNames={["notes.md"]} onChoose={onChoose} />);
    const dialog = screen.getByRole("dialog", { name: "Save changes to notes.md?" }) as HTMLDialogElement;

    const cancelEvent = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancelEvent);

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(onChoose).toHaveBeenCalledWith("cancel");
  });

  it("reports cancel when the backdrop is clicked", () => {
    const onChoose = vi.fn();
    render(<UnsavedChangesDialog fileNames={["notes.md"]} onChoose={onChoose} />);
    const dialog = screen.getByRole("dialog", { name: "Save changes to notes.md?" });

    fireEvent.click(dialog);

    expect(onChoose).toHaveBeenCalledWith("cancel");
  });

  it("does not report cancel when a click lands inside the dialog content", () => {
    const onChoose = vi.fn();
    render(<UnsavedChangesDialog fileNames={["notes.md"]} onChoose={onChoose} />);

    fireEvent.click(screen.getByRole("heading", { name: "Save changes to notes.md?" }));

    expect(onChoose).not.toHaveBeenCalled();
  });

  it("closes the native dialog when unmounted", () => {
    const { unmount } = render(<UnsavedChangesDialog fileNames={["notes.md"]} onChoose={vi.fn()} />);
    const dialog = document.querySelector("dialog");
    expect(dialog).toHaveAttribute("open");

    unmount();

    expect(dialog).not.toHaveAttribute("open");
  });
});
