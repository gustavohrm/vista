import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** The brand files the web host serves at fixed paths, as copies of their sources under the root `assets/`. */
const COPIES = [
  ["favicon.ico", "favicon/favicon.ico"],
  ["favicon.svg", "favicon/favicon.svg"],
  ["og-image.png", "social/og-image.png"],
] as const;

function read(path: string, base: string): Buffer {
  return readFileSync(new URL(path, new URL(base, import.meta.url)));
}

describe("public brand files", () => {
  it.each(COPIES)("serves %s as an exact copy of assets/%s", (published, source) => {
    expect(read(published, "./public/").equals(read(source, "../../../assets/"))).toBe(true);
  });
});
