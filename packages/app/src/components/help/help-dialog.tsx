import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";

import { formatShortcut, type Command } from "../../commands";

interface HelpDialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A modal with a title, content, and a Close button. It is a native `<dialog>` opened with
 * `showModal()`, so the browser contains focus and inerts the page behind it. Escape and a click
 * on the backdrop close it.
 */
function HelpDialog({ title, onClose, children }: HelpDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
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
      className="card soft floating flush w-[min(28rem,calc(100vw-2rem))] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[80vh] flex-col gap-4 p-5">
        <h2 id={titleId} className="text-title-sm text-text-strong">
          {title}
        </h2>
        <div className="min-h-0 overflow-y-auto">{children}</div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn primary sm">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}

interface KeyboardShortcutsDialogProps {
  commands: readonly Command[];
  onClose: () => void;
}

/** Lists every command that has a key, including keys the editors handle themselves. */
export function KeyboardShortcutsDialog({ commands, onClose }: KeyboardShortcutsDialogProps) {
  const rows = commands.flatMap((command) => {
    const shortcut = command.shortcut ?? command.shortcutHint;
    return shortcut ? [{ id: command.id, label: command.label, shortcut }] : [];
  });
  return (
    <HelpDialog title="Keyboard Shortcuts" onClose={onClose}>
      <table className="text-body w-full">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-border border-b last:border-b-0">
              <td className="text-text py-1.5 pr-4">{row.label}</td>
              <td className="py-1.5 text-right">
                <kbd className="text-text-secondary font-sans text-xs">{formatShortcut(row.shortcut)}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </HelpDialog>
  );
}

interface AboutDialogProps {
  platform: string;
  onClose: () => void;
}

/** Names the app and the host it runs in. */
export function AboutDialog({ platform, onClose }: AboutDialogProps) {
  return (
    <HelpDialog title="About Vista" onClose={onClose}>
      <p className="text-body text-text-secondary">
        Vista edits a folder of Markdown, CSV, and text files, as raw text or rendered. Running in the{" "}
        {platform === "native" ? "desktop app" : "browser"}.
      </p>
    </HelpDialog>
  );
}
