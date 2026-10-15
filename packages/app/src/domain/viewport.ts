/** The `md` breakpoint Tailwind and the shared layout switch behavior at, in a `min-width` media query. */
const DESKTOP_BREAKPOINT_QUERY = "(min-width: 768px)";

/**
 * Reports whether the current viewport is at or above the shared `md` breakpoint.
 * Returns `false` outside a browser environment, or where `matchMedia` isn't available
 * (such as some test environments), rather than throwing.
 *
 * @returns True if the viewport matches the `md` breakpoint or wider.
 */
export function isDesktopViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(DESKTOP_BREAKPOINT_QUERY).matches;
}
