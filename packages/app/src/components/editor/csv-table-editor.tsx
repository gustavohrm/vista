import Papa from "papaparse";
import { useCallback, useMemo } from "react";

interface CsvTableEditorProps {
  /** Raw CSV string content. */
  content: string;
  /** Callback fired whenever a cell or structure edit changes the CSV text. */
  onChange: (newContent: string) => void;
}

/**
 * Interactive tabular editor for CSV files with in-place cell editing.
 *
 * @param props - CsvTableEditor properties.
 * @returns Tabular CSV editing interface.
 */
export function CsvTableEditor({ content, onChange }: CsvTableEditorProps) {
  const parsedData = useMemo(() => {
    const result = Papa.parse<string[]>(content, {
      skipEmptyLines: false,
    });
    const rows = result.data.filter((row) => Array.isArray(row));
    if (rows.length === 0) {
      return [[""]];
    }
    return rows;
  }, [content]);

  const maxColumns = useMemo(() => {
    return parsedData.reduce((max, row) => Math.max(max, row.length), 1);
  }, [parsedData]);

  const handleCellChange = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      const nextData = parsedData.map((row) => [...row]);
      while (nextData[rowIndex].length <= colIndex) {
        nextData[rowIndex].push("");
      }
      nextData[rowIndex][colIndex] = value;
      const unparsed = Papa.unparse(nextData);
      onChange(unparsed);
    },
    [parsedData, onChange],
  );

  const handleAddRow = useCallback(() => {
    const nextData = [...parsedData.map((row) => [...row]), Array.from({ length: maxColumns }, () => "")];
    const unparsed = Papa.unparse(nextData);
    onChange(unparsed);
  }, [parsedData, maxColumns, onChange]);

  const handleAddColumn = useCallback(() => {
    const nextData = parsedData.map((row) => [...row, ""]);
    const unparsed = Papa.unparse(nextData);
    onChange(unparsed);
  }, [parsedData, onChange]);

  // Column header letters (A, B, C, ...)
  const columnLabels = useMemo(() => {
    return Array.from({ length: maxColumns }, (_, i) => {
      let label = "";
      let n = i;
      while (n >= 0) {
        label = String.fromCharCode((n % 26) + 65) + label;
        n = Math.floor(n / 26) - 1;
      }
      return label;
    });
  }, [maxColumns]);

  return (
    <div className="csv-table bg-background text-text flex h-full w-full flex-col">
      <div className="border-border bg-foreground flex items-center gap-2 border-b px-4 py-2">
        <span className="text-text-secondary text-xs font-medium">Table Actions:</span>
        <button type="button" onClick={handleAddRow} className="btn sm">
          <i className="ic-plus text-xs" aria-hidden="true" />
          Add Row
        </button>
        <button type="button" onClick={handleAddColumn} className="btn sm">
          <i className="ic-plus text-xs" aria-hidden="true" />
          Add Column
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="table-wrap">
          <table className="data-table ruled edged">
            <thead>
              <tr>
                <th className="w-16 text-center select-none">#</th>
                {columnLabels.map((col, idx) => (
                  <th key={idx} className="min-w-[120px] text-left select-none">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedData.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="select-none">
                    <span className="block px-3 py-2 text-center font-mono">{rowIndex + 1}</span>
                  </td>
                  {Array.from({ length: maxColumns }, (_, colIndex) => (
                    <td key={colIndex}>
                      <input
                        type="text"
                        value={row[colIndex] ?? ""}
                        aria-label={`Row ${rowIndex + 1}, Column ${columnLabels[colIndex]}`}
                        onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                        className="ipt ghost edgeless"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
