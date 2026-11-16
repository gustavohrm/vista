import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";

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
  /**
   * Horizontal alignment of a `top` or `bottom` bubble. `"end"` lines the bubble up with the
   * trigger's right edge and `"start"` with its left edge, for controls near an edge of the
   * window, where a centered bubble would overflow. Defaults to centered.
   */
  align?: "center" | "start" | "end";
  /** Extra layout classes for the wrapper, such as `flex` or `flex-none`. */
  className?: string;
  /** Renders the trigger, given the bubble's id for the trigger's `aria-describedby`. */
  children: (bubbleId: string) => ReactNode;
}

const SIDE_CLASS = {
  top: "bottom-full mb-1.5",
  bottom: "top-full mt-1.5",
  left: "right-full mr-1.5 top-1/2 -translate-y-1/2 origin-right",
  right: "left-full ml-1.5 top-1/2 -translate-y-1/2 origin-left",
} as const;

const ALIGN_CLASS = {
  center: "left-1/2 -translate-x-1/2",
  start: "left-0",
  end: "right-0",
} as const;

const ORIGIN_CLASS = {
  top: { center: "origin-bottom", start: "origin-bottom-left", end: "origin-bottom-right" },
  bottom: { center: "origin-top", start: "origin-top-left", end: "origin-top-right" },
} as const;

/**
 * A control's name in a small bubble beside it. It shows after the pointer rests on the control
 * for a moment, or at once when the previous tooltip has just hidden, and at once when keyboard
 * focus reaches the control, so keyboard users see the names of icon-only buttons too. A click or
 * Escape hides it until the pointer enters again or focus leaves, so a clicked button doesn't keep
 * its bubble. It grows in from the control and is instant with reduced motion. The bubble is always
 * in the document, so the trigger's `aria-describedby` names it whether or not it shows.
 *
 * @param props - Tooltip properties.
 * @returns The trigger wrapped with its bubble.
 */
export function Tooltip({ text, shortcut, position, align = "center", className, children }: TooltipProps) {
  const bubbleId = useId();
  const [isOpen, setIsOpen] = useState(false);
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

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Escape" && isOpen) {
      dismiss();
    }
  };

  const side = SIDE_CLASS[position];
  const placement =
    position === "top" || position === "bottom" ? `${ALIGN_CLASS[align]} ${ORIGIN_CLASS[position][align]}` : "";

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the handlers only show and hide the bubble; the trigger inside is the interactive element
    <span
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
        role="tooltip"
        id={bubbleId}
        className={`bg-frame border-line-strong text-text-strong pointer-events-none absolute z-50 flex min-h-6 w-max max-w-[min(48rem,calc(100vw-2rem))] items-center gap-2 rounded-md border px-2 py-0.5 text-xs leading-4 font-normal break-all whitespace-normal shadow-[0_2px_8px_rgb(0_0_0/0.12)] transition-[opacity,scale,visibility] ease-(--ease-enter) motion-reduce:transition-none ${side} ${placement} ${
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
