import { describe, expect, it } from "vitest";

import { fitsTable, MAX_TABLE_CELLS, parseCsv, serializeCsv } from "./csv";

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

describe("serializeCsv round trips", () => {
  it("keeps an empty last record of a one-column file with no final line break", () => {
    const document = parseCsv("Name");
    const text = serializeCsv([["Name"], [""]], document);
    expect(parseCsv(text).rows).toEqual([["Name"], [""]]);
  });

  it.each([
    ["a;b;c\n1;2;3\n4;5;6\n", ";"],
    ["a\tb\n1\t2", "\t"],
    ["a|b\n1|2", "|"],
  ])("writes %j back with the delimiter it was read with", (content, delimiter) => {
    const document = parseCsv(content);
    expect(document.rows[0]).toHaveLength(content.split("\n")[0]!.split(delimiter).length);
    expect(serializeCsv(document.rows, document)).toBe(content);
  });
});

/** A CSV of `records` records, the header included, of `columns` short cells each. */
function csvOf(records: number, columns: number, newline = "\n"): string {
  return Array.from({ length: records }, (_, r) =>
    Array.from({ length: columns }, (_, c) => `${r}.${c}`).join(","),
  ).join(newline);
}

describe("fitsTable", () => {
  it("fits a file of exactly the cell limit", () => {
    expect(fitsTable(csvOf(MAX_TABLE_CELLS / 10, 10))).toBe(true);
  });

  it("does not fit a file one record over the cell limit", () => {
    expect(fitsTable(csvOf(MAX_TABLE_CELLS / 10 + 1, 10))).toBe(false);
  });

  it("counts records by the file's own line break", () => {
    expect(fitsTable(csvOf(MAX_TABLE_CELLS / 10 + 1, 10, "\r\n"))).toBe(false);
    expect(fitsTable(csvOf(MAX_TABLE_CELLS / 20, 20, "\r"))).toBe(true);
  });

  it("fits an empty file", () => {
    expect(fitsTable("")).toBe(true);
  });
});
