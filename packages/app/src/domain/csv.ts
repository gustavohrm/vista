import Papa from "papaparse";

/** A CSV file as the table edits it: its records, and how to write them back unchanged. */
export interface CsvDocument {
  /** The records, the first one being the header. Never empty: an empty file is one empty cell. */
  rows: string[][];
  /** The record separator the file uses, which is written back. */
  newline: string;
  /** The field separator the file was read with, such as `;` or a tab, which is written back. */
  delimiter: string;
  /** Whether the file ends with a line break, which is kept when the table rewrites it. */
  hasTrailingNewline: boolean;
}

/**
 * Reads CSV text into records. A line break at the end of the file ends the last record; it does not
 * start an empty one, so a table shows no phantom row for it.
 *
 * @param content - The file's text.
 * @returns The records, the line break to write them with, and whether the file ends with one.
 */
export function parseCsv(content: string): CsvDocument {
  const result = Papa.parse<string[]>(content, { skipEmptyLines: false });
  const rows = result.data.filter((row) => Array.isArray(row));
  const hasTrailingNewline = /\r?\n$|\r$/.test(content);
  const last = rows.at(-1);
  if (hasTrailingNewline && last?.length === 1 && last[0] === "") {
    rows.pop();
  }
  // Papa writes CRLF by default. Writing back the record separator it detected, which ignores line
  // breaks inside quoted cells, stops one cell edit from rewriting every line.
  return {
    rows: rows.length === 0 ? [[""]] : rows,
    newline: result.meta.linebreak,
    delimiter: result.meta.delimiter,
    hasTrailingNewline,
  };
}

/**
 * Writes records back as CSV text, with the file's line break, and its final line break if it had one.
 *
 * @param rows - The records, the header first.
 * @param document - The parsed file whose line breaks to keep.
 * @returns The CSV text.
 */
export function serializeCsv(rows: readonly (readonly string[])[], document: Omit<CsvDocument, "rows">): string {
  const options = { newline: document.newline, delimiter: document.delimiter };
  const last = rows.at(-1);
  if (!document.hasTrailingNewline && rows.length > 1 && last?.length === 1 && last[0] === "") {
    // An empty last record would be written as nothing, and the line break before it would read back
    // as the file's final one, losing the record. A quoted empty field keeps it.
    return Papa.unparse(rows.slice(0, -1) as string[][], options) + document.newline + '""';
  }
  const text = Papa.unparse(rows as string[][], options);
  return document.hasTrailingNewline ? text + document.newline : text;
}

/**
 * The most cells the table shows. It draws one input per cell, so opening it takes about 160 ms per
 * 1,000 cells in Chromium (measured 2026-11-16 with the web build: 1.6 s at 10,000 cells, 7.8 s at
 * 50,000). Past this a file opens in the raw view instead; see the workspaces spec.
 */
export const MAX_TABLE_CELLS = 10_000;

/**
 * Whether the table can show a file: whether it has at most `MAX_TABLE_CELLS` cells, counted as the
 * first record's fields times the records. It stops counting at the limit, so a large file costs no
 * more than one at the limit, and a line break inside a quoted cell counts as a record, which errs
 * toward the raw view.
 *
 * @param content - The file's text.
 * @returns Whether the table can show it.
 */
export function fitsTable(content: string): boolean {
  const first = Papa.parse<string[]>(content, { preview: 1 });
  const columns = Math.max(1, first.data[0]?.length ?? 1);
  const maxRecords = Math.floor(MAX_TABLE_CELLS / columns);
  const newline = first.meta.linebreak || "\n";
  let records = 1;
  for (let at = content.indexOf(newline); at !== -1; at = content.indexOf(newline, at + newline.length)) {
    // A final line break ends the last record rather than starting one.
    if (at + newline.length === content.length) {
      break;
    }
    records += 1;
    if (records > maxRecords) {
      return false;
    }
  }
  return true;
}
