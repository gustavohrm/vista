import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Tooltip, TOOLTIP_DELAY_MS } from "./tooltip";

function renderTooltip() {
  render(
    <Tooltip text="Save" shortcut="Mod+S" position="bottom" align="end">
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
  // One fake clock for the whole suite: the skip-delay window is shared by every tooltip, so a
  // clock that restarted per test could put the last hide in the next test's future.
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Lets the skip-delay window of one test run out before the next starts.
    act(() => vi.advanceTimersByTime(1000));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("links the trigger to the bubble, with the shortcut written out", () => {
    const { button } = renderTooltip();
    expect(button).toHaveAccessibleDescription("Save Ctrl + S");
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Save Ctrl + S");
  });

  it("shows after the pointer rests on the control, and hides when it leaves", () => {
    const { wrapper } = renderTooltip();

    fireEvent.pointerEnter(wrapper);
    expect(wrapper).not.toHaveAttribute("data-tooltip-open");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(wrapper).toHaveAttribute("data-tooltip-open");

    fireEvent.pointerLeave(wrapper);
    expect(wrapper).not.toHaveAttribute("data-tooltip-open");
  });

  it("shows at once right after another tooltip hid", () => {
    const { wrapper } = renderTooltip();
    fireEvent.pointerEnter(wrapper);
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    fireEvent.pointerLeave(wrapper);

    fireEvent.pointerEnter(wrapper);

    expect(wrapper).toHaveAttribute("data-tooltip-open");
  });

  it("does not show when the pointer leaves before the delay", () => {
    const { wrapper } = renderTooltip();

    fireEvent.pointerEnter(wrapper);
    fireEvent.pointerLeave(wrapper);
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));

    expect(wrapper).not.toHaveAttribute("data-tooltip-open");
  });

  it("hides on a click and stays hidden until the pointer enters again", () => {
    const { wrapper } = renderTooltip();
    fireEvent.pointerEnter(wrapper);
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));

    fireEvent.pointerDown(wrapper);
    expect(wrapper).not.toHaveAttribute("data-tooltip-open");
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(wrapper).not.toHaveAttribute("data-tooltip-open");
  });

  it("shows on keyboard focus and hides on Escape", () => {
    const { button, wrapper } = renderTooltip();
    vi.spyOn(button, "matches").mockImplementation((selector) => selector === ":focus-visible");

    fireEvent.focus(button);
    expect(wrapper).toHaveAttribute("data-tooltip-open");

    fireEvent.keyDown(button, { key: "Escape" });
    expect(wrapper).not.toHaveAttribute("data-tooltip-open");
  });

  it("does not show after Escape pressed while the pointer rests on the control", () => {
    const { button, wrapper } = renderTooltip();

    fireEvent.pointerEnter(wrapper);
    fireEvent.keyDown(button, { key: "Escape" });
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));

    expect(wrapper).not.toHaveAttribute("data-tooltip-open");
  });

  it("hides on Escape while the pointer shows it and focus is elsewhere, such as in the editor", () => {
    const { wrapper } = renderTooltip();
    fireEvent.pointerEnter(wrapper);
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(wrapper).not.toHaveAttribute("data-tooltip-open");
  });

  it("does not show on focus that came from a click", () => {
    const { button, wrapper } = renderTooltip();
    vi.spyOn(button, "matches").mockReturnValue(false);

    fireEvent.focus(button);

    expect(wrapper).not.toHaveAttribute("data-tooltip-open");
  });
});
