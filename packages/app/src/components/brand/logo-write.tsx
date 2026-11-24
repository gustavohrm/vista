import writeOnLight from "../../../../../assets/motion/logo-write-dark.svg?url";
import writeOnDark from "../../../../../assets/motion/logo-write-light.svg?url";
import { useTheme } from "../../theme/theme-manager";

/** How long the Single stroke entrance plays, as `scripts/build-logo-write.mjs` builds it. */
export const LOGO_WRITE_MS = 2400;

/**
 * The Single stroke entrance file's room around the logo, in logo units, on every side, and the
 * still logo's height in the same units, so the file can be laid over the still logo exactly.
 */
const MARGIN_UNITS = 6;
const LOGO_HEIGHT_UNITS = 78.32;

/**
 * The logo writing itself, the brand's Single stroke entrance, in the artwork for the theme shown.
 * It is laid over a box sized as the still logo `height` pixels tall; the file's margin hangs outside
 * the box, so its last frame sits exactly where the still logo would.
 *
 * @param props - The still logo's height in pixels.
 * @returns The animated logo as an image.
 */
export function LogoWrite({ height }: { height: number }) {
  const { colorScheme } = useTheme();
  const margin = (MARGIN_UNITS / LOGO_HEIGHT_UNITS) * height;
  return (
    <img
      src={colorScheme === "dark" ? writeOnDark : writeOnLight}
      alt=""
      draggable={false}
      style={{ top: -margin, left: -margin, height: height + 2 * margin }}
      className="pointer-events-none absolute w-auto max-w-none"
    />
  );
}
