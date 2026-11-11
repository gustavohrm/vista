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
});
