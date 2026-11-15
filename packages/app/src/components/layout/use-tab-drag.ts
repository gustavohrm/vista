import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/** How far the pointer moves, in pixels, before a press on a tab becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;
/** How near the row's edge, in pixels, a drag scrolls the row. */
const EDGE_SCROLL_ZONE_PX = 32;
/** How far the row scrolls, in pixels, each frame a drag rests near its edge. */
const EDGE_SCROLL_STEP_PX = 6;

/** A tab being dragged, and where the marker shows it will land. */
export interface TabDrag {
  key: string;
  /** The marker's left edge within the row's scrolled content, or null where dropping changes nothing. */
  markerLeft: number | null;
}

interface PendingDrag {
  key: string;
  startX: number;
  x: number;
  isDragging: boolean;
  /** The place between tabs the pointer is over, from 0 before the first tab to the count after the last. */
  slot: number | null;
}

/**
 * Lets a tab be dragged to another place in the row with a mouse or pen. A marker shows where it
 * will land, the row scrolls while the drag rests near its edge, and Escape puts the tab back.
 * Touch is left to the browser, which scrolls the row instead.
 *
 * @param listRef - The row of tabs. Each tab's button carries `data-tab-key`, in the row's order.
 * @param onReorder - Moves a tab to an index in the tab order.
 * @returns The drag in progress, if any, and the handler that starts one from a tab's pointer down.
 */
export function useTabDrag(
  listRef: RefObject<HTMLElement | null>,
  onReorder: (key: string, toIndex: number) => void,
): { drag: TabDrag | null; startDrag: (key: string, event: ReactPointerEvent) => void } {
  const [drag, setDrag] = useState<TabDrag | null>(null);
  const pendingRef = useRef<PendingDrag | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  // A drag still going when the row goes away stops with it.
  useEffect(() => () => stopRef.current?.(), []);

  const startDrag = (key: string, event: ReactPointerEvent) => {
    if (event.button !== 0 || event.pointerType === "touch") {
      return;
    }
    stopRef.current?.();
    const pending: PendingDrag = { key, startX: event.clientX, x: event.clientX, isDragging: false, slot: null };
    pendingRef.current = pending;
    let frame = 0;

    const measure = () => {
      const list = listRef.current;
      if (!list) {
        return;
      }
      const tabs = tabButtons(list);
      // Each tab's button sits in a box with its Close button; the box is the tab's whole width.
      const rects = tabs.map((tab) => (tab.parentElement ?? tab).getBoundingClientRect());
      const slot = rects.filter((rect) => (rect.left + rect.right) / 2 < pending.x).length;
      const from = tabs.findIndex((tab) => tab.dataset.tabKey === key);
      pending.slot = slot;
      setDrag({ key, markerLeft: markerLeftFor(list, rects, slot, from) });
    };

    // Scrolls the row while the pointer rests near either edge, measuring again as tabs pass under it.
    const scrollNearEdge = () => {
      const list = listRef.current;
      if (list) {
        const { left, right } = list.getBoundingClientRect();
        const step =
          pending.x > right - EDGE_SCROLL_ZONE_PX
            ? EDGE_SCROLL_STEP_PX
            : pending.x < left + EDGE_SCROLL_ZONE_PX
              ? -EDGE_SCROLL_STEP_PX
              : 0;
        const before = list.scrollLeft;
        list.scrollLeft += step;
        if (list.scrollLeft !== before) {
          measure();
        }
      }
      frame = requestAnimationFrame(scrollNearEdge);
    };

    const handleMove = (move: PointerEvent) => {
      pending.x = move.clientX;
      if (!pending.isDragging) {
        if (Math.abs(move.clientX - pending.startX) < DRAG_THRESHOLD_PX) {
          return;
        }
        pending.isDragging = true;
        frame = requestAnimationFrame(scrollNearEdge);
      }
      measure();
    };

    const handleUp = () => {
      const { isDragging, slot } = pending;
      stop();
      const list = listRef.current;
      if (!isDragging || slot === null || !list) {
        return;
      }
      const from = tabButtons(list).findIndex((tab) => tab.dataset.tabKey === key);
      // The slots count the dragged tab itself, which leaves its place once it moves.
      const toIndex = slot > from ? slot - 1 : slot;
      if (from >= 0 && toIndex !== from) {
        onReorderRef.current(key, toIndex);
      }
    };

    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape" && pending.isDragging) {
        // Escape puts the tab back, and does nothing else meanwhile.
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        stop();
      }
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", handleKeyDown, true);
      if (pendingRef.current === pending) {
        pendingRef.current = null;
      }
      stopRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", handleKeyDown, true);
    stopRef.current = stop;
  };

  return { drag, startDrag };
}

/**
 * Places the marker in the gap at `slot`, in the row's scrolled content, or returns null when the
 * slot is beside the dragged tab, where dropping leaves the order as it is.
 */
function markerLeftFor(list: HTMLElement, rects: readonly DOMRect[], slot: number, from: number): number | null {
  if (from < 0 || slot === from || slot === from + 1) {
    return null;
  }
  const before = rects[slot - 1];
  const after = rects[slot];
  const x = before && after ? (before.right + after.left) / 2 : after ? after.left - 2 : (before?.right ?? 0) + 2;
  return x - list.getBoundingClientRect().left + list.scrollLeft;
}

function tabButtons(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>("[data-tab-key]")];
}
