#!/usr/bin/env node
// Builds the Single stroke entrance, `assets/motion/logo-write-*.svg`, from the still logos.
//
// The animated files are not written by hand, because their numbers depend on each other: the dash
// lengths are the measured lengths of the stroke's path, and each letter's keyframes are the moments
// the stroke reaches and leaves it at the writing speed. Change the path or a time here, or a still
// logo, and run this again. The brand guideline's Motion section describes the result.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The artwork tones: `assets/logo/logo-<tone>.svg` gives `assets/motion/logo-write-<tone>.svg`. */
export const TONES = ["dark", "light"];

// The stroke's path, in the logo's units. It leaves the centre of the bar, writes each letter, turns
// past the `a`, and returns along the horizon line to the centre of the bar. Each part runs from where
// the stroke sets off toward it to where it leaves it, and reveals its letter alone: with one reveal
// for all four, the part writing the `t` also uncovered the edge of the `a`.
//
// A reveal is twice as wide as the stroke, so where the stroke passes close to, or across, a piece of
// its letter that it writes later, the reveal uncovered that piece early. Such a letter is two parts,
// the first clipped so it cannot reach that piece. The `t`'s upstroke crossed, and its stem ran beside,
// the ends of the crossbar, so its first part leaves out the crossbar's band beside the stem, with
// three quarters of a unit to spare above and below, or the crossbar's soft edges show as hairlines.
// The `a` is one outline, its bowl included, and the reveal around the arch's tip and the stem
// uncovered the bowl, so its body leaves out the bowl's region and its bowl keeps to it. That region
// is left of the stem's inner edge and below the arch's tip, and reaches a unit into the stem, which is
// already written, so where the two parts meet inside the ink their soft edges leave no seam.
const STROKE_START = "M-63.79 -62.25";
/** @type {{ letter: string, d: string, clip?: string }[]} */
const STROKE_LETTERS = [
  { letter: "i", d: "C-42.47 -62.25 -24.47 -74 -10.47 -71L-3.47 -66C-6.47 -62 -6.95 -58 -6.95 -52L-6.95 -1" },
  {
    letter: "s",
    d: "C-6.95 8 7.53 -6 13.43 -16.8C15.03 -8 21.53 -3.2 31.33 -3.2C39.53 -3.2 47.83 -7.5 47.83 -15.6C47.83 -23 40.53 -25.6 31.53 -27.2C24.53 -28.5 16.13 -30 16.13 -38.4C16.13 -45 22.53 -49.5 31.23 -49.5C38.53 -49.5 45.53 -46 47.53 -37.8",
  },
  {
    letter: "t",
    d: "C50.53 -50 63.53 -66 72.28 -68L72.28 -14C72.28 -7 75.03 -4.6 80.53 -4.6L89.53 -4.6",
    clip: "M40 -80L100 -80L100 -53.5L78.33 -53.5L78.33 -42.8L100 -42.8L100 5L40 5L40 -42.8L66.23 -42.8L66.23 -53.5L40 -53.5Z",
  },
  { letter: "t", d: "C81.53 -20 59.53 -38 56.53 -48.1L89.53 -48.1" },
  {
    letter: "a",
    d: "C95.53 -46 99.53 -41 102.53 -37.2C104.53 -45 111.53 -49.7 119.53 -49.7C129.03 -49.7 134.33 -43.5 134.33 -33L134.33 -12C134.33 -6.5 136.53 -4.6 140.53 -4.6L146.03 -4.6",
    clip: "M80 -80L150 -80L150 5L128.43 5L128.43 -33L80 -33Z",
  },
  {
    letter: "a",
    d: "C137.53 -4.6 137.53 -28.4 134.33 -28.4L121.53 -28.4C109.53 -28.4 100.43 -23 100.43 -14.5C100.43 -6.5 106.53 -3.1 114.03 -3.1C122.53 -3.1 129.53 -9 132.03 -16",
    clip: "M90 -33L129.43 -33L129.43 5L90 5Z",
  },
];
const STROKE_RETURN = "C137.53 -34 155.53 -62.25 128.53 -62.25L-77.64 -62.25";

