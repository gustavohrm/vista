import { useId } from "react";

/**
 * Vista's logo and loader, drawn inline so they take the theme's colours and can move. The path data
 * matches `assets/logo/mark-light.svg` and `assets/logo/logo-light.svg`. The motion lives in
 * `style.css` under `.vista-logo`, and the brand guideline's Motion section describes it.
 */

const MARK_V =
  "M0.447 4.576A3 3 0 0 1 2.999 0L15.947 0A3 3 0 0 1 18.499 1.424L38.344 33.553A1.5 1.5 0 0 0 40.896 33.553L60.741 1.424A3 3 0 0 1 63.293 0L76.241 0A3 3 0 0 1 78.793 4.576L43.023 62.49A4 4 0 0 1 36.217 62.49Z";
const MARK_BAR =
  "M26.504 3.051A2 2 0 0 1 28.206 0L51.034 0A2 2 0 0 1 52.736 3.051L49.647 8.051A2 2 0 0 1 47.946 9L31.294 9A2 2 0 0 1 29.593 8.051Z";
const LETTERS = [
  "M-13 0L-13 -52.73L-0.9 -52.73L-0.9 0L-13 0ZM-6.95 -60.01Q-10.72 -60.01 -13.11 -62.4Q-15.5 -64.79 -15.5 -68.56Q-15.5 -72.36 -13.11 -74.74Q-10.72 -77.11 -6.95 -77.11Q-3.15 -77.11 -0.77 -74.74Q1.6 -72.36 1.6 -68.56Q1.6 -64.79 -0.77 -62.4Q-3.15 -60.01 -6.95 -60.01Z",
  "M31.5 1.24Q25.63 1.24 20.59 -0.55Q15.55 -2.34 12.16 -6.07Q8.76 -9.8 7.75 -15.69L19.22 -17.94Q19.7 -12.81 22.79 -10.26Q25.89 -7.7 31.1 -7.7Q36.2 -7.7 38.91 -9.95Q41.61 -12.21 41.61 -15.36Q41.61 -18.07 39.59 -19.87Q37.56 -21.67 33.14 -22.4L27.71 -23.35Q24.99 -23.8 21.95 -24.62Q18.9 -25.43 16.23 -26.97Q13.55 -28.52 11.87 -31.17Q10.2 -33.82 10.2 -37.96Q10.2 -43.17 12.96 -46.72Q15.72 -50.28 20.5 -52.13Q25.28 -53.97 31.23 -53.97Q37.04 -53.97 41.66 -52.23Q46.28 -50.49 49.31 -47.17Q52.34 -43.85 53.29 -39.02L41.65 -36.65Q41.31 -39.04 40.24 -40.97Q39.17 -42.89 37.07 -44.02Q34.96 -45.15 31.45 -45.15Q27.4 -45.15 24.77 -43.52Q22.15 -41.88 22.15 -38.85Q22.15 -36.88 23.34 -35.57Q24.53 -34.26 26.72 -33.43Q28.9 -32.61 31.89 -32.03L37.76 -30.93Q41.91 -30.2 45.57 -28.54Q49.23 -26.88 51.51 -23.85Q53.78 -20.81 53.78 -15.86Q53.78 -10.4 50.9 -6.57Q48.02 -2.73 43 -0.75Q37.97 1.24 31.5 1.24Z",
  "M76.71 0Q71.89 0 69.06 -2.55Q66.23 -5.11 66.23 -9.63L66.23 -43.55L58.32 -43.55L58.32 -52.73L66.23 -52.73L66.23 -63.35L78.33 -66.18L78.33 -52.73L88.34 -52.73L88.34 -43.55L78.33 -43.55L78.33 -11.89Q78.33 -10.27 78.79 -9.73Q79.26 -9.19 80.77 -9.19L88.83 -9.19L88.83 0L76.71 0Z",
  "M112.18 1.22Q107.04 1.22 102.93 -0.64Q98.83 -2.51 96.44 -6.04Q94.06 -9.56 94.06 -14.51Q94.06 -19.81 97.15 -23.79Q100.24 -27.77 106.32 -29.98Q112.4 -32.19 121.36 -32.19L129.31 -32.19L128.43 -31.02L128.43 -34Q128.43 -39.66 126.29 -42.53Q124.14 -45.41 119.15 -45.41Q114.39 -45.41 111.85 -42.92Q109.32 -40.44 108.94 -36.04L96.29 -38.43Q96.95 -42.76 99.85 -46.28Q102.75 -49.81 107.78 -51.91Q112.81 -54.01 119.88 -54.01Q126.63 -54.01 131.16 -51.71Q135.68 -49.41 137.96 -44.59Q140.24 -39.77 140.24 -32.18L140.24 -11.89Q140.24 -10.26 140.71 -9.72Q141.17 -9.19 142.69 -9.19L145.29 -9.19L145.29 0L139.01 0Q134.25 0 131.56 -2.56Q128.86 -5.12 128.86 -9.63L128.86 -12.58L130.91 -11.99Q130.21 -9.91 128.89 -7.62Q127.57 -5.34 125.38 -3.33Q123.19 -1.31 119.95 -0.04Q116.7 1.22 112.18 1.22ZM115.47 -7.51Q119.13 -7.51 122.09 -9.25Q125.04 -10.99 126.79 -14.57Q128.53 -18.15 128.53 -23.65L128.53 -24.53L121.57 -24.53Q115.87 -24.53 112.64 -23.03Q109.41 -21.53 108.09 -19.35Q106.77 -17.18 106.77 -15.05Q106.77 -13.19 107.63 -11.46Q108.49 -9.74 110.4 -8.62Q112.31 -7.51 115.47 -7.51Z",
];

