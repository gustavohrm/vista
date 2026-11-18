import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { formatShortcut } from "../../commands/shortcuts";

/** How long the pointer rests on a control before its tooltip shows, in milliseconds. */
export const TOOLTIP_DELAY_MS = 400;
/**
 * How soon after one tooltip hides another shows without the delay, in milliseconds, so sweeping
 * along a row of buttons reads each name at once instead of waiting at every one.
 */
const TOOLTIP_SKIP_DELAY_MS = 300;

/** When the last tooltip hid, shared by every tooltip for the skip-delay window. */
let lastHiddenAt = Number.NEGATIVE_INFINITY;

interface TooltipProps {
  /** Text shown in the bubble. */
  text: string;
  /** A shortcut for the control, in the `Mod+F` notation, shown faint after the text. */
  shortcut?: string;
  /** Side of the trigger the bubble opens on. */
  position: "top" | "bottom" | "left" | "right";
  /** Extra layout classes for the wrapper, such as `flex` or `flex-none`. */
  className?: string;
  /** Renders the trigger, given the bubble's id for the trigger's `aria-describedby`. */
  children: (bubbleId: string) => ReactNode;
}

/**
 * A strip across the gap to the trigger: the bubble keeps the pointer, so it stays while the pointer
 * moves onto it, and the strip keeps it open on the way. The strip covers only the gap, 7px past the
 * bubble's padding to clear its 1px border, never the trigger, so it takes no click meant for the
 * control.
 */
const SIDE_CLASS = {
  top: "before:top-full before:inset-x-0 before:h-[7px]",
  bottom: "before:bottom-full before:inset-x-0 before:h-[7px]",
  left: "before:left-full before:inset-y-0 before:w-[7px]",
  right: "before:right-full before:inset-y-0 before:w-[7px]",
} as const;

/** The gap between the trigger and its bubble, in pixels. */
const BUBBLE_GAP_PX = 6;

/** The least room a bubble keeps from the window's edges, in pixels. */
const VIEWPORT_MARGIN_PX = 8;

/**
 * Where a `top` or `bottom` bubble starts, in viewport pixels. It is centered on the trigger
 * whenever that fits in the window, however close the trigger is to an edge. When it does not fit,
 * it lines up with the trigger's edge on the crowded side, and only a bubble wider than that allows
 * is pushed in from the window's edge.
 *
 * @param trigger - The trigger's left edge and width, in viewport pixels.
 * @param bubbleWidth - The bubble's width.
 * @param viewportWidth - The window's width.
 * @returns The bubble's left edge.
 */
export function placeBubble(
  trigger: { left: number; width: number },
  bubbleWidth: number,
  viewportWidth: number,
): number {
  const min = VIEWPORT_MARGIN_PX;
  const max = viewportWidth - VIEWPORT_MARGIN_PX - bubbleWidth;
  const centered = trigger.left + (trigger.width - bubbleWidth) / 2;
  if (centered >= min && centered <= max) {
    return centered;
  }
  // Flush with the trigger even when the trigger itself sits inside the margin, so the two line up.
  const aligned = centered < min ? trigger.left : trigger.left + trigger.width - bubbleWidth;
  if (aligned >= 0 && aligned <= viewportWidth - bubbleWidth) {
    return aligned;
  }
  return Math.max(min, Math.min(centered, max));
}

/**
 * The side a `top` or `bottom` bubble opens on: the one asked for, unless the bubble would cross the
 * window's edge there and fits on the other side.
 *
 * @param side - The side asked for.
 * @param trigger - The trigger's top and bottom edges, in viewport pixels.
 * @param bubbleHeight - The bubble's height.
 * @param viewportHeight - The window's height.
 * @returns The side it opens on.
 */
export function flipVertically(
  side: "top" | "bottom",
  trigger: { top: number; bottom: number },
  bubbleHeight: number,
  viewportHeight: number,
): "top" | "bottom" {
  const needed = BUBBLE_GAP_PX + bubbleHeight + VIEWPORT_MARGIN_PX;
  const fitsAbove = trigger.top >= needed;
  const fitsBelow = viewportHeight - trigger.bottom >= needed;
  if (side === "top") {
    return !fitsAbove && fitsBelow ? "bottom" : "top";
  }
  return !fitsBelow && fitsAbove ? "top" : "bottom";
}

/**
 * A control's name in a small bubble beside it. It shows after the pointer rests on the control
 * for a moment, or at once when the previous tooltip has just hidden, and at once when keyboard
 * focus reaches the control, so keyboard users see the names of icon-only buttons too. It stays while
 * the pointer is on the bubble. A bubble above or below is centered on the control unless that would
 * cross the window's edge, as `placeBubble` describes. It is drawn over the page, in `document.body`,
 * so a scrolling container around the control, such as Settings' navigation, doesn't cut it off. A click or Escape hides it until the pointer enters again or focus leaves, so a clicked button doesn't keep
 * its bubble. It grows in from the control and is instant with reduced motion. The bubble is always
 * in the document, so the trigger's `aria-describedby` names it whether or not it shows.
 *
 * @param props - Tooltip properties.
 * @returns The trigger wrapped with its bubble.
 */
