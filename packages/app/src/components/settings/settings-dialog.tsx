import { useId, useRef, useState, type KeyboardEvent } from "react";

import { COMMAND_CATEGORIES, formatShortcut, type Command } from "../../commands";
import {
  isValidOpenSizeMb,
  MAX_OPEN_SIZE_MB_LIMIT,
  MIN_OPEN_SIZE_MB,
  type EditorSettings,
  type Settings,
} from "../../domain/settings";
import type { SettingsChanges } from "../../state/settings";
import type { ThemePreference, ThemeState } from "../../theme/theme-manager";
import { HelpDialog } from "../help/help-dialog";

/** A section of Settings, each one tab of the dialog. */
export type SettingsSection = "appearance" | "editor" | "files" | "shortcuts" | "about";

const SECTIONS: readonly { id: SettingsSection; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "editor", label: "Editor" },
  { id: "files", label: "Files" },
  { id: "shortcuts", label: "Keyboard Shortcuts" },
  { id: "about", label: "About" },
];

interface SettingsDialogProps {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  settings: Settings;
  onChange: (changes: SettingsChanges) => void;
  theme: ThemeState;
  /** Every command, for the Keyboard Shortcuts section. */
  commands: readonly Command[];
  platform: string;
  /** Vista's version, shown in About. */
  version: string;
  /** Checks for a newer version, for hosts with an updater. About offers no check without it. */
  onCheckForUpdates?: () => Promise<void>;
  onClose: () => void;
}

/**
 * Every setting, plus the keyboard shortcuts and About, as one dialog with a tab per section. Each
 * change applies as soon as it is made and valid.
 */
export function SettingsDialog({
  section,
  onSectionChange,
  settings,
  onChange,
  theme,
  commands,
  platform,
  version,
  onCheckForUpdates,
  onClose,
}: SettingsDialogProps) {
  const idPrefix = useId();
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabId = (id: SettingsSection) => `${idPrefix}-tab-${id}`;
  const panelId = `${idPrefix}-panel`;

  // Arrow keys move between sections and show each one, as in any tab list.
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = SECTIONS.findIndex(({ id }) => id === section);
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? SECTIONS[(index + 1) % SECTIONS.length]
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? SECTIONS[(index - 1 + SECTIONS.length) % SECTIONS.length]
          : event.key === "Home"
            ? SECTIONS[0]
            : event.key === "End"
              ? SECTIONS[SECTIONS.length - 1]
              : undefined;
    if (!next) {
      return;
    }
    event.preventDefault();
    onSectionChange(next.id);
    tabListRef.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(next.id))}`)?.focus();
  };

  return (
    <HelpDialog title="Settings" onClose={onClose} isWide>
      <div className="flex flex-col gap-4 pt-3 sm:flex-row">
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="vertical"
          className="flex flex-none [scrollbar-width:none] gap-0.5 overflow-x-auto sm:w-40 sm:flex-col"
        >
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              id={tabId(id)}
              type="button"
              role="tab"
              aria-selected={id === section}
              aria-controls={panelId}
              tabIndex={id === section ? 0 : -1}
              onClick={() => onSectionChange(id)}
              onKeyDown={handleTabKeyDown}
              className={`btn sm flex-none justify-start font-normal ${id === section ? "soft text-text-strong" : "ghost text-text-secondary"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(section)}
          className="min-h-72 min-w-0 flex-1 sm:min-h-80"
        >
          {section === "appearance" && <AppearanceSection theme={theme} />}
          {section === "editor" && <EditorSection settings={settings} onChange={onChange} />}
          {section === "files" && <FilesSection settings={settings} onChange={onChange} />}
          {section === "shortcuts" && <ShortcutsSection commands={commands} />}
          {section === "about" && (
            <AboutSection platform={platform} version={version} onCheckForUpdates={onCheckForUpdates} />
          )}
        </div>
      </div>
    </HelpDialog>
  );
}

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function AppearanceSection({ theme }: { theme: ThemeState }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-text-secondary pb-1 text-xs font-medium">Theme</legend>
      {THEME_OPTIONS.map(({ value, label }) => (
        <label key={value} className="text-body text-text flex items-center gap-2 py-1">
          <input
            type="radio"
            name={name}
            value={value}
            checked={theme.preference === value}
            onChange={() => theme.setPreference(value)}
          />
          {label}
        </label>
      ))}
      <p className="text-text-secondary pt-1 text-xs">System follows your operating system and changes with it.</p>
    </fieldset>
  );
}