/** Places the mark, drawn in its own space, as the logo's V. */
const MARK_T = "translate(-105.635 -67) scale(1.056)";
/** Strokes along the arms, drawn down to the point to reveal the V. Mark space. */
const ARMS = ["M9.47 -8L42 66", "M69.77 -8L37.2 66"];
/**
 * The opening, inset to the bar's gap with its sides parallel to the arms. The bar moves inside it
 * and is never scaled, so its ends keep the arms' angle on every frame. Mark space.
 */
const OPENING = "M12.24 -20L67 -20L39.62 24.3Z";
/** Everything right of the V's right arm, which the letters slide out from behind. Logo space. */
const BEHIND = "M-22.42 -110L400 -110L400 20L-73.2 20L-22.42 -62.17Z";

/** Turns a React id into one that is safe inside `url(#…)`. */
function useSvgId() {
  return `vista${useId().replace(/[^\w-]/g, "")}`;
}

/**
 * The full logo, which plays its entrance once when it mounts: the arms draw down to the point, the
 * bar rises into the opening, and "ista" slides out from behind the right arm. It carries the name
 * "Vista" as visually hidden text, so it can stand in for the name in a heading.
 *
 * @param props - The class that sets the logo's size.
 * @returns Logo element.
 */
export function VistaLogo({ className }: { className?: string }) {
  const id = useSvgId();
  return (
    <>
      <svg
        viewBox="-105.64 -77.1 250.93 78.32"
        aria-hidden="true"
        data-motion="enter"
        className={className ? `vista-logo ${className}` : "vista-logo"}
      >
        <defs>
          <mask id={`${id}-arms`} maskUnits="userSpaceOnUse" x="-20" y="-20" width="120" height="110">
            {ARMS.map((d) => (
              <path key={d} className="vista-logo-arm" d={d} />
            ))}
          </mask>
          <clipPath id={`${id}-opening`}>
            <path d={OPENING} />
          </clipPath>
          <clipPath id={`${id}-behind`}>
            <path d={BEHIND} />
          </clipPath>
        </defs>
        <g transform={MARK_T}>
          <g mask={`url(#${id}-arms)`}>
            <path className="vista-logo-ink" d={MARK_V} />
          </g>
          <g clipPath={`url(#${id}-opening)`}>
            <g className="vista-logo-rise">
              <path className="vista-logo-bar" d={MARK_BAR} />
            </g>
          </g>
        </g>
        <g clipPath={`url(#${id}-behind)`}>
          {LETTERS.map((d) => (
            <g key={d} className="vista-logo-letter">
              <path className="vista-logo-ink" d={d} />
            </g>
          ))}
        </g>
      </svg>
      <span className="visually-hidden">Vista</span>
    </>
  );
}

/**
 * The mark with light rising into its opening until it is the bar, holding, and fading, for a wait
 * that fills an area. It announces `label` as a status, and stays invisible for its first 300 ms, so
 * a short wait shows nothing.
 *
 * @param props - The text announced while it shows, and the class that sets its size.
 * @returns Loader element.
 */
export function VistaLoader({ label, className }: { label: string; className?: string }) {
  const id = useSvgId();
  return (
    <output className={className ? `vista-loader block ${className}` : "vista-loader block"}>
      <svg viewBox="0 0 79.24 64.388" aria-hidden="true" data-motion="loop" className="vista-logo h-full w-full">
        <defs>
          <clipPath id={`${id}-opening`}>
            <path d={OPENING} />
          </clipPath>
        </defs>
        <path className="vista-logo-ink" d={MARK_V} />
        <g clipPath={`url(#${id}-opening)`}>
          <g className="vista-logo-sun">
            <path className="vista-logo-bar" d={MARK_BAR} />
          </g>
        </g>
      </svg>
      <span className="visually-hidden">{label}</span>
    </output>
  );
}
