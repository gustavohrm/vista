import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

interface TooltipProps {
  /** Text shown in the bubble. */
  text: string;
  /** Side of the trigger the bubble opens on. */
  position: "top" | "bottom" | "left" | "right";
  /**
   * Horizontal alignment of a `top` or `bottom` bubble. `"end"` lines the bubble up with the
   * trigger's right edge, for controls near the right edge of a header, where a centered bubble
   * would overflow. Defaults to the package's centered bubble.
   */
  align?: "center" | "end";
  /** Extra layout classes for the wrapper, such as `flex` or `flex-none`. */
  className?: string;
  /** Renders the trigger, given the bubble's id for the trigger's `aria-describedby`. */
  children: (bubbleId: string) => ReactNode;
}

/**
 * Wraps a trigger in the `@codenhub/styles` tooltip composition (`.tooltip` with a
 * `.tooltip-bubble`). The package shows the bubble on hover and on `:focus-within`, which also
 * matches after a mouse click, and leaves closing on Escape to the consumer through
 * `data-state="closed"`. This component does both: a click or Escape closes the bubble until the
 * pointer enters again or focus leaves, so a clicked toolbar button doesn't keep its bubble open.
 *
 * @param props - Tooltip properties.
 * @returns The trigger wrapped with its tooltip bubble.
 */
export function Tooltip({ text, position, align = "center", className, children }: TooltipProps) {
  const bubbleId = useId();
  const [isDismissed, setIsDismissed] = useState(false);

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Escape") {
      setIsDismissed(true);
    }
  };

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the handlers only dismiss the bubble; the trigger inside is the interactive element
    <span
      className={`tooltip ${align === "end" ? "tooltip-end" : ""} ${className ?? ""}`}
      data-tooltip-position={position}
      data-state={isDismissed ? "closed" : undefined}
      onPointerDown={() => setIsDismissed(true)}
      onPointerEnter={() => setIsDismissed(false)}
      onBlur={() => setIsDismissed(false)}
      onKeyDown={handleKeyDown}
    >
      {children(bubbleId)}
      <span role="tooltip" id={bubbleId} className="tooltip-bubble">
        {text}
      </span>
    </span>
  );
}