const EDITOR_OPTIONS: { name: keyof EditorSettings; label: string }[] = [
  { name: "lineNumbers", label: "Line numbers" },
  { name: "wordWrap", label: "Word wrap" },
  { name: "minimap", label: "Minimap" },
  { name: "vim", label: "Vim mode" },
];

interface SettingsSectionProps {
  settings: Settings;
  onChange: (changes: SettingsChanges) => void;
}

function EditorSection({ settings, onChange }: SettingsSectionProps) {
  return (
    <fieldset>
      <legend className="text-text-secondary pb-1 text-xs font-medium">Raw editor</legend>
      {EDITOR_OPTIONS.map(({ name, label }) => (
        <label key={name} className="text-body text-text flex items-center gap-2 py-1">
          <input
            type="checkbox"
            checked={settings.editor[name]}
            onChange={(event) => onChange({ editor: { [name]: event.target.checked } })}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function FilesSection({ settings, onChange }: SettingsSectionProps) {
  const sizeId = useId();
  const sizeErrorId = useId();
  const [sizeDraft, setSizeDraft] = useState(String(settings.files.maxOpenSizeMb));
  const draftValue = Number(sizeDraft.trim());
  const isSizeValid = sizeDraft.trim() !== "" && isValidOpenSizeMb(draftValue);

  return (
    <div>
      <label htmlFor={sizeId} className="text-body text-text block py-1">
        Largest file to open (MB)
      </label>
      <input
        id={sizeId}
        type="number"
        inputMode="numeric"
        min={MIN_OPEN_SIZE_MB}
        max={MAX_OPEN_SIZE_MB_LIMIT}
        step={1}
        value={sizeDraft}
        aria-invalid={!isSizeValid || undefined}
        aria-describedby={sizeErrorId}
        onChange={(event) => {
          setSizeDraft(event.target.value);
          const value = Number(event.target.value.trim());
          if (event.target.value.trim() !== "" && isValidOpenSizeMb(value)) {
            onChange({ files: { maxOpenSizeMb: value } });
          }
        }}
        className="ipt w-32 text-[13px]"
      />
      <p
        id={sizeErrorId}
        role={isSizeValid ? undefined : "alert"}
        className={isSizeValid ? "text-text-secondary pt-1 text-xs" : "hint destructive pt-1 text-xs"}
      >
        {isSizeValid
          ? "Larger files are not opened, so the editor stays responsive."
          : `Enter a whole number from ${MIN_OPEN_SIZE_MB} to ${MAX_OPEN_SIZE_MB_LIMIT}. The limit stays at ${settings.files.maxOpenSizeMb} MB.`}
      </p>
    </div>
  );
}

/**
 * Lists every command that has a key, including keys the editors handle themselves, under its
 * category.
 */
function ShortcutsSection({ commands }: { commands: readonly Command[] }) {
  const withKeys = commands.flatMap((command) => {
    const shortcut = command.shortcut ?? command.shortcutHint;
    return shortcut ? [{ id: command.id, label: command.label, category: command.category, shortcut }] : [];
  });
  const sections = COMMAND_CATEGORIES.map((category) => ({
    label: category,
    rows: withKeys.filter((row) => row.category === category),
  })).filter((section) => section.rows.length > 0);

  return (
    <table className="text-body w-full border-separate border-spacing-0">
      {sections.map((section, index) => (
        <tbody key={section.label}>
          <tr>
            <th
              scope="rowgroup"
              colSpan={2}
              className={`text-text-secondary pb-1 text-left text-xs font-medium ${index === 0 ? "" : "pt-4"}`}
            >
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
  );
}

interface AboutSectionProps {
  platform: string;
  version: string;
  onCheckForUpdates?: () => Promise<void>;
}

function AboutSection({ platform, version, onCheckForUpdates }: AboutSectionProps) {
  const [isChecking, setIsChecking] = useState(false);

  const checkForUpdates = async () => {
    if (!onCheckForUpdates) {
      return;
    }
    setIsChecking(true);
    try {
      await onCheckForUpdates();
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div>
      <p className="text-title-sm text-text-strong">Vista {version}</p>
      <p className="text-body text-text-secondary pt-2">
        Vista edits a folder of Markdown, CSV, and text files, as raw text or rendered. Running in the{" "}
        {platform === "native" ? "desktop app" : "browser"}.
      </p>
      {onCheckForUpdates && (
        <button
          type="button"
          onClick={() => void checkForUpdates()}
          disabled={isChecking}
          aria-busy={isChecking || undefined}
          className="btn sm mt-4"
        >
          Check for Updates
        </button>
      )}
    </div>
  );
}