// Times, in milliseconds, as the brand guideline's Single stroke table gives them.
const DURATION = 2400;
const LEAVES = 320;
const WRITES_TO = 1560;
const DOCKS = 1960;
// The stroke speeds up over its first 34 units, until 460 ms, and writes at one speed from there.
const WRITES_FROM = 460;
const LAUNCH_LENGTH = 34;

const STROKE_WIDTH = 9.5;
const STROKE_LENGTH = 27.7;
const REVEAL_WIDTH = 19;
// How far a letter's reveal trails the stroke's front, so ink appears under the stroke, not ahead of it.
const REVEAL_LAG = 9.5;

// Room around the still logo, in its units, on every side: the V rises 6 units into place and dips
// with the bar, and the stroke's round turn past the `a` reaches 5.49 units beyond it, so the still's
// own box would cut them off.
const MARGIN = 6;
// The masks' region, which holds the logo and the whole stroke.
const MASK_BOX = 'x="-120" y="-120" width="400" height="240"';

const CURVE_STEPS = 4096;

/** @typedef {[number, number]} Point */

/**
 * Measures a path made of `M`, `L`, and `C` commands with absolute coordinates.
 *
 * @param {string} d - Path data.
 * @param {Point} [from] - The point the path continues from, when it does not start with `M`.
 * @returns {{ length: number, end: Point }} The path's length and the point it ends on.
 * @throws {Error} When a command does not have the coordinates it needs.
 */
export function measurePath(d, from = [0, 0]) {
  let [x, y] = from;
  let length = 0;
  for (const [, command, args = ""] of d.matchAll(/([MLC])([^MLC]*)/g)) {
    const values = args.trim().split(/\s+/).map(Number);
    if (values.length !== (command === "C" ? 6 : 2) || values.some(Number.isNaN)) {
      throw new Error(`Cannot read the path command "${command}${args}".`);
    }
    if (command === "C") {
      const [x1, y1, x2, y2, x3, y3] = /** @type {[number, number, number, number, number, number]} */ (values);
      let previousX = x;
      let previousY = y;
      for (let step = 1; step <= CURVE_STEPS; step++) {
        const t = step / CURVE_STEPS;
        const u = 1 - t;
        const nextX = u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
        const nextY = u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
        length += Math.hypot(nextX - previousX, nextY - previousY);
        previousX = nextX;
        previousY = nextY;
      }
      x = x3;
      y = y3;
    } else {
      const [nextX, nextY] = /** @type {Point} */ (values);
      if (command === "L") {
        length += Math.hypot(nextX - x, nextY - y);
      }
      x = nextX;
      y = nextY;
    }
  }
  return { length, end: [x, y] };
}

/** @type {(value: number) => string} */
const round = (value) => String(Number(value.toFixed(2)));

/** @type {(ms: number) => string} */
const percent = (ms) => `${round((ms / DURATION) * 100)}%`;

/**
 * Reads the still logo: its box, and its three paths, the V, the bar, and the letters.
 *
 * @param {string} still - The still logo's SVG text.
 * @returns {{ box: [number, number, number, number], ink: string, daylight: string, v: string, bar: string, glyphs: Record<string, string> }}
 *   The box, the two colours, and the path data, with the letters split into one glyph each.
 * @throws {Error} When the file is not shaped like the still logo.
 */
