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
export function HelpDialog({ title, onClose, children }: HelpDialogProps) {
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
      className="card soft floating flush w-[min(28rem,calc(100vw-2rem))] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
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

/** A named set of command ids, such as one application menu. */
interface ShortcutGroup {
  label: string;
  items: readonly string[];
}

interface KeyboardShortcutsDialogProps {
  commands: readonly Command[];
  /** Groups the commands are listed under, in order. A command in no group is listed last. */
  groups: readonly ShortcutGroup[];
  onClose: () => void;
}

/**
 * Lists every command that has a key, including keys the editors handle themselves, under the
 * menu the command belongs to.
 */
export function KeyboardShortcutsDialog({ commands, groups, onClose }: KeyboardShortcutsDialogProps) {
  const withKeys = commands.flatMap((command) => {
    const shortcut = command.shortcut ?? command.shortcutHint;
    return shortcut ? [{ id: command.id, label: command.label, shortcut }] : [];
  });
  const grouped = new Set(groups.flatMap((group) => group.items));
  const sections = [
    ...groups.map((group) => ({ label: group.label, rows: withKeys.filter((row) => group.items.includes(row.id)) })),
    { label: "Other", rows: withKeys.filter((row) => !grouped.has(row.id)) },
  ].filter((section) => section.rows.length > 0);

  return (
    <HelpDialog title="Keyboard Shortcuts" onClose={onClose}>
      <table className="text-body w-full border-separate border-spacing-0">
        {sections.map((section) => (
          <tbody key={section.label}>
            <tr>
              <th scope="rowgroup" colSpan={2} className="text-text-secondary pt-4 pb-1 text-left text-xs font-medium">
                {section.label}
              </th>
            </tr>
            {section.rows.map((row) => (
              <tr key={row.id}>
                <td className="text-text py-1 pr-4">{row.label}</td>
                <td className="py-1 text-right">
                  <kbd className="kbd text-[11px]">{formatShortcut(row.shortcut)}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        ))}
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
      <p className="text-body text-text-secondary pt-2">
        Vista edits a folder of Markdown, CSV, and text files, as raw text or rendered. Running in the{" "}
        {platform === "native" ? "desktop app" : "browser"}.
      </p>
    </HelpDialog>
  );
}
