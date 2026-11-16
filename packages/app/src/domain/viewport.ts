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

/**
 * Calls `onChange` each time the viewport crosses the shared `md` breakpoint, with whether it is
 * now at or above it. Does nothing where `matchMedia` isn't available.
 *
 * @returns A function that stops listening.
 */
export function onDesktopViewportChange(onChange: (isDesktop: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const query = window.matchMedia(DESKTOP_BREAKPOINT_QUERY);
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
