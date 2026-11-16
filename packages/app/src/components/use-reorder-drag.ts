import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/** How far the pointer moves, in pixels, before a press on an item becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;
/** How near the list's edge, in pixels, a drag scrolls the list. */
const EDGE_SCROLL_ZONE_PX = 32;
/** How far the list scrolls, in pixels, each frame a drag rests near its edge. */
const EDGE_SCROLL_STEP_PX = 6;
/** How long an item takes to slide into its place on a drop or back on Escape, in milliseconds. */
export const REORDER_SETTLE_MS = 150;

/** An item being dragged, and how far each item is moved from its place in the list. */
export interface ReorderDrag {
  key: string;
  /** Each moved item's offset along the list, in pixels, by key. The dragged item follows the pointer. */
  offsets: Readonly<Record<string, number>>;
  /** Whether the drag has ended and the items are sliding into their final places. */
  isSettling: boolean;
}

/** How a list lays out its items and marks them. */
export interface ReorderDragOptions {
  /** The direction the list runs: `x` for a row, such as tabs; `y` for a column, such as table rows. */
  axis: "x" | "y";
  /** The attribute each item carries, holding its key, in the list's order, such as `data-tab-key`. */
  itemAttribute: string;
  /** The box that is the item's whole size, when the marked element is inside it. Default: the element. */
  itemBox?: (item: HTMLElement) => Element;
}

/** One item's box as the drag started, in the list's scrolled content, along its axis. */
interface Slot {
  key: string;
  start: number;
  size: number;
}

/**
 * Lets an item be dragged to another place in a list with a mouse or pen. The item follows the
 * pointer along the list, and the items it passes slide aside to open the place it will land in. On
 * release it slides into that place and the order changes; Escape slides everything back. The list
 * scrolls while the drag rests near its edge. With reduced motion the items move without sliding.
 * Touch is left to the browser, which scrolls the list instead.
 *
 * @param listRef - The list, which is also what scrolls. Its items carry `options.itemAttribute`.
 * @param onReorder - Moves an item to an index in the list's order.
 * @param isReducedMotion - Whether to skip the slide, settling at once.
 * @param options - The list's axis and how its items are marked.
 * @returns The drag in progress, if any, and the handler that starts one from an item's pointer down.
 */
export function useReorderDrag(
  listRef: RefObject<HTMLElement | null>,
  onReorder: (key: string, toIndex: number) => void,
  isReducedMotion: boolean,
  options: ReorderDragOptions,
): { drag: ReorderDrag | null; startDrag: (key: string, event: ReactPointerEvent) => void } {
  const [drag, setDrag] = useState<ReorderDrag | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const stopRef = useRef<(() => void) | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const isReducedRef = useRef(isReducedMotion);
  isReducedRef.current = isReducedMotion;

  // A drag still going when the list goes away stops with it.
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
    const { axis, itemAttribute, itemBox = (item: HTMLElement) => item } = optionsRef.current;
    const isRow = axis === "x";
    const pointerAt = (pointer: PointerEvent | ReactPointerEvent) => (isRow ? pointer.clientX : pointer.clientY);
    const scrollOf = () => (isRow ? list.scrollLeft : list.scrollTop);
    const scrollBy = (delta: number) => {
      if (isRow) {
        list.scrollLeft += delta;
      } else {
        list.scrollTop += delta;
      }
    };
    const startOf = (rect: DOMRect) => (isRow ? rect.left : rect.top);
    const endOf = (rect: DOMRect) => (isRow ? rect.right : rect.bottom);

    const startPoint = pointerAt(event);
    const startScroll = scrollOf();
    let point = startPoint;
    let isDragging = false;
    let slots: Slot[] = [];
    let from = -1;
    let target = -1;
    let frame = 0;
    let settleTimer = 0;

    const begin = () => {
      const listStart = startOf(list.getBoundingClientRect());
      slots = [...list.querySelectorAll<HTMLElement>(`[${itemAttribute}]`)].map((item) => {
        const rect = itemBox(item).getBoundingClientRect();
        return {
          key: item.getAttribute(itemAttribute) ?? "",
          start: startOf(rect) - listStart + scrollOf(),
          size: isRow ? rect.width : rect.height,
        };
      });
      from = slots.findIndex((slot) => slot.key === key);
      target = from;
    };

    /** The distance an item moves to give up or take the dragged item's place: its size and one gap. */
    const step = () => {
      const dragged = slots[from];
      const next = slots[from + 1] ?? slots[from - 1];
      if (!dragged) {
        return 0;
      }
      const gap = next
        ? next.start > dragged.start
          ? next.start - (dragged.start + dragged.size)
          : dragged.start - (next.start + next.size)
        : 0;
      return dragged.size + gap;
    };

    /** Each other item's offset with the dragged item landing at `to`. */
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
      // Locked to the list: the item moves from the list's first place to its last, and no further.
      const offset = Math.min(
        Math.max(point - startPoint + (scrollOf() - startScroll), first.start - dragged.start),
        last.start + last.size - (dragged.start + dragged.size),
      );
      const draggedStart = dragged.start + offset;
      const draggedEnd = draggedStart + dragged.size;
      // An item is passed once the dragged item's leading edge reaches its centre. Dragged as far as
      // it goes, the item takes the first or last place even when its size differs from that item's,
      // as a table's last row does by its missing rule.
      target = slots.filter((slot, index) => {
        const slotCenter = slot.start + slot.size / 2;
        return index > from ? slotCenter <= draggedEnd : index < from && slotCenter < draggedStart;
      }).length;
      setDrag({ key, offsets: { ...siblingOffsets(target), [key]: offset }, isSettling: false });
    };

    // Scrolls the list while the pointer rests near either edge, following the item as the list moves.
    const scrollNearEdge = () => {
      const rect = list.getBoundingClientRect();
      const delta =
        point > endOf(rect) - EDGE_SCROLL_ZONE_PX
          ? EDGE_SCROLL_STEP_PX
          : point < startOf(rect) + EDGE_SCROLL_ZONE_PX
            ? -EDGE_SCROLL_STEP_PX
            : 0;
      const before = scrollOf();
      scrollBy(delta);
      if (scrollOf() !== before) {
        update();
      }
      frame = requestAnimationFrame(scrollNearEdge);
    };

    const handleMove = (move: PointerEvent) => {
      point = pointerAt(move);
      if (!isDragging) {
        if (Math.abs(point - startPoint) < DRAG_THRESHOLD_PX) {
          return;
        }
        isDragging = true;
        begin();
        frame = requestAnimationFrame(scrollNearEdge);
      }
      update();
    };

    /** Slides the items to where `to` puts them, then runs `done` and ends the drag. */
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
        to > from ? landing.start + landing.size - (dragged.start + dragged.size) : landing.start - dragged.start;
      setDrag({ key, offsets: { ...siblingOffsets(to), [key]: offset }, isSettling: true });
      const complete = () => {
        done();
        finish();
      };
      // Another drag, or the list going away, completes this one at once rather than losing the move.
      stopRef.current = complete;
      settleTimer = window.setTimeout(complete, REORDER_SETTLE_MS);
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
        // Escape puts the item back, and does nothing else meanwhile.
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
