import { describe, expect, it } from "vitest";

import writeOnLight from "../../../../../assets/motion/logo-write-dark.svg?raw";
import writeOnDark from "../../../../../assets/motion/logo-write-light.svg?raw";
import { LOGO_WRITE_MS } from "./logo-write";

describe("LOGO_WRITE_MS", () => {
  it("matches how long the generated entrance files play, their longest animation", () => {
    for (const file of [writeOnLight, writeOnDark]) {
      const durations = [...file.matchAll(/animation:[\w-]+ (\d+)ms/g)].map((match) => Number(match[1]));
      expect(Math.max(...durations)).toBe(LOGO_WRITE_MS);
    }
  });
});
