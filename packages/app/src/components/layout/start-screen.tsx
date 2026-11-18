import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { formatShortcut } from "../../commands";
import type { DesktopDownload } from "../../domain/desktop-download";
import { LOGO_WRITE_MS, LogoWrite } from "../brand/logo-write";
import { VistaLoader, VistaLogo } from "../brand/vista-logo";
import { WorkspaceGlyph } from "../workspace/workspace-glyph";
import type { RecentWorkspace } from "../workspace/workspace-switcher";

/** A key hint on the empty frame of an open workspace: what a shortcut does, and the shortcut. */
export interface StartHint {
  label: string;
  /** Shortcut in the `Mod+P` notation. */
  shortcut: string;
}

interface StartScreenProps {
  /** Whether a workspace is open, so the frame shows hints instead of the start list. */
  hasWorkspace: boolean;
  /** Whether a folder is still being opened or restored, so nothing is offered yet. */
  isLoading: boolean;
  /**
   * How the logo comes in: `single-stroke` when the start screen is the app's first view in this
   * run, where it writes itself large and settles into place, and `opening` after a workspace was
   * open, where it plays the shorter entrance in its place. Defaults to `opening`.
   */
  entrance?: "single-stroke" | "opening";
  /** The remembered workspaces, the most recent first. */
  recents: readonly RecentWorkspace[];
  onOpenFolder: () => void;
  onOpenSettings: () => void;
  /** Shortcut that opens Settings, in the `Mod+,` notation. */
  settingsShortcut: string;
  onOpenRecent: (workspaceId: string) => void;
  onRemoveRecent: (workspaceId: string) => void;
  /** Key hints shown while a workspace is open and no file is. */
  hints: readonly StartHint[];
  /** The desktop installer to offer in the browser, standing in for the rail's link, or null where there is none. */
  desktopDownload?: DesktopDownload | null;
}

/**
 * How many recent workspaces the start screen lists: a shortcut back to the latest few, not every
 * workspace Vista remembers, which the switcher lists.
 */
export const MAX_RECENT_SHOWN = 5;

/** A row of the start screen's lists: icon, text, and an optional detail at the right end. */
const ROW_CLASS =
  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[13px] text-text transition-colors duration-100 hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]";
/**
 * A list heading; it shares the left edge of the rows' icons, and a rule runs from it to the rows'
 * right end, so the details aligned there have an edge to line up with.
 */
const HEADING_CLASS = "text-text-faint flex items-center gap-3 text-xs font-medium";

/** A list heading's text and its rule. */
function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className={HEADING_CLASS}>
      {children}
      <span aria-hidden="true" className="divider text-line min-w-0 flex-1" />
    </h2>
  );
}

/**
 * Fills the editor area while no file is open. While a folder is being opened or restored it shows
 * the loader. Without a workspace it shows the logo, the Start list (Open Folder, then Settings and
 * in the browser the desktop download, which stand in for the rail it hides), and the recent workspaces. With a workspace it shows only a few key hints: every action already has
 * its home in the shell, so the empty frame repeats none of them.
 *
 * @param props - StartScreen properties.
 * @returns Start screen element.
 */
