import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tooltip } from "./tooltip";

function renderTooltip(align?: "center" | "end") {
  render(
    <Tooltip text="Save (Ctrl+S)" position="bottom" align={align}>
      {(bubbleId) => (
        <button type="button" aria-label="Save file" aria-describedby={bubbleId}>
          S
        </button>
      )}
    </Tooltip>,
  );
  const button = screen.getByRole("button", { name: "Save file" });
  return { button, wrapper: button.parentElement as HTMLElement };
}

describe("Tooltip", () => {
  it("links the trigger to the bubble through aria-describedby", () => {
    const { button } = renderTooltip();
    expect(button).toHaveAccessibleDescription("Save (Ctrl+S)");
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Save (Ctrl+S)");
  });

  it("applies the package composition and position attribute", () => {
    const { wrapper } = renderTooltip();
    expect(wrapper).toHaveClass("tooltip");
    expect(wrapper).not.toHaveClass("tooltip-end");
    expect(wrapper).toHaveAttribute("data-tooltip-position", "bottom");
  });

  it("adds the end-aligned variant when align is end", () => {
    const { wrapper } = renderTooltip("end");
    expect(wrapper).toHaveClass("tooltip-end");
  });

  it("closes on click and reopens when the pointer enters again", () => {
    const { wrapper } = renderTooltip();
    expect(wrapper).not.toHaveAttribute("data-state");

    fireEvent.pointerDown(wrapper);
    expect(wrapper).toHaveAttribute("data-state", "closed");

    fireEvent.pointerEnter(wrapper);
    expect(wrapper).not.toHaveAttribute("data-state");
  });

  it("closes on Escape and reopens when focus leaves", () => {
    const { button, wrapper } = renderTooltip();

    fireEvent.keyDown(button, { key: "Escape" });
    expect(wrapper).toHaveAttribute("data-state", "closed");

    fireEvent.blur(button);
    expect(wrapper).not.toHaveAttribute("data-state");
  });
});
