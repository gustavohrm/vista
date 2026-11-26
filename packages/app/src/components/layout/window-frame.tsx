import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { t } from "../../i18n";
import type { WindowControls } from "../../ports";
import { Tooltip } from "../feedback/tooltip";

// A press on one of these is the control's own; anywhere else on the bar it moves the window.
const INTERACTIVE = "button, a, input, textarea, select, [role], [contenteditable]";

/** Runs a window action from an event handler; a failure is logged, since the user can try again. */
async function run(action: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (err) {
    console.error(`Failed to ${action} the window:`, err);
  }
}

/**
 * The bar's press handler for a window the application draws the frame of: a press on empty bar
 * moves the window, and a double press maximizes or restores it, as on a system title bar.
 *
 * @param controls - The host's window controls; without them the handler does nothing.
 * @returns A `mousedown` handler for the bar.
 */
export function useWindowDrag(controls: WindowControls | undefined) {
  return useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!controls || event.button !== 0 || !(event.target instanceof Element)) {
        return;
      }
      if (event.target.closest(INTERACTIVE)) {
        return;
      }
      if (event.detail === 2) {
        void run("maximize", () => controls.toggleMaximize());
      } else {
        void run("move", () => controls.startDragging());
      }
    },
    [controls],
  );
}

// How long the pointer rests on Maximize before the layouts show, about as long as Windows waits.
const SNAP_LAYOUTS_DELAY_MS = 500;

const BUTTON_CLASS =
  "text-text-muted inline-flex size-7 flex-none cursor-pointer items-center justify-center rounded-md transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]";

/**
 * Minimize, Maximize or Restore, and Close, at the right end of the bar, for a window the
 * application draws the frame of. The same 28px rounded buttons as the title bar's own, with the thin
 * glyphs Windows draws, so they sit in the bar and still read as the window's.
 *
 * @param props - The host's window controls.
 * @returns The three buttons.
 */
export function WindowButtons({ controls }: { controls: WindowControls }) {
  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => controls.watchMaximized(setIsMaximized), [controls]);
  const maximizeLabel = isMaximized ? t("windowFrame.restore") : t("windowFrame.maximize");
  const showSnapLayouts = controls.showSnapLayouts?.bind(controls);
  const snapTimer = useRef<number | null>(null);
  const cancelSnapLayouts = useCallback(() => {
    if (snapTimer.current !== null) {
      window.clearTimeout(snapTimer.current);
      snapTimer.current = null;
    }
  }, []);
  useEffect(() => cancelSnapLayouts, [cancelSnapLayouts]);

  // Resting the mouse on Maximize shows the system's layouts; a touch or pen has no resting pointer.
  function scheduleSnapLayouts(event: PointerEvent) {
    if (!showSnapLayouts || event.pointerType !== "mouse") {
      return;
    }
    cancelSnapLayouts();
    snapTimer.current = window.setTimeout(() => {
      snapTimer.current = null;
      void run("show the layouts for", showSnapLayouts);
    }, SNAP_LAYOUTS_DELAY_MS);
  }

  function maximizeButton(bubbleId: string) {
    return (
      <button
        type="button"
        aria-label={maximizeLabel}
        aria-describedby={bubbleId}
        onClick={() => void run("maximize", () => controls.toggleMaximize())}
        onPointerEnter={scheduleSnapLayouts}
        onPointerLeave={cancelSnapLayouts}
        onPointerDown={cancelSnapLayouts}
        className={`${BUTTON_CLASS} hover:bg-hover hover:text-text`}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" shapeRendering="crispEdges">
          {isMaximized ? (
            <path d="M.5 2.5h7v7h-7zM2.5 2.5v-2h7v7h-2" fill="none" stroke="currentColor" />
          ) : (
            <rect x=".5" y=".5" width="9" height="9" fill="none" stroke="currentColor" />
          )}
        </svg>
      </button>
    );
  }

  return (
    <div className="flex flex-none items-center gap-0.5 pr-2 pl-1">
      <Tooltip text={t("windowFrame.minimize")} position="bottom" className="flex">
        {(bubbleId) => (
          <button
            type="button"
            aria-label={t("windowFrame.minimize")}
            aria-describedby={bubbleId}
            onClick={() => void run("minimize", () => controls.minimize())}
            className={`${BUTTON_CLASS} hover:bg-hover hover:text-text`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" shapeRendering="crispEdges">
              <path d="M0 5.5h10" stroke="currentColor" />
            </svg>
          </button>
        )}
      </Tooltip>
      {/* The tooltip stays where the layouts may show: they open over it, and when Windows shows
          none, because the user turned them off or another window is in front, it still names the
          button. */}
      <Tooltip text={maximizeLabel} position="bottom" className="flex">
        {(bubbleId) => maximizeButton(bubbleId)}
      </Tooltip>
      <Tooltip text={t("common.close")} position="bottom" className="flex">
        {(bubbleId) => (
          <button
            type="button"
            aria-label={t("common.close")}
            aria-describedby={bubbleId}
            onClick={() => void run("close", () => controls.close())}
            className={`${BUTTON_CLASS} hover:bg-window-close hover:text-white`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" strokeLinecap="square" />
            </svg>
          </button>
        )}
      </Tooltip>
    </div>
  );
}
