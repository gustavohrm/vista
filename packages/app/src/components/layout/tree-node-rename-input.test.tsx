import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TreeEntryNameInput } from "./tree-node-rename-input";

function renderInput(overrides?: Partial<Parameters<typeof TreeEntryNameInput>[0]>) {
  const props = {
    level: 0,
    initialValue: "",
    icon: <i aria-hidden="true" />,
    siblingNames: [] as string[],
    onCommit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<TreeEntryNameInput {...props} />);
  return props;
}

describe("TreeEntryNameInput", () => {
  it("starts focused with the initial value selected", () => {
    renderInput({ initialValue: "notes.md" });
    expect(screen.getByRole("textbox", { name: "Entry name" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Entry name" })).toHaveValue("notes.md");
  });

  it("commits a valid name on Enter", async () => {
    const user = userEvent.setup();
    const props = renderInput();

    await user.type(screen.getByRole("textbox", { name: "Entry name" }), "todo.md{Enter}");

    expect(props.onCommit).toHaveBeenCalledWith("todo.md");
  });

  it("commits a valid name on blur", async () => {
    const user = userEvent.setup();
    const props = renderInput();

    await user.type(screen.getByRole("textbox", { name: "Entry name" }), "todo.md");
    await user.tab();

    expect(props.onCommit).toHaveBeenCalledWith("todo.md");
  });

  it("cancels on Escape without committing", async () => {
    const user = userEvent.setup();
    const props = renderInput();

    await user.type(screen.getByRole("textbox", { name: "Entry name" }), "todo.md{Escape}");

    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("shows a validation error and does not commit for an invalid name", async () => {
    const user = userEvent.setup();
    const props = renderInput({ siblingNames: ["todo.md"] });

    await user.type(screen.getByRole("textbox", { name: "Entry name" }), "todo.md{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent('"todo.md" already exists here.');
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("clears a shown error once the user edits the value again", async () => {
    const user = userEvent.setup();
    renderInput({ siblingNames: ["todo.md"] });
    const input = screen.getByRole("textbox", { name: "Entry name" });

    await user.type(input, "todo.md{Enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.type(input, "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
