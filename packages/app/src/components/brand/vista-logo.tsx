/**
 * Vista's logo and loader, drawn inline so they take the theme's colours and can move. The path data
 * is copied from `assets/logo/logo-light.svg` and `assets/logo/mark-light.svg`. The motion lives in
 * `style.css` under `.vista-logo`, and the brand guideline's Motion section describes it.
 */

const LOGO_V =
  "M-105.163 -62.167A3.168 3.168 0 0 1 -102.468 -67L-88.794 -67A3.168 3.168 0 0 1 -86.098 -65.497L-65.14 -31.565A1.584 1.584 0 0 0 -62.445 -31.565L-41.487 -65.497A3.168 3.168 0 0 1 -38.791 -67L-25.117 -67A3.168 3.168 0 0 1 -22.422 -62.167L-60.198 -1.004A4.224 4.224 0 0 1 -67.387 -1.004Z";
const LOGO_BAR =
  "M-77.644 -63.778A2.112 2.112 0 0 1 -75.847 -67L-51.738 -67A2.112 2.112 0 0 1 -49.941 -63.778L-53.203 -58.497A2.112 2.112 0 0 1 -55 -57.495L-72.585 -57.495A2.112 2.112 0 0 1 -74.382 -58.497Z";
const LOGO_WORDMARK =
  "M21.94 0L2.03 -52.73L15.51 -52.73L29.99 -8.15L28.57 -8.15L42.97 -52.73L56.45 -52.73L36.6 0L21.94 0ZM63.47 0L63.47 -52.73L75.57 -52.73L75.57 0L63.47 0ZM69.52 -60.01Q65.75 -60.01 63.36 -62.4Q60.97 -64.79 60.97 -68.56Q60.97 -72.36 63.36 -74.74Q65.75 -77.11 69.52 -77.11Q73.32 -77.11 75.7 -74.74Q78.07 -72.36 78.07 -68.56Q78.07 -64.79 75.7 -62.4Q73.32 -60.01 69.52 -60.01ZM107.97 1.24Q102.1 1.24 97.06 -0.55Q92.02 -2.34 88.63 -6.07Q85.23 -9.8 84.22 -15.69L95.69 -17.94Q96.17 -12.81 99.26 -10.26Q102.36 -7.7 107.57 -7.7Q112.67 -7.7 115.38 -9.95Q118.08 -12.21 118.08 -15.36Q118.08 -18.07 116.06 -19.87Q114.03 -21.67 109.61 -22.4L104.18 -23.35Q101.46 -23.8 98.42 -24.62Q95.37 -25.43 92.7 -26.97Q90.02 -28.52 88.34 -31.17Q86.67 -33.82 86.67 -37.96Q86.67 -43.17 89.43 -46.72Q92.19 -50.28 96.97 -52.13Q101.75 -53.97 107.7 -53.97Q113.51 -53.97 118.13 -52.23Q122.75 -50.49 125.78 -47.17Q128.81 -43.85 129.76 -39.02L118.12 -36.65Q117.78 -39.04 116.71 -40.97Q115.64 -42.89 113.54 -44.02Q111.43 -45.15 107.92 -45.15Q103.87 -45.15 101.24 -43.52Q98.62 -41.88 98.62 -38.85Q98.62 -36.88 99.81 -35.57Q101 -34.26 103.19 -33.43Q105.37 -32.61 108.36 -32.03L114.23 -30.93Q118.38 -30.2 122.04 -28.54Q125.7 -26.88 127.98 -23.85Q130.25 -20.81 130.25 -15.86Q130.25 -10.4 127.37 -6.57Q124.49 -2.73 119.47 -0.75Q114.44 1.24 107.97 1.24ZM153.18 0Q148.36 0 145.53 -2.55Q142.7 -5.11 142.7 -9.63L142.7 -43.55L134.79 -43.55L134.79 -52.73L142.7 -52.73L142.7 -63.35L154.8 -66.18L154.8 -52.73L164.81 -52.73L164.81 -43.55L154.8 -43.55L154.8 -11.89Q154.8 -10.27 155.26 -9.73Q155.73 -9.19 157.24 -9.19L165.3 -9.19L165.3 0L153.18 0ZM188.65 1.22Q183.51 1.22 179.4 -0.64Q175.3 -2.51 172.91 -6.04Q170.53 -9.56 170.53 -14.51Q170.53 -19.81 173.62 -23.79Q176.71 -27.77 182.79 -29.98Q188.87 -32.19 197.83 -32.19L205.78 -32.19L204.9 -31.02L204.9 -34Q204.9 -39.66 202.76 -42.53Q200.61 -45.41 195.62 -45.41Q190.86 -45.41 188.32 -42.92Q185.79 -40.44 185.41 -36.04L172.76 -38.43Q173.42 -42.76 176.32 -46.28Q179.22 -49.81 184.25 -51.91Q189.28 -54.01 196.35 -54.01Q203.1 -54.01 207.63 -51.71Q212.15 -49.41 214.43 -44.59Q216.71 -39.77 216.71 -32.18L216.71 -11.89Q216.71 -10.26 217.18 -9.72Q217.64 -9.19 219.16 -9.19L221.76 -9.19L221.76 0L215.48 0Q210.72 0 208.03 -2.56Q205.33 -5.12 205.33 -9.63L205.33 -12.58L207.38 -11.99Q206.68 -9.91 205.36 -7.62Q204.04 -5.34 201.85 -3.33Q199.66 -1.31 196.42 -0.04Q193.17 1.22 188.65 1.22ZM191.94 -7.51Q195.6 -7.51 198.56 -9.25Q201.51 -10.99 203.26 -14.57Q205 -18.15 205 -23.65L205 -24.53L198.04 -24.53Q192.34 -24.53 189.11 -23.03Q185.88 -21.53 184.56 -19.35Q183.24 -17.18 183.24 -15.05Q183.24 -13.19 184.1 -11.46Q184.96 -9.74 186.87 -8.62Q188.78 -7.51 191.94 -7.51Z";

