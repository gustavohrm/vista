import { useEffect, useId, useRef, type MouseEvent, type SyntheticEvent } from "react";

/** The user's decision when leaving a document that has unsaved changes. */
export type UnsavedChangesChoice = "save" | "discard" | "cancel";

interface UnsavedChangesDialogProps {
  /**
   * Labels of the documents with unsaved changes. One label is shown in the title; several are
   * counted in the title and listed, and Save becomes Save All. Pass paths rather than bare names
   * when listing several, so files with the same name stay distinguishable.
   */
  fileNames: readonly string[];
  /**
   * Callback invoked once with the user's decision. Escape, a click on the backdrop, and the
   * Cancel button all report `"cancel"`.
   */
  onChoose: (choice: UnsavedChangesChoice) => void;
}

/**
 * Modal asking whether to save, discard, or keep one or more documents with unsaved changes. Renders a
 * native `<dialog>` opened with `showModal()`, so the browser provides focus containment and
 * inerts the page behind it. Save receives initial focus. The parent should unmount this component
 * once `onChoose` fires.
 *
 * @param props - UnsavedChangesDialog properties.
 * @returns Modal dialog element.
 */
export function UnsavedChangesDialog({ fileNames, onChoose }: UnsavedChangesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isSingle = fileNames.length === 1;
  const title = isSingle ? `Save changes to ${fileNames[0]}?` : `Save changes to ${fileNames.length} files?`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
    }
    saveButtonRef.current?.focus();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  // Preventing the native close keeps the parent in control of when the dialog disappears.
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onChoose("cancel");
  };

  // With no padding on the <dialog> itself, a click whose target is the dialog element can only
  // come from the backdrop, because the content wrapper covers the dialog's whole box.
  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      onChoose("cancel");
    }
  };

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the click only dismisses on the backdrop; keyboard users cancel with Escape (`onCancel`) and the dialog's buttons
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className="card soft floating flush w-[min(24rem,calc(100vw-2rem))] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <h2 id={titleId} className="text-title-sm text-text-strong">
            {title}
          </h2>
          <p id={descriptionId} className="text-body text-text-secondary">
            Your changes will be lost if you don&apos;t save them.
          </p>
          {!isSingle && (
            <ul className="text-body text-text max-h-40 list-inside list-disc overflow-y-auto">
              {fileNames.map((name, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- names can repeat across folders, so the position keeps keys unique
                <li key={`${index}:${name}`}>{name}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onChoose("cancel")} className="btn ghost sm">
            Cancel
          </button>
          <button type="button" onClick={() => onChoose("discard")} className="btn sm">
            Don&apos;t Save
          </button>
          <button ref={saveButtonRef} type="button" onClick={() => onChoose("save")} className="btn primary solid sm">
            {isSingle ? "Save" : "Save All"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
