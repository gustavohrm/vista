import { describe, expect, it } from "vitest";

import { decodeText, encodeText } from "./text-codec";

const bytes = (...values: number[]) => new Uint8Array(values);
const utf8 = (text: string) => new TextEncoder().encode(text);

describe("decodeText", () => {
  it("decodes UTF-8 text as editable", () => {
    expect(decodeText(utf8("ação"))).toEqual({ kind: "text", text: "ação", hasBom: false });
  });

  it("decodes an empty file as editable text", () => {
    expect(decodeText(bytes())).toEqual({ kind: "text", text: "", hasBom: false });
  });

  it("strips a UTF-8 byte-order mark and remembers it", () => {
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0x61))).toEqual({ kind: "text", text: "a", hasBom: true });
  });

  it("opens Windows-1252 text read-only instead of replacing its characters on save", () => {
    // "ação" as Excel's default CSV export writes it.
    const decoded = decodeText(bytes(0x61, 0xe7, 0xe3, 0x6f));
    expect(decoded.kind).toBe("read-only");
  });

  it("shows UTF-16 text with a byte-order mark read-only, decoded correctly", () => {
    expect(decodeText(bytes(0xff, 0xfe, 0x61, 0x00, 0xe7, 0x00))).toEqual({ kind: "read-only", text: "aç" });
    expect(decodeText(bytes(0xfe, 0xff, 0x00, 0x61, 0x00, 0xe7))).toEqual({ kind: "read-only", text: "aç" });
  });

  it("treats a file with a NUL byte as binary", () => {
    expect(decodeText(bytes(0x89, 0x50, 0x4e, 0x47, 0x00, 0x01))).toEqual({ kind: "binary" });
  });

  it("only looks for NUL bytes near the start", () => {
    const text = new Uint8Array(9000).fill(0x61);
    text[8999] = 0;
    expect(decodeText(text).kind).toBe("text");
  });
});

describe("encodeText", () => {
  it("encodes UTF-8 without a byte-order mark", () => {
    expect([...encodeText("ç", false)]).toEqual([0xc3, 0xa7]);
  });

  it("puts back a byte-order mark the file had", () => {
    expect([...encodeText("a", true)]).toEqual([0xef, 0xbb, 0xbf, 0x61]);
  });
});
