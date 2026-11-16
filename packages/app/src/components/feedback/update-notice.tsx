import { Tooltip } from "./tooltip";

interface UpdateNoticeProps {
  /** The newer version, such as `0.4.0`. */
  version: string;
  /** Offers to install it, asking first, since installing restarts Vista. */
  onInstall: () => void;
  /** Hides the notice until a newer version is out. */
  onDismiss: () => void;
}

/**
 * A quiet note that a newer version of Vista is out, found by the startup check. It asks nothing
 * and blocks nothing: choosing it offers the install, and its close button puts it away until the
 * next version.
 *
 * @param props - UpdateNotice properties.
 * @returns Notice element.
 */
export function UpdateNotice({ version, onInstall, onDismiss }: UpdateNoticeProps) {
  const dismissLabel = `Dismiss Vista ${version}`;
  return (
    <div className="border-line text-text-muted flex h-[30px] flex-none items-center rounded-md border text-xs">
      <button
        type="button"
        onClick={onInstall}
        title={`Vista ${version} is available. Choose to install it.`}
        className="hover:text-text flex h-full items-center gap-1.5 rounded-l-md pr-1 pl-2 transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]"
      >
        <i className="ic-circle-arrow-down text-sm" aria-hidden="true" />
        <span>Update to {version}</span>
      </button>
      <Tooltip text={dismissLabel} position="bottom" className="flex flex-none">
        {(bubbleId) => (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            aria-describedby={bubbleId}
            className="icon-button text-text-faint mr-0.5 size-6"
          >
            <i className="ic-x" aria-hidden="true" />
          </button>
        )}
      </Tooltip>
    </div>
  );
}
