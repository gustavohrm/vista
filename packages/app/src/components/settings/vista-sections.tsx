import { useId, useState, type ReactNode } from "react";

import { COMMAND_CATEGORIES, formatShortcut, type Command } from "../../commands";
import {
  THEMES,
  type ContrastLevel,
  type ContrastPreference,
  type MotionPreference,
  type SchemePreference,
  type ThemeId,
} from "../../domain/appearance";
import type { ChangelogEntry } from "../../domain/changelog";
import {
  isValidOpenSizeMb,
  MAX_OPEN_SIZE_MB_LIMIT,
  MIN_OPEN_SIZE_MB,
  type EditorSettings,
  type Settings,
} from "../../domain/settings";
import type { SettingsChanges } from "../../state/settings";
import { useAppearanceLevels } from "../../theme/appearance";
import type { ThemeState } from "../../theme/theme-manager";
import { GroupHeading, SectionHeading, SettingsGroup, SettingsRow, Switch } from "./settings-parts";
import { formatReleaseDate, WhatsNewDialog } from "./whats-new-dialog";

const SCHEME_OPTIONS: readonly { value: SchemePreference; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <i className="ic-monitor text-sm" aria-hidden="true" /> },
  { value: "light", label: "Light", icon: <i className="ic-sun text-sm" aria-hidden="true" /> },
  { value: "dark", label: "Dark", icon: <i className="ic-moon text-sm" aria-hidden="true" /> },
];

type ContrastCard = Exclude<ContrastPreference, "system">;
type MotionCard = Exclude<MotionPreference, "system">;

const CONTRAST_CARDS: readonly { value: ContrastCard; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "more", label: "More" },
];

const MOTION_CARDS: readonly { value: MotionCard; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reduced", label: "Reduced" },
  { value: "none", label: "None" },
];

/** The segments of a choice of a few short options, in one hairline box like the view switch. */
const SEGMENT_CLASS =
  "text-text-muted hover:text-text has-checked:bg-selected has-checked:text-text-strong has-focus-visible:ring-1 has-focus-visible:ring-[var(--focus-ring)] relative flex h-6 cursor-pointer items-center gap-1.5 rounded-[5px] px-3 text-[13px] transition-colors duration-100";

/**
 * A choice of a few short options as one row of segments, named and described by its settings row.
 *
 * @param props - The options, each with an optional icon before its label, the one chosen, what to do on a choice, and the ids of the row's name and description.
 * @returns Radio group element.
 */
