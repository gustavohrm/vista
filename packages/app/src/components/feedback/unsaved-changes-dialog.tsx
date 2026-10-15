import { useEffect, useId, useRef, type MouseEvent, type SyntheticEvent } from "react";

/** The user's decision when leaving a document that has unsaved changes. */
export type UnsavedChangesChoice = "save" | "discard" | "cancel";

interface UnsavedChangesDialogProps {
  /** Name of the document with unsaved changes, shown in the dialog title. */
  fileName: string;
  /**
   * Callback invoked once with the user's decision. Escape, a click on the backdrop, and the
   * Cancel button all report `"cancel"`.
   */
  onChoose: (choice: UnsavedChangesChoice) => void;
}

/**
 * Modal asking whether to save, discard, or keep a document with unsaved changes open. Renders a
 * native `<dialog>` opened with `showModal()`, so the browser provides focus containment and
 * inerts the page behind it. Save receives initial focus. The parent should unmount this component
 * once `onChoose` fires.
 *
 * @param props - UnsavedChangesDialog properties.
 * @returns Modal dialog element.
 */
export function UnsavedChangesDialog({ fileName, onChoose }: UnsavedChangesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

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
            {`Save changes to ${fileName}?`}
          </h2>
          <p id={descriptionId} className="text-body text-text-secondary">
            Your changes will be lost if you don&apos;t save them.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onChoose("cancel")} className="btn ghost sm">
            Cancel
          </button>
          <button type="button" onClick={() => onChoose("discard")} className="btn sm">
            Don&apos;t Save
          </button>
          <button ref={saveButtonRef} type="button" onClick={() => onChoose("save")} className="btn primary sm">
            Save
          </button>
        </div>
      </div>
    </dialog>
  );
}
