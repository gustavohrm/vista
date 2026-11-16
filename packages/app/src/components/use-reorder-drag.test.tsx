import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { useReorderDrag } from "./use-reorder-drag";

function pointer(type: string, pointerId: number, clientX: number) {
  const event = new MouseEvent(type, { clientX, bubbles: true });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

/** A row of 100px items, `a`, `b`, and `c`, touching. */
function setup(dragged = "a") {
  const list = document.createElement("div");
  ["a", "b", "c"].forEach((key, index) => {
    const item = document.createElement("div");
    item.setAttribute("data-key", key);
    item.getBoundingClientRect = () => new DOMRect(index * 100, 0, 100, 30);
    list.append(item);
  });
  list.getBoundingClientRect = () => new DOMRect(0, 0, 300, 30);
  document.body.append(list);
  const onReorder = vi.fn();
  const hook = renderHook(() =>
    useReorderDrag({ current: list }, onReorder, true, { axis: "x", itemAttribute: "data-key" }),
  );
  act(() =>
    hook.result.current.startDrag(dragged, {
      button: 0,
      pointerType: "mouse",
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    } as unknown as ReactPointerEvent),
  );
  return { hook, onReorder };
}

function dragTo(clientX: number) {
  act(() => {
    window.dispatchEvent(pointer("pointermove", 1, clientX));
    window.dispatchEvent(pointer("pointerup", 1, clientX));
  });
}

describe("useReorderDrag", () => {
  it("moves an item to the place whose centre its edge passed, counting from where it started", () => {
    const right = setup("b");
    dragTo(60);
    expect(right.onReorder).toHaveBeenLastCalledWith("b", 2);

    const left = setup("c");
    dragTo(-60);
    expect(left.onReorder).toHaveBeenLastCalledWith("c", 1);
  });

  it("leaves an item in place when it passes no centre", () => {
    const { onReorder } = setup("c");
    dragTo(-10);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("follows only the pointer that started the drag", () => {
    const { hook } = setup();

    act(() => {
      window.dispatchEvent(pointer("pointermove", 2, 40));
    });
    expect(hook.result.current.drag).toBeNull();

    act(() => {
      window.dispatchEvent(pointer("pointermove", 1, 40));
    });
    expect(hook.result.current.drag).not.toBeNull();

    // Another pointer lifting does not end it.
    act(() => {
      window.dispatchEvent(pointer("pointerup", 2, 40));
    });
    expect(hook.result.current.drag).not.toBeNull();
  });
});
