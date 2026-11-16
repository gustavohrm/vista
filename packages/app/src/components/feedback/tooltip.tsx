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
 * Where the bubble opens, and a strip across the gap to the trigger: the bubble keeps the pointer, so
 * it stays while the pointer moves onto it, and the strip keeps it open on the way. The strip covers
 * only the gap, 7px past the bubble's padding to clear its 1px border, never the trigger, so it
 * takes no click meant for the control.
 */
const SIDE_CLASS = {
  top: "bottom-full mb-1.5 before:top-full before:inset-x-0 before:h-[7px]",
  bottom: "top-full mt-1.5 before:bottom-full before:inset-x-0 before:h-[7px]",
  left: "right-full mr-1.5 top-1/2 -translate-y-1/2 origin-right before:left-full before:inset-y-0 before:w-[7px]",
  right: "left-full ml-1.5 top-1/2 -translate-y-1/2 origin-left before:right-full before:inset-y-0 before:w-[7px]",
} as const;

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
 * A control's name in a small bubble beside it. It shows after the pointer rests on the control
 * for a moment, or at once when the previous tooltip has just hidden, and at once when keyboard
 * focus reaches the control, so keyboard users see the names of icon-only buttons too. It stays while
 * the pointer is on the bubble. A bubble above or below is centered on the control unless that would
 * cross the window's edge, as `placeBubble` describes. A click or Escape hides it until the pointer enters again or focus leaves, so a clicked button doesn't keep
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
  const isHorizontal = position === "top" || position === "bottom";
  // The bubble's left edge and the point it grows from, relative to the wrapper; measured as it opens.
  const [placement, setPlacement] = useState<{ left: number; originX: number } | null>(null);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const bubble = bubbleRef.current;
    if (!isOpen || !isHorizontal || !wrapper || !bubble) {
      return;
    }
    const trigger = wrapper.getBoundingClientRect();
    // `offsetWidth` ignores the scale the bubble grows from, so it is the width it settles at.
    const left = placeBubble(trigger, bubble.offsetWidth, document.documentElement.clientWidth) - trigger.left;
    setPlacement({ left, originX: trigger.width / 2 - left });
  }, [isOpen, isHorizontal, text]);
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

  const side = SIDE_CLASS[position];
  // Until it is measured, the bubble is centered on the trigger.
  const bubbleStyle: CSSProperties | undefined = isHorizontal
    ? placement
      ? {
          left: placement.left,
          transformOrigin: `${placement.originX}px ${position === "top" ? "100%" : "0"}`,
        }
      : { left: "50%", translate: "-50% 0", transformOrigin: position === "top" ? "50% 100%" : "50% 0" }
    : undefined;

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
      <span
        ref={bubbleRef}
        role="tooltip"
        id={bubbleId}
        style={bubbleStyle}
        className={`bg-pop border-line-strong text-text-strong shadow-float absolute z-50 flex min-h-6 w-max max-w-[min(48rem,calc(100vw-2rem))] items-center gap-2 rounded-md border px-2 py-0.5 text-xs leading-4 font-normal break-all whitespace-normal transition-[opacity,scale,visibility] ease-(--ease-enter) before:absolute before:content-[''] motion-reduce:transition-none ${side} ${
          isOpen ? "visible scale-100 opacity-100 duration-150" : "invisible scale-96 opacity-0 duration-100"
        }`}
      >
        {/* The space keeps the name and shortcut apart when read aloud; the gap does it on screen. */}
        {shortcut ? `${text} ` : text}
        {shortcut && <span className="text-text-faint flex-none">{formatShortcut(shortcut)}</span>}
      </span>
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