export function StartScreen({
  hasWorkspace,
  isLoading,
  entrance = "opening",
  recents,
  onOpenFolder,
  onOpenSettings,
  settingsShortcut,
  onOpenRecent,
  onRemoveRecent,
  hints,
  desktopDownload = null,
}: StartScreenProps) {
  const downloadVersionId = useId();
  if (!hasWorkspace && isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <VistaLoader label="Opening folder…" className="h-10 w-12" />
      </div>
    );
  }

  if (hasWorkspace) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <dl className="text-text-faint grid grid-cols-[auto_auto] items-center gap-x-6 gap-y-2 text-[13px]">
          {hints.map((hint) => (
            <div key={hint.label} className="contents">
              <dt className="text-right">{hint.label}</dt>
              <dd>
                <kbd className="shortcut-key">{formatShortcut(hint.shortcut)}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto p-6">
      <Intro entrance={entrance}>
        <section aria-labelledby="start-list" className="flex flex-col gap-1.5">
          <Heading id="start-list">Start</Heading>
          <ul className="-mx-2 flex flex-col gap-px">
            <li>
              <button type="button" onClick={onOpenFolder} className={ROW_CLASS}>
                <i className="ic-folder-open text-text-muted flex-none text-base" aria-hidden="true" />
                <span className="text-text-strong flex-1">Open Folder…</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={onOpenSettings} className={ROW_CLASS}>
                <i className="ic-settings text-text-muted flex-none text-base" aria-hidden="true" />
                <span className="text-text-strong flex-1">Settings</span>
                <kbd aria-hidden="true" className="shortcut-key flex-none">
                  {formatShortcut(settingsShortcut)}
                </kbd>
              </button>
            </li>
            {desktopDownload && (
              <li>
                <a
                  href={desktopDownload.href}
                  // Like the rail's, so the click downloads rather than navigating away from the app.
                  download
                  // The label names the link and the version describes it, rather than both making up its name.
                  aria-label={desktopDownload.label}
                  aria-describedby={desktopDownload.version ? downloadVersionId : undefined}
                  className={ROW_CLASS}
                >
                  <i className="ic-monitor-down text-text-muted flex-none text-base" aria-hidden="true" />
                  <span className="text-text-strong flex-1">{desktopDownload.label}</span>
                  {desktopDownload.version && (
                    <span id={downloadVersionId} className="text-text-faint flex-none text-xs">
                      v{desktopDownload.version}
                    </span>
                  )}
                </a>
              </li>
            )}
          </ul>
        </section>
        {recents.length > 0 && (
          <section aria-labelledby="recent-workspaces" className="flex flex-col gap-1.5">
            <Heading id="recent-workspaces">Recent workspaces</Heading>
            <ul className="-mx-2 flex flex-col gap-px">
              {recents.slice(0, MAX_RECENT_SHOWN).map((workspace) => (
                <RecentEntry
                  key={workspace.id}
                  workspace={workspace}
                  onOpen={() => onOpenRecent(workspace.id)}
                  onRemove={() => onRemoveRecent(workspace.id)}
                />
              ))}
            </ul>
          </section>
        )}
      </Intro>
    </div>
  );
}

/** The still logo's height on the start screen, in pixels, and its width from the logo's proportions. */
const LOGO_HEIGHT_PX = 32;
const LOGO_WIDTH_PX = (LOGO_HEIGHT_PX * 250.93) / 78.32;
/** How much larger the logo writes itself before settling into place. */
const INTRO_SCALE = 2;
const SETTLE = { duration: 0.35, ease: [0.4, 0, 0.2, 1] } as const;
const REVEAL = { duration: 0.2, ease: [0.2, 0, 0, 1] } as const;

/** Whether the Single stroke intro has played in this run of the app; it plays at most once. */
let hasPlayedIntro = false;

/** Lets a test play the intro again. */
export function resetStartIntro() {
  hasPlayedIntro = false;
}

type IntroPhase = "write" | "settle" | "done";

/**
 * The start screen's column: the logo, then `children`. With the `single-stroke` entrance, the first
 * time in a run of the app, the logo writes itself large in the middle of the screen, settles into
 * its place, and only then do the lists fade in. Any key or click skips to the end, so nothing waits
 * on it, and with reduced motion it starts at the end. Otherwise the logo starts in its place and
 * plays the opening entrance beside the lists, which show at once.
 */
function Intro({ entrance, children }: { entrance: "single-stroke" | "opening"; children: ReactNode }) {
  const isReduced = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<IntroPhase>(() =>
    entrance === "single-stroke" && !hasPlayedIntro && !isReduced ? "write" : "done",
  );
  // The still logo that ends the Single stroke must not play the opening entrance after it.
  const [hasWritten] = useState(phase === "write");
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (hasWritten) {
      hasPlayedIntro = true;
    }
  }, [hasWritten]);

  // Where the logo writes: the middle of the area the start screen fills, measured from its place.
  useLayoutEffect(() => {
    const area = screenRef.current?.parentElement?.getBoundingClientRect();
    const logo = logoRef.current?.getBoundingClientRect();
    if (area && logo) {
      setOffset({
        x: area.left + area.width / 2 - (logo.left + logo.width / 2),
        y: area.top + area.height / 2 - (logo.top + logo.height / 2),
      });
    }
  }, []);

  useEffect(() => {
    if (phase !== "write") {
      return;
    }
    const timer = window.setTimeout(() => setPhase("settle"), LOGO_WRITE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "done") {
      return;
    }
    const skip = () => setPhase("done");
    window.addEventListener("pointerdown", skip, true);
    window.addEventListener("keydown", skip, true);
    return () => {
      window.removeEventListener("pointerdown", skip, true);
      window.removeEventListener("keydown", skip, true);
    };
  }, [phase]);

  const isLarge = phase === "write" && offset !== null;
  return (
    <div ref={screenRef} className="my-auto flex w-full max-w-md flex-col gap-10">
      <h1 className="flex">
        {/* A span, as a heading holds only phrasing content. */}
        <motion.span
          ref={logoRef}
          initial={false}
          animate={isLarge ? { x: offset.x, y: offset.y, scale: INTRO_SCALE } : { x: 0, y: 0, scale: 1 }}
          transition={phase === "settle" ? SETTLE : { duration: 0 }}
          onAnimationComplete={() => setPhase((current) => (current === "settle" ? "done" : current))}
          style={{ height: LOGO_HEIGHT_PX, width: LOGO_WIDTH_PX }}
          className="relative flex-none"
        >
          {phase === "done" ? (
            <VistaLogo hasEntrance={entrance === "opening"} className="h-full w-full" />
          ) : (
            <>
              <LogoWrite height={LOGO_HEIGHT_PX} />
              <span className="visually-hidden">Vista</span>
            </>
          )}
        </motion.span>
      </h1>
      <motion.div
        initial={false}
        animate={phase === "done" ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={REVEAL}
        className="flex flex-col gap-10"
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * When a workspace was last opened, as a short date: "Today", "Yesterday", the month and day this
 * year, or the full date before that.
 */
export function formatLastOpened(timestamp: number, now = Date.now()): string {
  const day = new Date(timestamp);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (timestamp >= startOfToday) {
    return "Today";
  }
  // The local start of yesterday, not 24 hours back, since a day a clock change shifts is 23 or 25 hours.
  if (timestamp >= new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime()) {
    return "Yesterday";
  }
  return day.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: day.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

interface RecentEntryProps {
  workspace: RecentWorkspace;
  onOpen: () => void;
  onRemove: () => void;
}

function RecentEntry({ workspace, onOpen, onRemove }: RecentEntryProps) {
  const descriptionId = useId();
  const dateId = useId();
  const needsPermission = workspace.folders?.some((folder) => folder.status === "needs-permission") ?? false;
  // The folders are not listed: the name usually is the folder's, and Settings lists them.
  const description = needsPermission ? "Click to allow access" : undefined;
  const lastOpened =
    workspace.lastOpenedAt !== undefined && workspace.lastOpenedAt > 0
      ? formatLastOpened(workspace.lastOpenedAt)
      : null;
  const describedBy = [description === undefined ? null : descriptionId, lastOpened === null ? null : dateId]
    .filter((id) => id !== null)
    .join(" ");
  return (
    <li className="relative flex items-center">
      <button
        type="button"
        onClick={onOpen}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        className={`${ROW_CLASS} pr-10`}
      >
        <WorkspaceGlyph icon={workspace.icon} color={workspace.color} isTile className="text-xs" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-text-strong truncate">{workspace.name}</span>
          {description !== undefined && (
            <span id={descriptionId} aria-hidden="true" className="text-text-muted truncate text-xs">
              {description}
            </span>
          )}
        </span>
        {lastOpened !== null && (
          <span id={dateId} aria-hidden="true" className="text-text-faint flex-none text-xs">
            {lastOpened}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove "${workspace.name}" from Recent`}
        title="Remove from Recent"
        className="icon-button text-text-faint absolute right-1.5 size-6"
      >
        <i className="ic-x" aria-hidden="true" />
      </button>
    </li>
  );
}
