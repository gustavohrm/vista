import { useCallback, useMemo } from "react";

import { parseCsv, serializeCsv } from "../../domain/csv";

interface CsvTableEditorProps {
  /** Raw CSV string content. */
  content: string;
  /** Callback fired whenever a cell or structure edit changes the CSV text. */
  onChange: (newContent: string) => void;
}

/**
 * Interactive tabular editor for CSV files with in-place cell editing. The first record is the
 * header, edited in place like any cell. A new column is added from the button at the header's end,
 * a new row from the button under the last row, where each one appears.
 *
 * @param props - CsvTableEditor properties.
 * @returns Tabular CSV editing interface.
 */
export function CsvTableEditor({ content, onChange }: CsvTableEditorProps) {
  const document = useMemo(() => parseCsv(content), [content]);
  const { rows } = document;
  const columnCount = useMemo(() => rows.reduce((max, row) => Math.max(max, row.length), 1), [rows]);
  const header = rows[0] ?? [];
  const body = rows.slice(1);

  const write = useCallback((nextRows: string[][]) => onChange(serializeCsv(nextRows, document)), [document, onChange]);

  const handleCellChange = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      const nextRows = rows.map((row) => [...row]);
      const row = nextRows[rowIndex];
      if (!row) {
        return;
      }
      while (row.length <= colIndex) {
        row.push("");
      }
      row[colIndex] = value;
      write(nextRows);
    },
    [rows, write],
  );

  const handleAddRow = useCallback(() => {
    write([...rows.map((row) => [...row]), Array.from({ length: columnCount }, () => "")]);
  }, [rows, columnCount, write]);

  const handleAddColumn = useCallback(() => {
    write(rows.map((row) => [...row, ...Array.from({ length: columnCount - row.length + 1 }, () => "")]));
  }, [rows, columnCount, write]);

  const columnName = (colIndex: number) => header[colIndex]?.trim() || `Column ${colIndex + 1}`;
  const columns = Array.from({ length: columnCount }, (_, colIndex) => colIndex);

  return (
    <div className="csv-table text-text h-full w-full overflow-auto px-4 py-3">
      <div className="table-wrap w-fit max-w-none">
        <table className="data-table ruled edged">
          <thead>
            <tr>
              <th data-find-skip aria-label="Row" className="w-12" />
              {columns.map((colIndex) => (
                <th key={colIndex} className="min-w-[120px]">
                  <input
                    type="text"
                    value={header[colIndex] ?? ""}
                    aria-label={`Column ${colIndex + 1} name`}
                    onChange={(event) => handleCellChange(0, colIndex, event.target.value)}
                    className="ipt ghost edgeless text-text-strong font-semibold"
                  />
                </th>
              ))}
              <th data-find-skip className="w-9">
                <button
                  type="button"
                  onClick={handleAddColumn}
                  aria-label="Add column"
                  title="Add column"
                  className="icon-button text-text-muted mx-auto size-6"
                >
                  <i className="ic-plus" aria-hidden="true" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {body.map((row, index) => {
              const rowIndex = index + 1;
              return (
                <tr key={rowIndex}>
                  <td data-find-skip className="select-none">
                    <span className="text-text-faint block px-3 text-center font-mono text-xs">{rowIndex}</span>
                  </td>
                  {columns.map((colIndex) => (
                    <td key={colIndex}>
                      <input
                        type="text"
                        value={row[colIndex] ?? ""}
                        aria-label={`${columnName(colIndex)}, row ${rowIndex}`}
                        onChange={(event) => handleCellChange(rowIndex, colIndex, event.target.value)}
                        className="ipt ghost edgeless"
                      />
                    </td>
                  ))}
                  <td aria-hidden="true" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={handleAddRow}
        data-find-skip
        className="text-text-muted hover:bg-hover hover:text-text mt-1 flex h-8 items-center gap-2 rounded-md px-3 text-[13px] transition-colors duration-100"
      >
        <i className="ic-plus" aria-hidden="true" />
        Add row
      </button>
    </div>
  );
}
