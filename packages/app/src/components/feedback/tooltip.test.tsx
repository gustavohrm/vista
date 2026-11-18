import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { flipVertically, placeBubble, Tooltip, TOOLTIP_DELAY_MS } from "./tooltip";

function renderTooltip() {
  render(
    <Tooltip text="Save" shortcut="Mod+S" position="bottom">
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

  it("draws the bubble over the page, outside any container that would cut it off", () => {
    renderTooltip();

    expect(screen.getByRole("tooltip", { hidden: true }).parentElement).toBe(document.body);
  });

  it("stays open while the pointer moves from the control onto the bubble", () => {
    const { button, wrapper } = renderTooltip();
    const bubble = screen.getByRole("tooltip", { hidden: true });
    fireEvent.pointerEnter(wrapper);
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));

    fireEvent.pointerOut(button, { relatedTarget: bubble });
    fireEvent.pointerOver(bubble, { relatedTarget: button });

    expect(wrapper).toHaveAttribute("data-tooltip-open");
  });

  it("places an open bubble again when the window is resized", () => {
    const { wrapper } = renderTooltip();
    const bubble = screen.getByRole("tooltip", { hidden: true });
    const root = document.documentElement;
    let viewportWidth = 1000;
    vi.spyOn(root, "clientWidth", "get").mockImplementation(() => viewportWidth);
    vi.spyOn(bubble, "offsetWidth", "get").mockReturnValue(120);
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 868, width: 28, height: 28 }));
    try {
      fireEvent.pointerEnter(wrapper);
      act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
      // Centered below the control, since it fits.
      expect(bubble.style.left).toBe("822px");
      expect(bubble.style.top).toBe("34px");

      viewportWidth = 900;
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      // Now a centered bubble would cross the window's edge, so it lines up with the control's right edge.
      expect(bubble.style.left).toBe("776px");
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("placeBubble", () => {
  const VIEWPORT = 1000;

  it("centers a bubble that fits, even on a control near the edge", () => {
    // A 40px bubble over a 28px button 4px from the left edge still fits centered.
    expect(placeBubble({ left: 20, width: 28 }, 40, VIEWPORT)).toBe(14);
    expect(placeBubble({ left: 940, width: 28 }, 40, VIEWPORT)).toBe(934);
  });

  it("lines a bubble up with the control's edge when a centered one would cross the window's", () => {
    expect(placeBubble({ left: 4, width: 28 }, 120, VIEWPORT)).toBe(4);
    expect(placeBubble({ left: 968, width: 28 }, 120, VIEWPORT)).toBe(876);
  });

  it("keeps a bubble wider than the room beside its control inside the window", () => {
    expect(placeBubble({ left: 600, width: 28 }, 900, VIEWPORT)).toBe(92);
    expect(placeBubble({ left: 300, width: 28 }, 980, VIEWPORT)).toBe(8);
  });
});

describe("flipVertically", () => {
  const VIEWPORT = 800;

  it("keeps the side asked for while the bubble fits there", () => {
    expect(flipVertically("top", { top: 400, bottom: 428 }, 24, VIEWPORT)).toBe("top");
    expect(flipVertically("bottom", { top: 400, bottom: 428 }, 24, VIEWPORT)).toBe("bottom");
  });

  it("opens on the other side when the bubble would cross the window's edge", () => {
    expect(flipVertically("top", { top: 4, bottom: 32 }, 24, VIEWPORT)).toBe("bottom");
    expect(flipVertically("bottom", { top: 768, bottom: 796 }, 24, VIEWPORT)).toBe("top");
  });

  it("keeps the side asked for when the bubble fits on neither", () => {
    expect(flipVertically("top", { top: 4, bottom: 796 }, 24, VIEWPORT)).toBe("top");
  });
});
