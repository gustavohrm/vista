import { useId, useState } from "react";

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
import { GroupHeading, SectionHeading, SettingsGroup, SettingsRow, Switch } from "./settings-parts";

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** The segments of a choice of a few short options, in one hairline box like the view switch. */
const SEGMENT_CLASS =
  "text-text-muted hover:text-text has-checked:bg-selected has-checked:text-text-strong has-focus-visible:ring-1 has-focus-visible:ring-[var(--focus-ring)] relative flex h-6 cursor-pointer items-center rounded-[5px] px-3 text-[13px] transition-colors duration-100";

/**
 * The theme.
 *
 * @param props - The theme and the way to change it.
 * @returns Section content.
 */
export function AppearanceSection({ theme }: { theme: ThemeState }) {
  const name = useId();
  const labelId = useId();
  const descriptionId = useId();
  return (
    <>
      <SectionHeading title="Appearance" lead="How Vista looks, in every workspace." />
      <SettingsGroup>
        <SettingsRow
          label="Theme"
          labelId={labelId}
          description="System follows your operating system and changes with it."
          descriptionId={descriptionId}
        >
          <div
            role="radiogroup"
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            className="border-line flex rounded-md border p-0.5"
          >
            {THEME_OPTIONS.map(({ value, label }) => (
              <label key={value} className={SEGMENT_CLASS}>
                <input
                  type="radio"
                  name={name}
                  value={value}
                  checked={theme.preference === value}
                  onChange={() => theme.setPreference(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

/** The editor's switches, in the order Settings and the editor's gear menu list them, with the same labels. */
export const EDITOR_OPTIONS: readonly { name: keyof EditorSettings; label: string; description: string }[] = [
  { name: "lineNumbers", label: "Line numbers", description: "Numbers each line." },
  {
    name: "wordWrap",
    label: "Word wrap",
    description: `Breaks long lines at the window's edge instead of scrolling sideways. ${formatShortcut("Alt+Z")} switches it.`,
  },
  { name: "minimap", label: "Minimap", description: "Shows an outline of the whole file beside it." },
  { name: "vim", label: "Vim mode", description: "Edits with Vim's keys and modes." },
];

interface SettingsSectionProps {
  settings: Settings;
  onChange: (changes: SettingsChanges) => void;
}

/**
 * The raw editor's toggles.
 *
 * @param props - The settings and the way to change them.
 * @returns Section content.
 */
export function EditorSection({ settings, onChange }: SettingsSectionProps) {
  const idPrefix = useId();
  return (
    <>
      <SectionHeading title="Editor" lead="How the raw editor shows and edits text, in every workspace." />
      <SettingsGroup>
        {EDITOR_OPTIONS.map(({ name, label, description }) => (
          <SettingsRow
            key={name}
            label={label}
            htmlFor={`${idPrefix}-${name}`}
            description={description}
            descriptionId={`${idPrefix}-${name}-description`}
          >
            <Switch
              id={`${idPrefix}-${name}`}
              checked={settings.editor[name]}
              onChange={(checked) => onChange({ editor: { [name]: checked } })}
              describedBy={`${idPrefix}-${name}-description`}
            />
          </SettingsRow>
        ))}
      </SettingsGroup>
    </>
  );
}

/**
 * The size limit for opening a file.
 *
 * @param props - The settings and the way to change them.
 * @returns Section content.
 */
export function FilesSection({ settings, onChange }: SettingsSectionProps) {
  const sizeId = useId();
  const sizeHintId = useId();
  const [sizeDraft, setSizeDraft] = useState(String(settings.files.maxOpenSizeMb));
  const isSizeValid = sizeDraft.trim() !== "" && isValidOpenSizeMb(Number(sizeDraft.trim()));

  return (
    <>
      <SectionHeading title="Files" lead="Which files Vista opens, in every workspace." />
      <SettingsGroup>
        <SettingsRow
          label="Largest file to open (MB)"
          htmlFor={sizeId}
          descriptionId={sizeHintId}
          description={
            isSizeValid ? (
              "Larger files are not opened, so the editor stays responsive."
            ) : (
              <span role="alert" className="text-destructive">
                Enter a whole number from {MIN_OPEN_SIZE_MB} to {MAX_OPEN_SIZE_MB_LIMIT}. The limit stays at{" "}
                {settings.files.maxOpenSizeMb} MB.
              </span>
            )
          }
        >
          <input
            id={sizeId}
            type="number"
            inputMode="numeric"
            min={MIN_OPEN_SIZE_MB}
            max={MAX_OPEN_SIZE_MB_LIMIT}
            step={1}
            value={sizeDraft}
            aria-invalid={!isSizeValid || undefined}
            aria-describedby={sizeHintId}
            onChange={(event) => {
              setSizeDraft(event.target.value);
              const value = Number(event.target.value.trim());
              if (event.target.value.trim() !== "" && isValidOpenSizeMb(value)) {
                onChange({ files: { maxOpenSizeMb: value } });
              }
            }}
            className="ipt w-24 text-[13px]"
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

/**
 * Every command that has a key, including keys the editors handle themselves, under its category.
 *
 * @param props - Every command.
 * @returns Section content.
 */
export function ShortcutsSection({ commands }: { commands: readonly Command[] }) {
  const idPrefix = useId();
  const withKeys = commands.flatMap((command) => {
    const shortcut = command.shortcut ?? command.shortcutHint;
    return shortcut ? [{ id: command.id, label: command.label, category: command.category, shortcut }] : [];
  });
  const categories = COMMAND_CATEGORIES.map((category) => ({
    label: category,
    rows: withKeys.filter((row) => row.category === category),
  })).filter((category) => category.rows.length > 0);

  return (
    <>
      <SectionHeading title="Keyboard Shortcuts" lead="The keys for Vista's commands, the same in every workspace." />
      {categories.map((category, index) => (
        <div key={category.label}>
          <GroupHeading id={`${idPrefix}-${index}`} isFirst={index === 0}>
            {category.label}
          </GroupHeading>
          <div className="border-line rounded-[10px] border">
            <table
              aria-labelledby={`${idPrefix}-${index}`}
              className="w-full border-separate border-spacing-0 text-[13px]"
            >
              <tbody>
                {category.rows.map((row, rowIndex) => (
                  <tr key={row.id}>
                    <td className={`text-text py-2 pr-4 pl-4 ${rowIndex > 0 ? "border-line border-t" : ""}`}>
                      {row.label}
                    </td>
                    <td className={`py-2 pr-4 text-right ${rowIndex > 0 ? "border-line border-t" : ""}`}>
                      <kbd className="shortcut-key">{formatShortcut(row.shortcut)}</kbd>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

interface AboutSectionProps extends SettingsSectionProps {
  platform: string;
  version: string;
  onCheckForUpdates?: () => Promise<void>;
}

/**
 * The version, and the updater where the host has one.
 *
 * @param props - AboutSection properties.
 * @returns Section content.
 */
export function AboutSection({ platform, version, onCheckForUpdates, settings, onChange }: AboutSectionProps) {
  const [isChecking, setIsChecking] = useState(false);
  const checkAtStartupId = useId();

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
    <>
      <SectionHeading
        title="About"
        lead="Vista edits a folder of Markdown, CSV, and text files, as raw text or rendered."
      />
      <SettingsGroup>
        <SettingsRow
          label={`Vista ${version}`}
          description={`Running in the ${platform === "native" ? "desktop app" : "browser"}.`}
        >
          {onCheckForUpdates && (
            <button
              type="button"
              onClick={() => void checkForUpdates()}
              disabled={isChecking}
              aria-busy={isChecking || undefined}
              className="btn sm"
            >
              Check for Updates
            </button>
          )}
        </SettingsRow>
        {onCheckForUpdates && (
          <SettingsRow
            label="Check at startup"
            htmlFor={checkAtStartupId}
            description="Asks vista.coden.dev for a newer version each time Vista starts. Check for Updates works either way."
            descriptionId={`${checkAtStartupId}-description`}
          >
            <Switch
              id={checkAtStartupId}
              checked={settings.updates.checkAtStartup}
              onChange={(checked) => onChange({ updates: { checkAtStartup: checked } })}
              describedBy={`${checkAtStartupId}-description`}
            />
          </SettingsRow>
        )}
      </SettingsGroup>
    </>
  );
}