function readStill(still) {
  const box =
    still
      .match(/viewBox="([^"]+)"/)?.[1]
      ?.split(/\s+/)
      .map(Number) ?? [];
  const paths = [...still.matchAll(/<path fill="([^"]+)" d="([^"]+)"/g)];
  const [v, bar, letters] = paths;
  // The letters are one path of six shapes: the i's stem and dot, the s, the t, and the a's body and bowl.
  const shapes = letters?.[2]?.match(/M[^M]*/g) ?? [];
  const [stem, dot, s, t, body, bowl] = shapes;
  if (box.length !== 4 || box.some(Number.isNaN) || paths.length !== 3 || shapes.length !== 6) {
    throw new Error("The still logo must have a viewBox and three paths: the V, the bar, and the six shapes of ista.");
  }
  return {
    box: /** @type {[number, number, number, number]} */ (box),
    ink: `${v?.[1]}`,
    daylight: `${bar?.[1]}`,
    v: `${v?.[2]}`,
    bar: `${bar?.[2]}`,
    glyphs: { i: `${stem}${dot}`, s: `${s}`, t: `${t}`, a: `${body}${bowl}` },
  };
}

/**
 * Builds the Single stroke entrance that ends on a still logo.
 *
 * @param {string} still - The SVG text of `assets/logo/logo-dark.svg` or `logo-light.svg`.
 * @returns {string} The SVG text of the animated file, in the still's colours.
 * @throws {Error} When the file is not shaped like the still logo.
 */