export function Tooltip({ text, shortcut, position, className, children }: TooltipProps) {
  const bubbleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  // The bubble's place in the window and the point it grows from; measured as it opens, and kept as it
  // closes so it fades out where it was.
  const [placement, setPlacement] = useState<{
    left: number;
    top: number;
    origin: string;
    side: TooltipProps["position"];
  } | null>(null);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const bubble = bubbleRef.current;
    if (!isOpen || !wrapper || !bubble) {
      return undefined;
    }
    const place = () => {
      const trigger = wrapper.getBoundingClientRect();
      // `offsetWidth` and `offsetHeight` ignore the scale the bubble grows from, so they are its settled size.
      const width = bubble.offsetWidth;
      const height = bubble.offsetHeight;
      if (position === "top" || position === "bottom") {
        const left = placeBubble(trigger, width, document.documentElement.clientWidth);
        const side = flipVertically(position, trigger, height, window.innerHeight);
        const top = side === "top" ? trigger.top - BUBBLE_GAP_PX - height : trigger.bottom + BUBBLE_GAP_PX;
        const originX = trigger.left + trigger.width / 2 - left;
        setPlacement({ left, top, side, origin: `${originX}px ${side === "top" ? "100%" : "0"}` });
      } else {
        const left = position === "left" ? trigger.left - BUBBLE_GAP_PX - width : trigger.right + BUBBLE_GAP_PX;
        const top = trigger.top + (trigger.height - height) / 2;
        setPlacement({ left, top, side: position, origin: position === "left" ? "100% 50%" : "0 50%" });
      }
    };
    place();
    // A resized window or a scrolled container can move the control, or narrow the room beside it,
    // while the bubble shows.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [isOpen, position, text, shortcut]);
  const isDismissedRef = useRef(false);
  const timerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const show = () => {
    window.clearTimeout(timerRef.current);
    setIsOpen(true);
  };

  const hide = () => {
    window.clearTimeout(timerRef.current);
    setIsOpen((wasOpen) => {
      if (wasOpen) {
        lastHiddenAt = Date.now();
      }
      return false;
    });
  };

  const handlePointerEnter = () => {
    isDismissedRef.current = false;
    window.clearTimeout(timerRef.current);
    if (Date.now() - lastHiddenAt < TOOLTIP_SKIP_DELAY_MS) {
      show();
    } else {
      timerRef.current = window.setTimeout(show, TOOLTIP_DELAY_MS);
    }
  };

  const handleFocus = (event: FocusEvent<HTMLSpanElement>) => {
    // Focus from a click is not a reason to show the name: the pointer already chose the control.
    if (!isDismissedRef.current && isFocusVisible(event.target)) {
      show();
    }
  };

  const handleBlur = () => {
    isDismissedRef.current = false;
    hide();
  };

  const dismiss = () => {
    isDismissedRef.current = true;
    hide();
  };

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    // A bubble the pointer opened while focus is elsewhere, such as in the editor, gets no key events
    // of its own, and Escape still has to hide it. The key is left to its target as well.
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        isDismissedRef.current = true;
        window.clearTimeout(timerRef.current);
        lastHiddenAt = Date.now();
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [isOpen]);

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Escape") {
      dismiss();
    }
  };

  const side = SIDE_CLASS[placement?.side ?? position];
  // Until it first opens, the hidden bubble waits at the window's corner.
  const bubbleStyle: CSSProperties = placement
    ? { left: placement.left, top: placement.top, transformOrigin: placement.origin }
    : { left: 0, top: 0 };

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the handlers only show and hide the bubble; the trigger inside is the interactive element
    <span
      ref={wrapperRef}
      className={`relative ${className ?? "inline-flex"}`}
      data-tooltip-open={isOpen ? "" : undefined}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={hide}
      onPointerDown={dismiss}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {children(bubbleId)}
      {createPortal(
        <span
          ref={bubbleRef}
          role="tooltip"
          id={bubbleId}
          style={bubbleStyle}
          className={`bg-pop border-line-strong text-text-strong fixed z-50 flex min-h-6 w-max max-w-[min(48rem,calc(100vw-2rem))] items-center gap-2 rounded-md border px-2 py-0.5 text-xs leading-4 font-normal break-all whitespace-normal transition-[opacity,scale,visibility] ease-(--ease-enter) before:absolute before:content-[''] motion-reduce:transition-none ${side} ${
            isOpen ? "visible scale-100 opacity-100 duration-150" : "invisible scale-96 opacity-0 duration-100"
          }`}
        >
          {/* The space keeps the name and shortcut apart when read aloud; the gap does it on screen. */}
          {shortcut ? `${text} ` : text}
          {shortcut && <span className="text-text-faint flex-none">{formatShortcut(shortcut)}</span>}
        </span>,
        document.body,
      )}
    </span>
  );
}

/** Whether focus on the element came from the keyboard, as the browser judges it. */
function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    // An engine without `:focus-visible` cannot tell; showing the name is the safer side.
    return true;
  }
}
