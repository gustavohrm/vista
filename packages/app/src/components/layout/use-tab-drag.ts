import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/** How far the pointer moves, in pixels, before a press on a tab becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;
/** How near the row's edge, in pixels, a drag scrolls the row. */
const EDGE_SCROLL_ZONE_PX = 32;
/** How far the row scrolls, in pixels, each frame a drag rests near its edge. */
const EDGE_SCROLL_STEP_PX = 6;
/** How long a tab takes to slide into its place on a drop or back on Escape, in milliseconds. */
export const TAB_SETTLE_MS = 150;

/** A tab being dragged, and how far each tab is moved from its place in the row. */
export interface TabDrag {
  key: string;
  /** Each moved tab's horizontal offset, in pixels, by key. The dragged tab follows the pointer. */
  offsets: Readonly<Record<string, number>>;
  /** Whether the drag has ended and the tabs are sliding into their final places. */
  isSettling: boolean;
}

/** One tab's box as the drag started, in the row's scrolled content. */
interface Slot {
  key: string;
  left: number;
  width: number;
}

/**
 * Lets a tab be dragged to another place in the row with a mouse or pen. The tab follows the
 * pointer along the row, and the tabs it passes slide aside to open the place it will land in. On
 * release it slides into that place and the order changes; Escape slides everything back. The row
 * scrolls while the drag rests near its edge. With reduced motion the tabs move without sliding.
 * Touch is left to the browser, which scrolls the row instead.
 *
 * @param listRef - The row of tabs. Each tab's button carries `data-tab-key`, in the row's order,
 *   inside a box that is the tab's whole width.
 * @param onReorder - Moves a tab to an index in the tab order.
 * @param isReducedMotion - Whether to skip the slide, settling at once.
 * @returns The drag in progress, if any, and the handler that starts one from a tab's pointer down.
 */
export function useTabDrag(
  listRef: RefObject<HTMLElement | null>,
  onReorder: (key: string, toIndex: number) => void,
  isReducedMotion: boolean,
): { drag: TabDrag | null; startDrag: (key: string, event: ReactPointerEvent) => void } {
  const [drag, setDrag] = useState<TabDrag | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const isReducedRef = useRef(isReducedMotion);
  isReducedRef.current = isReducedMotion;

  // A drag still going when the row goes away stops with it.
  useEffect(() => () => stopRef.current?.(), []);

  const startDrag = (key: string, event: ReactPointerEvent) => {
    if (event.button !== 0 || event.pointerType === "touch") {
      return;
    }
    stopRef.current?.();
    const list = listRef.current;
    if (!list) {
      return;
    }
    const startX = event.clientX;
    const startScroll = list.scrollLeft;
    let x = startX;
    let isDragging = false;
    let slots: Slot[] = [];
    let from = -1;
    let target = -1;
    let frame = 0;
    let settleTimer = 0;

    const begin = () => {
      const listLeft = list.getBoundingClientRect().left;
      slots = tabButtons(list).map((tab) => {
        const rect = (tab.parentElement ?? tab).getBoundingClientRect();
        return { key: tab.dataset.tabKey ?? "", left: rect.left - listLeft + list.scrollLeft, width: rect.width };
      });
      from = slots.findIndex((slot) => slot.key === key);
      target = from;
    };

    /** The distance a tab moves to give up or take the dragged tab's place: its width and one gap. */
    const step = () => {
      const dragged = slots[from];
      const next = slots[from + 1] ?? slots[from - 1];
      if (!dragged) {
        return 0;
      }
      const gap = next
        ? next.left > dragged.left
          ? next.left - (dragged.left + dragged.width)
          : dragged.left - (next.left + next.width)
        : 0;
      return dragged.width + gap;
    };

    /** Each other tab's offset with the dragged tab landing at `to`. */
    const siblingOffsets = (to: number) => {
      const offsets: Record<string, number> = {};
      slots.forEach((slot, index) => {
        if (index > from && index <= to) {
          offsets[slot.key] = -step();
        } else if (index < from && index >= to) {
          offsets[slot.key] = step();
        }
      });
      return offsets;
    };

    const update = () => {
      const dragged = slots[from];
      const first = slots[0];
      const last = slots.at(-1);
      if (!dragged || !first || !last) {
        return;
      }
      // Locked to the row: the tab moves from the row's first place to its last, and no further.
      const offset = Math.min(
        Math.max(x - startX + (list.scrollLeft - startScroll), first.left - dragged.left),
        last.left + last.width - (dragged.left + dragged.width),
      );
      const center = dragged.left + offset + dragged.width / 2;
      target = slots.filter((slot, index) => index !== from && slot.left + slot.width / 2 < center).length;
      setDrag({ key, offsets: { ...siblingOffsets(target), [key]: offset }, isSettling: false });
    };

    // Scrolls the row while the pointer rests near either edge, following the tab as the row moves.
    const scrollNearEdge = () => {
      const { left, right } = list.getBoundingClientRect();
      const delta =
        x > right - EDGE_SCROLL_ZONE_PX
          ? EDGE_SCROLL_STEP_PX
          : x < left + EDGE_SCROLL_ZONE_PX
            ? -EDGE_SCROLL_STEP_PX
            : 0;
      const before = list.scrollLeft;
      list.scrollLeft += delta;
      if (list.scrollLeft !== before) {
        update();
      }
      frame = requestAnimationFrame(scrollNearEdge);
    };

    const handleMove = (move: PointerEvent) => {
      x = move.clientX;
      if (!isDragging) {
        if (Math.abs(x - startX) < DRAG_THRESHOLD_PX) {
          return;
        }
        isDragging = true;
        begin();
        frame = requestAnimationFrame(scrollNearEdge);
      }
      update();
    };

    /** Slides the tabs to where `to` puts them, then runs `done` and ends the drag. */
    const settle = (to: number, done: () => void) => {
      detach();
      const dragged = slots[from];
      const landing = slots[to];
      if (isReducedRef.current || !dragged || !landing) {
        done();
        finish();
        return;
      }
      const offset =
        to > from ? landing.left + landing.width - (dragged.left + dragged.width) : landing.left - dragged.left;
      setDrag({ key, offsets: { ...siblingOffsets(to), [key]: offset }, isSettling: true });
      const complete = () => {
        done();
        finish();
      };
      // Another drag, or the row going away, completes this one at once rather than losing the move.
      stopRef.current = complete;
      settleTimer = window.setTimeout(complete, TAB_SETTLE_MS);
    };

    const handleUp = () => {
      if (!isDragging || from < 0) {
        stop();
        return;
      }
      const to = target;
      settle(to, () => {
        if (to !== from) {
          onReorderRef.current(key, to);
        }
      });
    };

    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape" && isDragging) {
        // Escape puts the tab back, and does nothing else meanwhile.
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        settle(from, () => undefined);
      }
    };

    const detach = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", handleKeyDown, true);
    };

    const finish = () => {
      window.clearTimeout(settleTimer);
      stopRef.current = null;
      setDrag(null);
    };

    const stop = () => {
      detach();
      finish();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", handleKeyDown, true);
    stopRef.current = stop;
  };

  return { drag, startDrag };
}

function tabButtons(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>("[data-tab-key]")];
}