export function buildLogoWrite(still) {
  const { box, ink, daylight, v, bar, glyphs } = readStill(still);
  const stroke = STROKE_START + STROKE_LETTERS.map((part) => part.d).join("") + STROKE_RETURN;
  const total = measurePath(stroke).length;
  const written = measurePath(STROKE_START + STROKE_LETTERS.map((part) => part.d).join("")).length;

  // Units per millisecond while writing, and the moment the stroke's front is a length along its path.
  const speed = (written - LAUNCH_LENGTH) / (WRITES_TO - WRITES_FROM);
  /** @type {(length: number) => number} */
  const frontAt = (length) => WRITES_FROM + (length - LAUNCH_LENGTH) / speed;
  // The launch ends, and the return starts, at the writing speed, so the stroke never jumps or stalls.
  const launch = `cubic-bezier(.5,0,.8,${round(1 - ((speed * (WRITES_FROM - LEAVES)) / LAUNCH_LENGTH) * 0.2)})`;
  const back = `cubic-bezier(0.4,${round(((speed * (DOCKS - WRITES_TO)) / (total - written)) * 0.4)},.4,1)`;

  let reveals = "";
  let clips = "";
  /** @type {Record<string, string>} */
  const parts = {};
  let before = 0;
  let from = measurePath(STROKE_START).end;
  for (const [index, { letter, d, clip }] of STROKE_LETTERS.entries()) {
    const name = `r${index}`;
    const { length, end } = measurePath(d, from);
    const hidden = round(length + REVEAL_LAG);
    // The first part starts with the stroke, on its launch curve; the others start when the stroke
    // reaches them, already at the writing speed.
    const starts =
      before === 0
        ? `${percent(LEAVES)}{stroke-dashoffset:${hidden};animation-timing-function:${launch}}${percent(WRITES_FROM)}{stroke-dashoffset:${round(length + REVEAL_LAG - LAUNCH_LENGTH)};animation-timing-function:linear}`
        : `${percent(frontAt(before))}{stroke-dashoffset:${hidden};animation-timing-function:linear}`;
    reveals += `.${name}{stroke-dasharray:${round(length)} 999;animation:${name} ${DURATION}ms both}@keyframes ${name}{0%{stroke-dashoffset:${hidden};animation-timing-function:linear}${starts}${percent(frontAt(before + length + REVEAL_LAG))}{stroke-dashoffset:0}100%{stroke-dashoffset:0}}`;
    if (clip) {
      clips += `<clipPath id="c${index}"><path d="${clip}"/></clipPath>`;
    }
    parts[letter] =
      `${parts[letter] ?? ""}<path class="${name}" d="M${from.join(" ")}${d}"${clip ? ` clip-path="url(#c${index})"` : ""} fill="none" stroke="#fff" stroke-width="${REVEAL_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`;
    before += length;
    from = end;
  }

  let masks = clips;
  let letters = "";
  for (const [letter, reveal] of Object.entries(parts)) {
    masks += `<mask id="${letter}" maskUnits="userSpaceOnUse" ${MASK_BOX}>${reveal}<rect class="full" ${MASK_BOX} fill="#fff"/></mask>`;
    letters += `<g mask="url(#${letter})"><path fill="${ink}" d="${glyphs[letter]}"/></g>`;
  }

  const style =
    `.v{animation:rise 420ms cubic-bezier(0.2,0,0,1) both}@keyframes rise{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:none}}` +
    // The bar replaces the stroke as it docks, and the bar and the V dip 1.5 units and return.
    `.dip{animation:dip ${DURATION}ms both}@keyframes dip{0%{transform:none}${percent(DOCKS)}{transform:none;animation-timing-function:cubic-bezier(.3,0,.2,1)}${percent(DOCKS + 100)}{transform:translateY(1.5px);animation-timing-function:cubic-bezier(0.2,0,0,1)}${percent(DOCKS + 340)}{transform:none}100%{transform:none}}` +
    `.bar{animation:bar ${DURATION}ms both}@keyframes bar{0%{opacity:0}${percent(DOCKS - 20)}{opacity:0}${percent(DOCKS + 60)}{opacity:1}100%{opacity:1}}` +
    `.pen{stroke-dasharray:${STROKE_LENGTH} 2000;animation:pen ${DURATION}ms both}@keyframes pen{0%{stroke-dashoffset:${STROKE_LENGTH};animation-timing-function:linear}${percent(LEAVES)}{stroke-dashoffset:${STROKE_LENGTH};animation-timing-function:${launch}}${percent(WRITES_FROM)}{stroke-dashoffset:${round(STROKE_LENGTH - LAUNCH_LENGTH)};animation-timing-function:linear}${percent(WRITES_TO)}{stroke-dashoffset:${round(STROKE_LENGTH - written)};animation-timing-function:${back}}${percent(DOCKS)}{stroke-dashoffset:${round(STROKE_LENGTH - total)};animation-timing-function:linear}100%{stroke-dashoffset:${round(STROKE_LENGTH - total)}}}` +
    reveals +
    // Once every letter is written, each mask shows everything, so the last frame is the still logo.
    `.full{animation:full ${DURATION}ms both}@keyframes full{0%{opacity:0}${percent(WRITES_TO + 40)}{opacity:0}${percent(WRITES_TO + 60)}{opacity:1}100%{opacity:1}}` +
    `.comet{animation:comet ${DURATION}ms both}@keyframes comet{0%{opacity:1}${percent(DOCKS)}{opacity:1}${percent(DOCKS + 80)}{opacity:0}100%{opacity:0}}` +
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

  const viewBox = [box[0] - MARGIN, box[1] - MARGIN, box[2] + 2 * MARGIN, box[3] + 2 * MARGIN];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.map(round).join(" ")}"><style>${style}</style><defs>${masks}</defs>` +
    `<g class="v"><g class="dip"><path fill="${ink}" d="${v}"/></g></g>${letters}` +
    `<g class="bar"><g class="dip"><path fill="${daylight}" d="${bar}"/></g></g>` +
    `<g class="comet" opacity="0"><path class="pen" d="${stroke}" fill="none" stroke="${daylight}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/></g></svg>\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const tone of TONES) {
    const still = new URL(`../assets/logo/logo-${tone}.svg`, import.meta.url);
    const animated = new URL(`../assets/motion/logo-write-${tone}.svg`, import.meta.url);
    writeFileSync(animated, buildLogoWrite(readFileSync(still, "utf8")));
    console.log(`Wrote assets/motion/logo-write-${tone}.svg.`);
  }
}
