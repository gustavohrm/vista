import { motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";

/** How long a shell part takes to come in, in seconds. Leaving takes two thirds of it. */
const ENTER_SECONDS = 0.3;
const EXIT_SECONDS = 0.2;
const EASE_MOVE = [0.4, 0, 0.2, 1] as const;

interface ShellRevealProps {
  /** Which way the part grows: a bar along the top or bottom grows in height, a column in width. */
  axis: "height" | "width";
  children: ReactNode;
}

/**
 * Brings a part of the shell in, or takes it out, by growing or shrinking the room it takes, so the
 * frame beside it moves over to make room instead of jumping. Its content keeps its own size and is
 * uncovered as the room grows. Used inside `AnimatePresence`, which keeps a leaving part until it has
 * closed. With reduced motion the part appears and goes at once.
 *
 * @param props - ShellReveal properties.
 * @returns The part, in a box that animates its size.
 */
export function ShellReveal({ axis, children }: ShellRevealProps) {
  const isReduced = useReducedMotion() ?? false;
  // Clipped only while the size changes: once in, tooltips in the part reach past its edge.
  const [isResizing, setIsResizing] = useState(false);
  const closed = { [axis]: 0, opacity: 0 };
  const open = { [axis]: "auto", opacity: 1 };
  return (
    <motion.div
      initial={closed}
      animate={{ ...open, transition: { duration: isReduced ? 0 : ENTER_SECONDS, ease: EASE_MOVE } }}
      exit={{ ...closed, transition: { duration: isReduced ? 0 : EXIT_SECONDS, ease: EASE_MOVE } }}
      onAnimationStart={() => setIsResizing(true)}
      onAnimationComplete={() => setIsResizing(false)}
      className={`flex flex-none ${isResizing ? "overflow-hidden" : ""} ${axis === "width" ? "flex-row" : "flex-col"}`}
    >
      {children}
    </motion.div>
  );
}
