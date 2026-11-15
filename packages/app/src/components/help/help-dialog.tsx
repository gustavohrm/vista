import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";

interface HelpDialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Gives the content more room, for a dialog with sections side by side. */
  isWide?: boolean;
}

/**
 * A modal with a title, content, and a Close button. It is a native `<dialog>` opened with
 * `showModal()`, so the browser contains focus and inerts the page behind it. Escape and a click
 * on the backdrop close it.
 */
export function HelpDialog({ title, onClose, children, isWide = false }: HelpDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    // `showModal()` focuses the first focusable element, which is the scrolling content when it
    // overflows. Start on Close instead, so Enter dismisses the dialog.
    closeButtonRef.current?.focus();
    return () => dialog?.close();
  }, []);

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the click only dismisses on the backdrop; keyboard users close with Escape (`onCancel`) and the Close button
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className={`card soft floating flush backdrop:bg-black/50 backdrop:backdrop-blur-sm ${
        isWide ? "w-[min(44rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]"
      }`}
    >
      <div className="flex max-h-[80vh] flex-col p-5">
        <h2 id={titleId} className="text-title-sm text-text-strong">
          {title}
        </h2>
        <div className="-mr-2 min-h-0 overflow-y-auto pt-1 pr-2">{children}</div>
        <div className="flex justify-end pt-4">
          <button ref={closeButtonRef} type="button" onClick={onClose} className="btn sm">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
