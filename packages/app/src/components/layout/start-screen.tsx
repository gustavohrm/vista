import type { ReactNode } from "react";

import { formatShortcut } from "../../commands";
import { VistaLoader, VistaLogo } from "../brand/vista-logo";

/** One suggested next step on the start screen. */
export interface StartAction {
  label: string;
  /** Icon element, such as `<i className="ic-search" aria-hidden="true" />`. */
  icon: ReactNode;
  /** Shortcut shown beside the label, such as "Mod+P". Display only. */
  shortcut?: string;
  onSelect: () => void;
}

interface StartScreenProps {
  /** Name of the open folder, or null when none is open. */
  workspaceName: string | null;
  /** Whether a folder is still being opened or restored, so nothing is offered yet. */
  isLoading: boolean;
  /** Name of a remembered folder that can be reopened with one click, or null. */
  restorableFolderName: string | null;
  onOpenFolder: () => void;
  onReopenFolder: () => void;
  /** Next steps offered once a folder is open. */
  actions: readonly StartAction[];
}

/**
 * Fills the editor area while no file is open. While a folder is being opened or restored it shows
 * the loader. Without a folder it shows the logo, says what Vista does, and offers opening one, with
 * the remembered folder first when there is one. With a folder it lists the ways
 * to get to a file, each with its shortcut.
 *
 * @param props - StartScreen properties.
 * @returns Start screen element.
 */
export function StartScreen({
  workspaceName,
  isLoading,
  restorableFolderName,
  onOpenFolder,
  onReopenFolder,
  actions,
}: StartScreenProps) {
  if (workspaceName === null && isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <VistaLoader label="Opening folder…" className="h-10 w-12" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      {workspaceName === null ? (
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="flex">
              <VistaLogo className="h-8 w-auto" />
            </h1>
            <p className="text-body text-text-secondary">
              Open a folder to read and edit its Markdown, CSV, and text files, rendered or as raw text.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {restorableFolderName && (
              <button type="button" onClick={onReopenFolder} className="btn primary w-full">
                <i className="ic-history" aria-hidden="true" />
                <span className="min-w-0 truncate">Reopen {restorableFolderName}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenFolder}
              className={restorableFolderName ? "btn w-full" : "btn primary w-full"}
            >
              <i className="ic-folder-open" aria-hidden="true" />
              Open Folder
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-title-sm text-text-strong truncate">{workspaceName}</h1>
            <p className="text-body text-text-secondary">Pick a file in the explorer, or start here.</p>
          </div>
          <ul className="-mx-2 flex flex-col gap-0.5">
            {actions.map((action) => (
              <li key={action.label}>
                <button
                  type="button"
                  onClick={action.onSelect}
                  className="btn ghost w-full justify-start gap-3 font-normal"
                >
                  <span className="text-text-secondary flex flex-none">{action.icon}</span>
                  <span className="flex-1 text-left">{action.label}</span>
                  {action.shortcut && (
                    <kbd aria-hidden="true" className="kbd flex-none text-[11px]">
                      {formatShortcut(action.shortcut)}
                    </kbd>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
