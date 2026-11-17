import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WindowControls } from "../../ports";
import { useWindowDrag, WindowButtons } from "./window-frame";

function createControls() {
  let report: (isMaximized: boolean) => void = () => {};
  const controls = {
    minimize: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    startDragging: vi.fn(async () => {}),
    watchMaximized: vi.fn((listener: (isMaximized: boolean) => void) => {
      report = listener;
      return () => {};
    }),
  } satisfies WindowControls;
  return { controls, setMaximized: (isMaximized: boolean) => act(() => report(isMaximized)) };
}

function DragBar({ controls }: { controls: WindowControls }) {
  const onMouseDown = useWindowDrag(controls);
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- stands in for the app's title bar row
    <div data-testid="bar" onMouseDown={onMouseDown}>
      <button type="button">Go to file</button>
    </div>
  );
}

describe("WindowButtons", () => {
  it("minimizes, maximizes, and asks to close the window", async () => {
    const user = userEvent.setup();
    const { controls } = createControls();
    render(<WindowButtons controls={controls} />);

    await user.click(screen.getByRole("button", { name: "Minimize" }));
    await user.click(screen.getByRole("button", { name: "Maximize" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(controls.minimize).toHaveBeenCalledOnce();
    expect(controls.toggleMaximize).toHaveBeenCalledOnce();
    expect(controls.close).toHaveBeenCalledOnce();
  });

  it("offers Restore while the window is maximized", () => {
    const { controls, setMaximized } = createControls();
    render(<WindowButtons controls={controls} />);

    setMaximized(true);
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();

    setMaximized(false);
    expect(screen.getByRole("button", { name: "Maximize" })).toBeInTheDocument();
  });
});

describe("WindowButtons snap layouts", () => {
  function renderWithLayouts() {
    vi.useFakeTimers();
    const { controls } = createControls();
    const showSnapLayouts = vi.fn(async () => {});
    render(<WindowButtons controls={{ ...controls, showSnapLayouts }} />);
    return { showSnapLayouts, maximize: screen.getByRole("button", { name: "Maximize" }) };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the layouts once the mouse rests on Maximize", () => {
    const { showSnapLayouts, maximize } = renderWithLayouts();

    fireEvent.pointerEnter(maximize, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(499));
    expect(showSnapLayouts).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    expect(showSnapLayouts).toHaveBeenCalledOnce();
  });

  it("does not show them when the mouse leaves or presses first, or for a touch", () => {
    const { showSnapLayouts, maximize } = renderWithLayouts();

    fireEvent.pointerEnter(maximize, { pointerType: "mouse" });
    fireEvent.pointerLeave(maximize, { pointerType: "mouse" });
    fireEvent.pointerEnter(maximize, { pointerType: "mouse" });
    fireEvent.pointerDown(maximize, { pointerType: "mouse" });
    fireEvent.pointerEnter(maximize, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(1000));

    expect(showSnapLayouts).not.toHaveBeenCalled();
  });
});

describe("useWindowDrag", () => {
  it("moves the window from a press on empty bar, and maximizes it on a double press", () => {
    const { controls } = createControls();
    render(<DragBar controls={controls} />);

    fireEvent.mouseDown(screen.getByTestId("bar"), { button: 0, detail: 1 });
    expect(controls.startDragging).toHaveBeenCalledOnce();

    fireEvent.mouseDown(screen.getByTestId("bar"), { button: 0, detail: 2 });
    expect(controls.toggleMaximize).toHaveBeenCalledOnce();
  });

  it("leaves presses on the bar's controls and with other buttons alone", () => {
    const { controls } = createControls();
    render(<DragBar controls={controls} />);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Go to file" }), { button: 0, detail: 1 });
    fireEvent.mouseDown(screen.getByTestId("bar"), { button: 2, detail: 1 });

    expect(controls.startDragging).not.toHaveBeenCalled();
    expect(controls.toggleMaximize).not.toHaveBeenCalled();
  });
});
