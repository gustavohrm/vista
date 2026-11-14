import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildLogoWrite, measurePath, TONES } from "./build-logo-write.mjs";

/** @type {(path: string) => string} */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("measurePath", () => {
  it("measures lines and ends on the last point", () => {
    expect(measurePath("M1 1L4 5L4 7")).toEqual({ length: 7, end: [4, 7] });
  });

  it("measures a curve", () => {
    // A quarter circle of radius 10, as the usual cubic approximation draws it.
    const { length, end } = measurePath("M10 0C10 5.5228 5.5228 10 0 10");
    expect(length).toBeCloseTo((Math.PI * 10) / 2, 2);
    expect(end).toEqual([0, 10]);
  });

  it("continues from a point when the path has no M", () => {
    expect(measurePath("L3 4", [0, 0]).length).toBe(5);
  });

  it("rejects a command with missing coordinates", () => {
    expect(() => measurePath("M0 0L3")).toThrow('Cannot read the path command "L3".');
  });
});

describe("buildLogoWrite", () => {
  // The animated files are this script's output. A failure here means a still logo or the script
  // changed without `node scripts/build-logo-write.mjs` being run again.
  it.each(TONES)("builds the checked-in %s file", (tone) => {
    expect(buildLogoWrite(read(`assets/logo/logo-${tone}.svg`))).toBe(read(`assets/motion/logo-write-${tone}.svg`));
  });

  it("reveals each letter with its own parts of the stroke, in writing order", () => {
    const still = read("assets/logo/logo-dark.svg");
    const svg = buildLogoWrite(still);
    const masks = [...svg.matchAll(/<mask id="(\w)"[^>]*>(.*?)<\/mask>/g)];
    expect(masks.map((mask) => mask[1])).toEqual(["i", "s", "t", "a"]);

    // Each mask covers its own letter: the i's stem and dot, the s, the t, and the a's body and bowl.
    const shapes = [...still.matchAll(/<path fill="[^"]+" d="([^"]+)"/g)][2]?.[1]?.match(/M[^M]*/g) ?? [];
    const glyphs = { i: shapes.slice(0, 2), s: shapes.slice(2, 3), t: shapes.slice(3, 4), a: shapes.slice(4, 6) };
    const masked = Object.fromEntries(
      [...svg.matchAll(/<g mask="url\(#(\w)\)"><path fill="[^"]+" d="([^"]+)"/g)].map((group) => [group[1], group[2]]),
    );
    expect(masked).toEqual(Object.fromEntries(Object.entries(glyphs).map(([letter, d]) => [letter, d.join("")])));

    const parts = masks.flatMap(([, letter, body]) =>
      [...`${body}`.matchAll(/<path class="r\d+" d="([^"]+)"[^>]*>/g)].map((part) => [part[0], letter, part[1]]),
    );
    // The t and the a are written in two parts each, the first clipped so it never uncovers the piece
    // the second writes: the t's crossbar ends, and the a's bowl.
    expect(parts.map((part) => part[1])).toEqual(["i", "s", "t", "t", "a", "a"]);
    const clips = parts.map((part) => part[0]?.match(/clip-path="url\(#(\w+)\)"/)?.[1]);
    expect(clips).toEqual([undefined, undefined, "c2", undefined, "c4", "c5"]);
    for (const clip of clips.filter(Boolean)) {
      expect(svg).toMatch(new RegExp(`<clipPath id="${clip}"><path d="M[^"]+"/></clipPath>`));
    }

    // Joined end to start, the parts are the stroke up to where it turns back.
    const written = parts.map((part, index) => (index === 0 ? part[2] : part[2]?.replace(/^M[^LC]*/, ""))).join("");
    const stroke = svg.match(/<path class="pen" d="([^"]+)"/)?.[1];
    expect(stroke?.startsWith(written)).toBe(true);
    // Each part after the first starts on the point the one before it ends on.
    const ends = parts.slice(0, -1).map((part) => `M${measurePath(`${part[2]}`).end.join(" ")}`);
    expect(parts.slice(1).map((part) => part[2]?.match(/^M[^LC]*/)?.[0])).toEqual(ends);
  });

  it("rejects a file that is not the still logo", () => {
    expect(() => buildLogoWrite(read("assets/logo/mark-dark.svg"))).toThrow("The still logo must have a viewBox");
  });
});
