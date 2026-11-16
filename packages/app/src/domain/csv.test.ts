import { describe, expect, it } from "vitest";

import { parseCsv, serializeCsv } from "./csv";

describe("parseCsv", () => {
  it("does not read the final line break as an empty last record", () => {
    expect(parseCsv("Name,Age\nAda,36\n").rows).toEqual([
      ["Name", "Age"],
      ["Ada", "36"],
    ]);
  });

  it("keeps a blank line that is not the final line break", () => {
    expect(parseCsv("a\n\n").rows).toEqual([["a"], [""]]);
  });

  it("reads an empty file as one empty cell", () => {
    expect(parseCsv("").rows).toEqual([[""]]);
  });
});

describe("serializeCsv", () => {
  it.each(["Name,Age\nAda,36\n", "Name,Age\r\nAda,36\r\n", "Name,Age\nAda,36"])(
    "writes %j back as it was",
    (content) => {
      const document = parseCsv(content);
      expect(serializeCsv(document.rows, document)).toBe(content);
    },
  );
});
