import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from "react";

import { parseCsv, serializeCsv } from "../../domain/csv";
import { t } from "../../i18n";
import { useReducedMotion } from "../../theme/appearance";
import { useReorderDrag } from "../use-reorder-drag";

/** Body rows run down the table; each row carries its index among the records. */
const ROW_DRAG_OPTIONS = { axis: "y", itemAttribute: "data-row-key" } as const;

interface CsvTableEditorProps {
  /** Raw CSV string content. */
  content: string;
  /** Callback fired whenever a cell or structure edit changes the CSV text. */
  onChange: (newContent: string) => void;
}

/**
 * Interactive tabular editor for CSV files with in-place cell editing. The first record is the
 * header, edited in place like any cell. A new column is added from the button at the header's end,
 * a new row from the button under the last row, where each one appears. A row moves by dragging its
 * number, or with Shift+Up and Shift+Down while its number has focus; the header stays first.
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

  const scrollRef = useRef<HTMLDivElement>(null);
  // Set when a row is moved from the keyboard, so its handle takes focus again in its new place.
  const movedRowRef = useRef<number | null>(null);
  const isReducedMotion = useReducedMotion();

  /** Moves the body row at record index `rowIndex` to the place `toIndex` among the body rows. */
  const moveRow = useCallback(
    (rowIndex: number, toIndex: number) => {
      const to = Math.min(Math.max(toIndex + 1, 1), rows.length - 1);
      const moved = rows[rowIndex];
      if (rowIndex < 1 || !moved || to === rowIndex) {
        return false;
      }
      const nextRows = rows.filter((_, index) => index !== rowIndex);
      nextRows.splice(to, 0, moved);
      write(nextRows);
      return true;
    },
    [rows, write],
  );

  const { drag, startDrag } = useReorderDrag(
    scrollRef,
    (key, toIndex) => moveRow(Number(key), toIndex),
    isReducedMotion,
    ROW_DRAG_OPTIONS,
  );

  useEffect(() => {
    const moved = movedRowRef.current;
    if (moved !== null) {
      movedRowRef.current = null;
      scrollRef.current?.querySelector<HTMLElement>(`[data-row-key="${moved}"] [data-row-handle]`)?.focus();
    }
  }, [rows]);

  const handleHandleKeyDown = (rowIndex: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0 || !event.shiftKey) {
      return;
    }
    // Moves the row one place, stopping at the ends of the table.
    event.preventDefault();
    const to = rowIndex + step;
    if (moveRow(rowIndex, to - 1)) {
      movedRowRef.current = to;
    }
  };

  const columnName = (colIndex: number) => header[colIndex]?.trim() || t("csv.column", { column: colIndex + 1 });
  const columns = Array.from({ length: columnCount }, (_, colIndex) => colIndex);

  return (
    // No top padding: the tabs row already leaves 6px below its tabs, the same as the 6px at the
    // frame's edges, so the table sits as far from the tabs as the tabs and table sit from the edge.
    <div ref={scrollRef} className="csv-table text-text h-full w-full overflow-auto px-1.5 pb-3">
      <div className="table-wrap w-fit max-w-none">
        <table className="data-table ruled edged">
          <thead>
            <tr>
              <th data-find-skip aria-label={t("csv.row")} className="w-12" />
              {columns.map((colIndex) => (
                <th key={colIndex} className="min-w-[120px]">
                  <input
                    type="text"
                    value={header[colIndex] ?? ""}
                    aria-label={t("csv.columnName", { column: colIndex + 1 })}
                    onChange={(event) => handleCellChange(0, colIndex, event.target.value)}
                    className="ipt ghost edgeless inline-field text-text-strong font-semibold"
                  />
                </th>
              ))}
              <th data-find-skip className="w-9">
                <button
                  type="button"
                  onClick={handleAddColumn}
                  aria-label={t("csv.addColumn")}
                  title={t("csv.addColumn")}
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
              const isDragged = drag?.key === String(rowIndex);
              const offset = drag?.offsets[String(rowIndex)];
              return (
                <tr
                  key={rowIndex}
                  data-row-key={rowIndex}
                  data-row-dragging={isDragged ? "" : undefined}
                  style={offset ? { transform: `translateY(${offset}px)` } : undefined}
                  // The dragged row stays under the pointer and above the rows it passes; the others,
                  // and the dragged one once released, slide. Keyboard moves are instant.
                  className={`group ease-(--ease-move) motion-reduce:transition-none ${
                    isDragged ? "relative z-10" : ""
                  } ${drag && (!isDragged || drag.isSettling) ? "transition-transform duration-150" : ""}`}
                >
                  <td data-find-skip className="select-none">
                    <button
                      type="button"
                      data-row-handle
                      aria-label={t("csv.moveRow", { row: rowIndex })}
                      title={t("csv.moveRowHint")}
                      onPointerDown={(event) => startDrag(String(rowIndex), event)}
                      onKeyDown={(event) => handleHandleKeyDown(rowIndex, event)}
                      className="text-text-faint hover:text-text-muted grid h-8 w-full cursor-grab place-items-center font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-inset active:cursor-grabbing"
                    >
                      <span className="col-start-1 row-start-1 group-hover:invisible group-data-row-dragging:invisible">
                        {rowIndex}
                      </span>
                      <i
                        className="ic-grip-vertical invisible col-start-1 row-start-1 text-sm group-hover:visible group-data-row-dragging:visible"
                        aria-hidden="true"
                      />
                    </button>
                  </td>
                  {columns.map((colIndex) => (
                    <td key={colIndex}>
                      <input
                        type="text"
                        value={row[colIndex] ?? ""}
                        aria-label={t("csv.cell", { column: columnName(colIndex), row: rowIndex })}
                        onChange={(event) => handleCellChange(rowIndex, colIndex, event.target.value)}
                        className="ipt ghost edgeless inline-field"
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
        {t("csv.addRow")}
      </button>
    </div>
  );
}
