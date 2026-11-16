import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CsvTableEditor } from "./csv-table-editor";

describe("CsvTableEditor", () => {
  it("writes back the records' line break, not one found inside a quoted cell", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CsvTableEditor content={'"a\r\nb",c\nx,y'} onChange={onChange} />);

    await user.type(screen.getByDisplayValue("y"), "z");

    expect(onChange).toHaveBeenLastCalledWith('"a\r\nb",c\nx,yz');
  });

  it("edits the first record as the header, and shows no row for the final line break", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CsvTableEditor content={"Name,Age\nAda,36\n"} onChange={onChange} />);

    expect(screen.getByRole("textbox", { name: "Column 1 name" })).toHaveValue("Name");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    await user.type(screen.getByRole("textbox", { name: "Age, row 1" }), "5");

    expect(onChange).toHaveBeenLastCalledWith("Name,Age\nAda,365\n");
  });

  it("adds a row under the last one and a column after the last one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<CsvTableEditor content={"Name,Age\nAda,36\n"} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Add row" }));
    expect(onChange).toHaveBeenLastCalledWith("Name,Age\nAda,36\n,\n");
    rerender(<CsvTableEditor content={"Name,Age\nAda,36\n,\n"} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Add column" }));
    expect(onChange).toHaveBeenLastCalledWith("Name,Age,\nAda,36,\n,,\n");
  });

  it("keeps a row added to a one-column file with no final line break once the content comes back", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<CsvTableEditor content={"Name\nAda"} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Add row" }));
    rerender(<CsvTableEditor content={onChange.mock.lastCall?.[0] as string} onChange={onChange} />);

    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("moves a row with Shift and the arrow keys from its number, keeping the header first", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<CsvTableEditor content={"Name\nAda\nBob\n"} onChange={onChange} />);

    screen.getByRole("button", { name: "Move row 1" }).focus();
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(onChange).toHaveBeenLastCalledWith("Name\nBob\nAda\n");
    rerender(<CsvTableEditor content={"Name\nBob\nAda\n"} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Move row 2" })).toHaveFocus();

    onChange.mockClear();
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    screen.getByRole("button", { name: "Move row 1" }).focus();
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(onChange).not.toHaveBeenCalled();
  });
});