const MARK_V =
  "M0.447 4.576A3 3 0 0 1 2.999 0L15.947 0A3 3 0 0 1 18.499 1.424L38.344 33.553A1.5 1.5 0 0 0 40.896 33.553L60.741 1.424A3 3 0 0 1 63.293 0L76.241 0A3 3 0 0 1 78.793 4.576L43.023 62.49A4 4 0 0 1 36.217 62.49Z";
const MARK_BAR =
  "M26.504 3.051A2 2 0 0 1 28.206 0L51.034 0A2 2 0 0 1 52.736 3.051L49.647 8.051A2 2 0 0 1 47.946 9L31.294 9A2 2 0 0 1 29.593 8.051Z";

/**
 * The full logo, which plays its entrance once when it mounts. It carries the name "Vista" as
 * visually hidden text, so it can stand in for the name in a heading.
 *
 * @param props - The class that sets the logo's size.
 * @returns Logo element.
 */
export function VistaLogo({ className }: { className?: string }) {
  return (
    <>
      <svg
        viewBox="-105.64 -77.1 327.42 78.32"
        aria-hidden="true"
        data-motion="enter"
        className={className ? `vista-logo ${className}` : "vista-logo"}
      >
        <path className="vista-logo-v" d={LOGO_V} />
        <path className="vista-logo-bar" d={LOGO_BAR} />
        <path className="vista-logo-word" d={LOGO_WORDMARK} />
      </svg>
      <span className="visually-hidden">Vista</span>
    </>
  );
}

/**
 * The mark with its bar sweeping through the opening, for a wait that fills an area. It announces
 * `label` as a status, and stays invisible for its first 300 ms, so a short wait shows nothing.
 *
 * @param props - The text announced while it shows, and the class that sets its size.
 * @returns Loader element.
 */
export function VistaLoader({ label, className }: { label: string; className?: string }) {
  return (
    <output className={className ? `vista-loader block ${className}` : "vista-loader block"}>
      <svg viewBox="0 0 79.24 64.388" aria-hidden="true" data-motion="loop" className="vista-logo h-full w-full">
        <path className="vista-logo-v" d={MARK_V} />
        <path className="vista-logo-bar" d={MARK_BAR} />
      </svg>
      <span className="visually-hidden">{label}</span>
    </output>
  );
}
