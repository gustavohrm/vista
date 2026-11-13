/**
 * How a file's bytes can be shown. Only `"text"` is editable: saving writes the text back as
 * UTF-8, so editing text that was decoded any other way would change characters the user never
 * touched.
 */
export type DecodedText =
  | { kind: "text"; text: string; hasBom: boolean }
  | { kind: "read-only"; text: string }
  | { kind: "binary" };

/** How far into a file to look for a NUL byte, the same window Git uses to call a file binary. */
const BINARY_SNIFF_BYTES = 8000;

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

export function decodeText(bytes: Uint8Array): DecodedText {
  if (startsWith(bytes, [0xff, 0xfe])) {
    return { kind: "read-only", text: new TextDecoder("utf-16le").decode(bytes) };
  }
  if (startsWith(bytes, [0xfe, 0xff])) {
    return { kind: "read-only", text: new TextDecoder("utf-16be").decode(bytes) };
  }
  const hasBom = startsWith(bytes, UTF8_BOM);
  const body = hasBom ? bytes.subarray(UTF8_BOM.length) : bytes;
  if (body.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
    return { kind: "binary" };
  }
  try {
    return { kind: "text", text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body), hasBom };
  } catch {
    // Invalid UTF-8, most often a legacy encoding such as Windows-1252. Shown with replacement
    // characters where the bytes do not decode.
    return { kind: "read-only", text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(body) };
  }
}

export function encodeText(text: string, hasBom: boolean): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(text);
  if (!hasBom) {
    return encoded;
  }
  const withBom = new Uint8Array(UTF8_BOM.length + encoded.length);
  withBom.set(UTF8_BOM);
  withBom.set(encoded, UTF8_BOM.length);
  return withBom;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}