function SegmentedChoice<T extends string>({
  options,
  value,
  onChange,
  labelId,
  descriptionId,
}: {
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  labelId: string;
  descriptionId: string;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      className="border-line flex rounded-md border p-0.5"
    >
      {options.map((option) => (
        <label key={option.value} className={SEGMENT_CLASS}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.icon}
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** Each theme's class, written out whole, since Tailwind finds only literal class names. */
const THEME_CLASS: Record<ThemeId, string> = {
  daylight: "theme-daylight",
  neutral: "theme-neutral",
  ocean: "theme-ocean",
};

/**
 * A theme as a small window in its own colours, in the scheme now in effect: a title, lines of text,
 * a selection, and the primary action, on the frame within the chrome.
 *
 * @param props - The theme to show, and the contrast level to show it at.
 * @returns Decorative preview element.
 */
function ThemePreview({ theme, contrast }: { theme: ThemeId; contrast: ContrastLevel }) {
  return (
    <span
      aria-hidden="true"
      className={`${THEME_CLASS[theme]} ${contrast === "more" ? "contrast-more" : ""} bg-chrome block rounded-md p-1.5`}
    >
      <span className="bg-frame border-line flex h-14 flex-col gap-1.5 rounded-[5px] border p-2">
        <span className="bg-text-strong block h-1.5 w-1/2 rounded-full" />
        <span className="flex gap-1">
          <span className="bg-text-muted block h-1 w-1/4 rounded-full" />
          <span className="bg-selection block h-1 w-1/4 rounded-full" />
        </span>
        <span className="bg-text-faint block h-1 w-2/3 rounded-full" />
        <span className="bg-action mt-auto block h-2 w-1/4 self-end rounded-sm" />
      </span>
    </span>
  );
}

/**
 * A motion level as a mark on a track: it slides under All and fades in place under Reduced while
 * its card is pointed at or focused, and stays still under None, as `style.css` sets.
 *
 * @param props - The level to show.
 * @returns Decorative preview element.
 */
function MotionPreview({ level }: { level: MotionCard }) {
  return (
    <span aria-hidden="true" className="bg-chrome block rounded-md p-1.5">
      <span className="bg-frame border-line flex h-14 items-center rounded-[5px] border px-3">
        <span className="relative block h-2.5 w-full">
          <span className="bg-line absolute inset-x-0 top-1/2 block h-px" />
          <span
            data-preview={level}
            className={`vista-motion-mark bg-action absolute top-0 block size-2.5 rounded-full ${level === "all" ? "left-0" : "left-[calc(50%-0.3125rem)]"}`}
          />
        </span>
      </span>
    </span>
  );
}

/** A theme in the grid: its preview over its name, with the selected fill and edge once chosen. */
const THEME_CARD_CLASS =
  "text-text-muted hover:bg-hover hover:text-text has-checked:text-text-strong has-checked:bg-selected has-checked:shadow-[inset_0_0_0_1px_var(--color-line-strong)] has-focus-visible:ring-1 has-focus-visible:ring-[var(--focus-ring)] flex cursor-pointer flex-col gap-1.5 rounded-lg p-1.5 text-[12.5px] transition-colors duration-100";

/**
 * A choice among preview cards, with a _System_ badge on the card the operating system asks for.
 *
 * @param props - The cards, each with its preview; the one selected; the one the operating system
 *   asks for; what to do on a choice; the radio group's name and description; and a class for each card.
 * @returns Radio group element.
 */
function PreviewChoice<T extends string>({
  cards,
  value,
  systemValue,
  onChoose,
  labelId,
  descriptionId,
  cardClassName = "",
}: {
  cards: readonly { value: T; label: string; preview: ReactNode }[];
  value: T;
  systemValue: T;
  onChoose: (value: T) => void;
  labelId: string;
  descriptionId: string;
  cardClassName?: string;
}) {
  const name = useId();
  const badgeId = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      className="grid basis-full grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2"
    >
      {cards.map((card) => {
        const isSystem = card.value === systemValue;
        return (
          <label key={card.value} className={`${THEME_CARD_CLASS} ${cardClassName}`}>
            {/* Click as well as change: choosing the card already selected while Match system is on
                pins it, and a radio that is already checked fires no change. */}
            <input
              type="radio"
              name={name}
              value={card.value}
              checked={value === card.value}
              onChange={() => onChoose(card.value)}
              onClick={() => onChoose(card.value)}
              aria-describedby={isSystem ? badgeId : undefined}
              className="sr-only"
            />
            {card.preview}
            <span className="flex items-center justify-between gap-1 px-0.5">
              <span className="font-medium">{card.label}</span>
              {isSystem && (
                <span
                  id={badgeId}
                  aria-hidden="true"
                  className="border-line text-text-muted rounded border px-1 text-[10.5px] leading-4"
                >
                  System
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

interface AppearanceSectionProps {
  theme: ThemeState;
  settings: Settings;
  onChange: (changes: SettingsChanges) => void;
}

/**
 * The appearance in three groups: Color, which is the scheme and the theme; Contrast; and Motion.
 * Contrast and Motion offer _System_ as a Match system switch, as `docs/specs/appearance.md` describes.
 *
 * @param props - The theme, the saved contrast and motion, and the ways to change them.
 * @returns Section content.
 */
export function AppearanceSection({ theme, settings, onChange }: AppearanceSectionProps) {
  const idPrefix = useId();
  const id = (part: string) => `${idPrefix}-${part}`;
  const themeName = useId();
  const levels = useAppearanceLevels();
  const { contrast, motion } = settings.appearance;
  const systemMotion: MotionCard = levels.systemMotion === "reduce" ? "reduced" : "all";
  const shownContrast: ContrastCard = contrast === "system" ? levels.systemContrast : contrast;
  const shownMotion: MotionCard = motion === "system" ? systemMotion : motion;
  const chooseContrast = (value: ContrastPreference) => {
    if (value !== contrast) {
      onChange({ appearance: { contrast: value } });
    }
  };
  const chooseMotion = (value: MotionPreference) => {
    if (value !== motion) {
      onChange({ appearance: { motion: value } });
    }
  };
  return (
    <>
      <SectionHeading title="Appearance" lead="How Vista looks, in every workspace." />
      <GroupHeading id={id("color")} isFirst>
        Color
      </GroupHeading>
      <SettingsGroup labelledBy={id("color")}>
        <SettingsRow
          label="Scheme"
          labelId={id("scheme")}
          description="Light or dark. System follows your operating system and changes with it."
          descriptionId={id("scheme-description")}
        >
          <SegmentedChoice
            options={SCHEME_OPTIONS}
            value={theme.scheme}
            onChange={theme.setScheme}
            labelId={id("scheme")}
            descriptionId={id("scheme-description")}
          />
        </SettingsRow>
        <SettingsRow
          label="Theme"
          labelId={id("theme")}
          description="The interface's colours. Each theme has a light and a dark version."
          descriptionId={id("theme-description")}
        >
          <div
            role="radiogroup"
            aria-labelledby={id("theme")}
            aria-describedby={id("theme-description")}
            className="grid basis-full grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2"
          >
            {THEMES.map((option) => (
              <label key={option.id} className={THEME_CARD_CLASS}>
                <input
                  type="radio"
                  name={themeName}
                  value={option.id}
                  checked={theme.theme === option.id}
                  onChange={() => theme.setTheme(option.id)}
                  className="sr-only"
                />
                <ThemePreview theme={option.id} contrast={levels.contrast} />
                <span className="px-0.5 font-medium">{option.label}</span>
              </label>
            ))}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <GroupHeading id={id("contrast")}>Contrast</GroupHeading>
      <SettingsGroup labelledBy={id("contrast")}>
        <SettingsRow
          label="Match system"
          htmlFor={id("contrast-system")}
          description="Follows your operating system's contrast setting and changes with it."
          descriptionId={id("contrast-system-description")}
        >
          <Switch
            id={id("contrast-system")}
            checked={contrast === "system"}
            onChange={(checked) => chooseContrast(checked ? "system" : shownContrast)}
            describedBy={id("contrast-system-description")}
          />
        </SettingsRow>
        <SettingsRow
          label="Level"
          labelId={id("contrast-level")}
          description="More draws lines, borders, and faint text darker."
          descriptionId={id("contrast-description")}
        >
          <PreviewChoice
            cards={CONTRAST_CARDS.map((card) => ({
              ...card,
              preview: <ThemePreview theme={theme.theme} contrast={card.value} />,
            }))}
            value={shownContrast}
            systemValue={levels.systemContrast}
            onChoose={chooseContrast}
            labelId={id("contrast")}
            descriptionId={id("contrast-description")}
          />
        </SettingsRow>
      </SettingsGroup>

      <GroupHeading id={id("motion")}>Motion</GroupHeading>
      <SettingsGroup labelledBy={id("motion")}>
        <SettingsRow
          label="Match system"
          htmlFor={id("motion-system")}
          description="Follows your operating system's reduced-motion setting and changes with it."
          descriptionId={id("motion-system-description")}
        >
          <Switch
            id={id("motion-system")}
            checked={motion === "system"}
            onChange={(checked) => chooseMotion(checked ? "system" : shownMotion)}
            describedBy={id("motion-system-description")}
          />
        </SettingsRow>
        <SettingsRow
          label="Level"
          labelId={id("motion-level")}
          description="Reduced keeps fades and drops movement. None stops every animation. Point at a card to see it."
          descriptionId={id("motion-description")}
        >
          <PreviewChoice
            cards={MOTION_CARDS.map((card) => ({ ...card, preview: <MotionPreview level={card.value} /> }))}
            value={shownMotion}
            systemValue={systemMotion}
            onChoose={chooseMotion}
            labelId={id("motion")}
            descriptionId={id("motion-description")}
            cardClassName="vista-motion-card"
          />
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
  /** The running version's changelog entry, when the changelog publishes one. */
  entry?: ChangelogEntry;
  onCheckForUpdates?: () => Promise<void>;
}

/**
 * The version and what it changed, and the updater where the host has one.
 *
 * @param props - AboutSection properties.
 * @returns Section content.
 */
export function AboutSection({ platform, version, entry, onCheckForUpdates, settings, onChange }: AboutSectionProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [isWhatsNewShown, setIsWhatsNewShown] = useState(false);
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
          description={`${entry?.date ? `Released ${formatReleaseDate(entry.date)}. ` : ""}Running in the ${platform === "native" ? "desktop app" : "browser"}.`}
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
        {entry && (
          <SettingsRow label="What's New" description={entry.description || `The changes in Vista ${version}.`}>
            <button type="button" onClick={() => setIsWhatsNewShown(true)} className="btn sm">
              What&apos;s New
            </button>
          </SettingsRow>
        )}
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
      {entry && isWhatsNewShown && <WhatsNewDialog entry={entry} onClose={() => setIsWhatsNewShown(false)} />}
    </>
  );
}
