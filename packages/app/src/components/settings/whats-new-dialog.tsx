import { Fragment, useEffect, useId, useRef, type MouseEvent, type SyntheticEvent } from "react";

import { type ChangelogEntry, inlineParts, isIsoDate } from "../../domain/changelog";

/**
 * A release date as the reader's locale writes it, such as "November 13, 2026". The date names a day, not a
 * moment, so it is read and written in UTC and never shifts by a day with the reader's time zone.
 *
 * @param date - The date as `YYYY-MM-DD`.
 * @returns The formatted date, or the input as written when it is not a date.
 */
export function formatReleaseDate(date: string): string {
  return isIsoDate(date)
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: "long", timeZone: "UTC" })
    : date;
}

interface WhatsNewDialogProps {
  entry: ChangelogEntry;
  /** Closes the dialog. Escape, a click on the backdrop, and the Close button all call it. */
  onClose: () => void;
}

/**
 * Modal showing one version's changelog entry: its date and summary, then each heading with its changes.
 * Renders a native `<dialog>` opened with `showModal()`, like the unsaved-changes dialog. The parent
 * unmounts it once `onClose` fires.
 *
 * @param props - WhatsNewDialog properties.
 * @returns Modal dialog element.
 */
export function WhatsNewDialog({ entry, onClose }: WhatsNewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  // Whether the current press began on the backdrop: a text selection that starts inside the dialog and is
  // released outside it ends in a click on the dialog, which must not close it.
  const pressedBackdropRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
    }
    closeButtonRef.current?.focus();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  // Preventing the native close keeps the parent in control of when the dialog disappears.
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  // The content wrapper covers the dialog's whole box, so a press or click whose target is the dialog is on the
  // backdrop. Both must be, so dragging a selection out of the dialog does not close it.
  const handleBackdropPress = (event: MouseEvent<HTMLDialogElement>) => {
    pressedBackdropRef.current = event.target === event.currentTarget;
  };
  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (pressedBackdropRef.current && event.target === event.currentTarget) {
      onClose();
    }
    pressedBackdropRef.current = false;
  };

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the click only dismisses on the backdrop; keyboard users close with Escape (`onCancel`) and the Close button
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onMouseDown={handleBackdropPress}
      onClick={handleBackdropClick}
      className="card soft floating flush w-[min(30rem,calc(100vw-2rem))] [--ui-radius-surface:12px]"
    >
      <div className="flex max-h-[min(36rem,calc(100vh-4rem))] flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-text-strong text-[15px] leading-snug font-semibold">
            What&apos;s new in Vista {entry.version}
          </h2>
          {entry.date && <p className="text-text-faint text-xs">Released {formatReleaseDate(entry.date)}</p>}
        </div>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto text-[13px] leading-normal">
          {entry.description && <p className="text-text">{entry.description}</p>}
          {entry.sections.map((section, sectionIndex) => (
            // oxlint-disable-next-line react/no-array-index-key -- an entry's sections never reorder, and a heading may repeat on an older page
            <section key={sectionIndex} className="flex flex-col gap-1.5">
              <h3 className="text-text-strong font-semibold">{section.heading}</h3>
              <ul className="text-text-muted flex list-outside list-disc flex-col gap-1 pl-5">
                {section.items.map((item, itemIndex) => (
                  // oxlint-disable-next-line react/no-array-index-key -- the bullets never reorder, and two may read the same
                  <li key={itemIndex}>
                    {inlineParts(item).map((part, index) => (
                      // oxlint-disable-next-line react/no-array-index-key -- the runs of one bullet never reorder
                      <Fragment key={index}>
                        {part.kind === "code" ? (
                          <code className="text-text font-mono text-[12px]">{part.text}</code>
                        ) : (
                          part.text
                        )}
                      </Fragment>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="flex justify-end">
          <button ref={closeButtonRef} type="button" onClick={onClose} className="btn sm">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
