import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { validateEntryName } from "../../domain/path-validation";

/** Horizontal distance between nested tree levels, in pixels. */
export const TREE_INDENT_PX = 16;
/** Space between the sidebar edge and the first level's chevron column, in pixels. */
export const TREE_ROW_INSET_PX = 4;
/** Width of the chevron column every tree row reserves, in pixels. Directories show a chevron in it, files leave it empty. */
export const TREE_CHEVRON_COLUMN_PX = 12;

interface TreeEntryNameInputProps {
  /** Indentation depth, matching the tree row it replaces or is inserted alongside. */
  level: number;
  /** Starting value: the current name when renaming, or empty when creating a new entry. */
  initialValue: string;
  /** Icon element shown beside the input, matching the row's file or folder icon. */
  icon: ReactNode;
  /**
   * Chevron element shown in the chevron column, matching a directory row being renamed. Omit for
   * files and new entries, which leave the column empty so names stay aligned.
   */
  disclosure?: ReactNode;
  /** Existing sibling names in the same parent directory, excluding this entry's own current name. */
  siblingNames: readonly string[];
  /** Callback fired with the trimmed, validated name when the user commits (Enter or blur). */
  onCommit: (name: string) => void;
  /** Callback fired when the user cancels (Escape) without committing. */
  onCancel: () => void;
}

/**
 * Inline text input that replaces a tree row for renaming an existing entry, or is inserted
 * as a draft row for creating a new one. It uses the same height, indentation, and chevron and
 * icon columns as a tree row, so the swap does not shift the entry. Validates the name locally
 * before committing.
 *
 * @param props - TreeEntryNameInput properties.
 * @returns Inline name input element.
 */
export function TreeEntryNameInput({
  level,
  initialValue,
  icon,
  disclosure,
  siblingNames,
  onCommit,
  onCancel,
}: TreeEntryNameInputProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const isCancellingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    if (isCancellingRef.current) {
      return;
    }
    const trimmed = value.trim();
    const validationError = validateEntryName(trimmed, siblingNames);
    if (validationError) {
      setError(validationError);
      return;
    }
    onCommit(trimmed);
  };

  return (
    <div className="flex flex-col pr-2" style={{ paddingLeft: level * TREE_INDENT_PX + TREE_ROW_INSET_PX }}>
      <div className="flex h-6 items-center gap-1">
        {disclosure ?? <span aria-hidden="true" className="w-3 flex-none" />}
        {icon}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              isCancellingRef.current = true;
              onCancel();
            }
          }}
          onBlur={commit}
          aria-label="Entry name"
          aria-invalid={error !== null}
          aria-describedby={error !== null ? errorId : undefined}
          className="ipt h-5 min-h-0 min-w-0 flex-1 px-1 py-0 text-[13px]"
        />
      </div>
      {error && (
        <span id={errorId} role="alert" className="hint destructive text-xs">
          {error}
        </span>
      )}
    </div>
  );
}
