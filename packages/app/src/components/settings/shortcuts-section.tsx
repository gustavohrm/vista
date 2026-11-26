import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  categoryLabel,
  changeShortcuts,
  COMMAND_CATEGORIES,
  formatShortcut,
  isRebindable,
  sameKeys,
  shortcutOwner,
  type Command,
  type StoredShortcuts,
} from "../../commands";
import { editorShortcuts } from "../../commands/keymap";
import {
  BROWSER_KEPT_SHORTCUTS,
  normalizeShortcut,
  shortcutFromEvent,
  shortcutRefusal,
} from "../../commands/shortcuts";
import { t, useLocale } from "../../i18n";
import { useToast } from "../feedback/toast";
import { Tooltip } from "../feedback/tooltip";
import { GroupHeading, SectionHeading } from "./settings-parts";

interface ShortcutsSectionProps {
  /** Every command, with its keys resolved. */
  commands: readonly Command[];
  /** The host, which decides the keys the browser keeps. */
  platform: string;
  /** The user's choices as stored. */
  stored: StoredShortcuts;
  /** Stores new choices. */
  onChange: (shortcuts: Record<string, string[]>) => void;
}

/** A key that needs the user's word before it moves from one command to another. */
interface Conflict {
  /** The command the key goes to. */
  commandId: string;
  key: string;
  /** The command that has the key now. */
  owner: Command;
  /** Whether the key is being added, or restored by Reset to Default. */
  action: "add" | "reset";
}

/**
 * Every command by category, with its keys, which the user can add to, remove, and reset. Keys an
 * editor handles are shown but cannot be changed.
 *
 * @param props - The commands and the stored choices.
 * @returns Section content.
 */
export function ShortcutsSection({ commands, platform, stored, onChange }: ShortcutsSectionProps) {
  const idPrefix = useId();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const apply = (changes: Readonly<Record<string, readonly string[] | null>>) =>
    onChange(changeShortcuts(commands, stored, changes));

  const stopRecording = () => {
    setRecordingId(null);
    setMessage(null);
    setConflict(null);
  };

  const startRecording = (commandId: string) => {
    setRecordingId(commandId);
    setMessage(null);
    setConflict(null);
  };

  const handleRecordKeyDown = (command: Command, event: ReactKeyboardEvent<HTMLElement>) => {
    // Tab moves focus, which ends recording, so the keyboard never traps the user here.
    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      return;
    }
    // No key pressed here reaches the window's shortcuts, Settings' Escape, or the browser.
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      stopRecording();
      return;
    }
    const key = shortcutFromEvent(event.nativeEvent);
    if (key === null) {
      return;
    }
    setConflict(null);
    const refusal = refusalMessage(key, command, commands, platform);
    if (refusal) {
      setMessage(refusal);
      return;
    }
    const owner = shortcutOwner(commands, key);
    if (owner) {
      setMessage(null);
      setConflict({ commandId: command.id, key, owner, action: "add" });
      return;
    }
    apply({ [command.id]: [...(command.shortcuts ?? []), key] });
    stopRecording();
  };

  const replace = (target: Conflict) => {
    const receiver = commands.find((command) => command.id === target.commandId);
    const ownerKeys = (target.owner.shortcuts ?? []).filter((key) => key !== target.key);
    apply({
      [target.owner.id]: ownerKeys,
      [target.commandId]: target.action === "reset" ? null : [...(receiver?.shortcuts ?? []), target.key],
    });
    stopRecording();
  };

  const reset = (command: Command) => {
    const taken = (command.defaultShortcuts ?? [])
      .map((key) => ({ key, owner: shortcutOwner(commands, key) }))
      .find((entry) => entry.owner !== undefined && entry.owner.id !== command.id);
    if (taken?.owner) {
      setRecordingId(null);
      setMessage(null);
      setConflict({
        commandId: command.id,
        key: taken.key,
        owner: taken.owner,
        action: "reset",
      });
      return;
    }
    apply({ [command.id]: null });
  };

  const resetAll = async () => {
    const confirmed = await toast.confirm({
      message: t("settings.shortcuts.resetAllConfirm"),
      confirmLabel: t("settings.shortcuts.reset"),
    });
    if (confirmed) {
      stopRecording();
      onChange({});
    }
  };

  const search = query.trim().toLowerCase();
  const matches = (command: Command) =>
    search === "" ||
    command.label.toLowerCase().includes(search) ||
    [...(command.shortcuts ?? []), ...(command.shortcutHint ? [command.shortcutHint] : [])].some((key) =>
      formatShortcut(key).toLowerCase().includes(search),
    );
  const categories = COMMAND_CATEGORIES.map((category) => ({
    id: category,
    rows: commands.filter((command) => command.category === category && matches(command)),
  })).filter((category) => category.rows.length > 0);
  const hasChanges = Object.keys(stored).length > 0;

  return (
    <>
      <SectionHeading
        title={t("settings.shortcuts.title")}
        lead={t("settings.shortcuts.lead")}
        action={
          hasChanges && (
            <button type="button" onClick={() => void resetAll()} className="btn sm flex-none">
              {t("settings.shortcuts.resetAll")}
            </button>
          )
        }
      />
      <input
        type="search"
        aria-label={t("settings.shortcuts.search")}
        placeholder={t("settings.shortcuts.search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="ipt mb-2 w-full text-[13px]"
      />
      {categories.length === 0 && (
        <p className="text-text-muted mt-6 text-[13px] leading-5">
          {t("settings.shortcuts.noResults", { query: query.trim() })}
        </p>
      )}
      {categories.map((category, index) => (
        <div key={category.id}>
          <GroupHeading id={`${idPrefix}-${index}`} isFirst={index === 0}>
            {categoryLabel(category.id)}
          </GroupHeading>
          <ul aria-labelledby={`${idPrefix}-${index}`} className="border-line rounded-[10px] border text-[13px]">
            {category.rows.map((command, rowIndex) => (
              <ShortcutRow
                key={command.id}
                command={command}
                isFirst={rowIndex === 0}
                platform={platform}
                isRecording={recordingId === command.id}
                message={recordingId === command.id ? message : null}
                conflict={conflict?.commandId === command.id ? conflict : null}
                onStartRecording={() => startRecording(command.id)}
                onStopRecording={stopRecording}
                onRecordKeyDown={(event) => handleRecordKeyDown(command, event)}
                onRemove={(key) =>
                  apply({
                    [command.id]: (command.shortcuts ?? []).filter((item) => item !== key),
                  })
                }
                onReset={() => reset(command)}
                onReplace={replace}
                onCancelConflict={(current) =>
                  current.action === "add" ? startRecording(current.commandId) : stopRecording()
                }
              />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

interface ShortcutRowProps {
  command: Command;
  isFirst: boolean;
  platform: string;
  isRecording: boolean;
  message: string | null;
  conflict: Conflict | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onRecordKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onRemove: (key: string) => void;
  onReset: () => void;
  onReplace: (conflict: Conflict) => void;
  onCancelConflict: (conflict: Conflict) => void;
}

function ShortcutRow({
  command,
  isFirst,
  platform,
  isRecording,
  message,
  conflict,
  onStartRecording,
  onStopRecording,
  onRecordKeyDown,
  onRemove,
  onReset,
  onReplace,
  onCancelConflict,
}: ShortcutRowProps) {
  const descriptionId = useId();
  const locale = useLocale();
  const border = isFirst ? "" : "border-line border-t";
  const rebindable = isRebindable(command);
  const keys = command.shortcuts ?? [];
  const defaults = command.defaultShortcuts ?? [];
  const isChanged = rebindable && !sameKeys(keys, defaults);
  const addRef = useRef<HTMLButtonElement>(null);
  const wasRecording = useRef(isRecording);

  // Recording ends by removing the cell, and removing a key removes its button, which would drop
  // focus to the page, where Escape no longer closes Settings. Focus goes to Add Shortcut instead,
  // unless the user already moved it elsewhere.
  const keepFocusInRow = () => {
    if (document.activeElement === null || document.activeElement === document.body) {
      addRef.current?.focus();
    }
  };
  useEffect(() => {
    if (wasRecording.current && !isRecording) {
      keepFocusInRow();
    }
    wasRecording.current = isRecording;
  }, [isRecording]);

  // Leaving the cell ends recording, unless focus moved to the question below it.
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    const row = event.currentTarget.closest("li");
    if (!(event.relatedTarget instanceof Node && row?.contains(event.relatedTarget))) {
      onStopRecording();
    }
  };

  const description = !rebindable
    ? t("settings.shortcuts.editorKey")
    : isChanged
      ? defaults[0] !== undefined
        ? t("settings.shortcuts.default", { key: formatShortcut(defaults[0]) })
        : t("settings.shortcuts.defaultNone")
      : null;

  return (
    <li className={`group/row px-4 py-2 ${border}`}>
      <div className="flex min-h-7 items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-text flex items-center gap-1.5 leading-5">
            {isChanged && (
              <span
                className="bg-action size-1.5 flex-none rounded-full"
                aria-label={t("settings.shortcuts.changed")}
              />
            )}
            {command.label}
          </div>
          {description && (
            <div id={descriptionId} className="text-text-muted text-[12px] leading-[18px]">
              {description}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {!rebindable && command.shortcutHint && (
            <kbd className="shortcut-key">{formatShortcut(command.shortcutHint)}</kbd>
          )}
          {rebindable && keys.length === 0 && !isRecording && (
            <span className="text-text-faint">{t("settings.shortcuts.none")}</span>
          )}
          {rebindable &&
            keys.map((key) => (
              <span key={key} className="inline-flex items-center">
                <kbd className="shortcut-key">{formatShortcut(key)}</kbd>
                <button
                  type="button"
                  onClick={() => {
                    onRemove(key);
                    requestAnimationFrame(keepFocusInRow);
                  }}
                  aria-label={t("settings.shortcuts.remove", {
                    key: formatShortcut(key),
                  })}
                  className="icon-button size-5 text-[13px] opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100"
                >
                  <i className="ic-x" aria-hidden="true" />
                </button>
              </span>
            ))}
          {isRecording && (
            // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- a key-capture field; no native element records a key press
            <span
              ref={(element) => element?.focus()}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an input would type the key's character and open the IME; this field only records a key press
              role="textbox"
              tabIndex={0}
              aria-label={t("settings.shortcuts.recordFor", {
                command: command.label,
              })}
              onKeyDown={onRecordKeyDown}
              onBlur={handleBlur}
              className="shortcut-key border-action text-text ring-action/30 ring-2 outline-none"
            >
              {t("settings.shortcuts.press")}
            </span>
          )}
          {rebindable && !isRecording && (
            <Tooltip text={t("settings.shortcuts.add")} position="bottom" className="flex flex-none">
              {(bubbleId) => (
                <button
                  ref={addRef}
                  type="button"
                  onClick={onStartRecording}
                  aria-label={t("settings.shortcuts.addFor", {
                    command: command.label,
                  })}
                  aria-describedby={bubbleId}
                  className="icon-button size-6 text-[15px] opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100"
                >
                  <i className="ic-plus" aria-hidden="true" />
                </button>
              )}
            </Tooltip>
          )}
          {isChanged && !isRecording && (
            <Tooltip text={t("settings.shortcuts.resetOne")} position="bottom" className="flex flex-none">
              {(bubbleId) => (
                <button
                  type="button"
                  onClick={onReset}
                  aria-label={t("settings.shortcuts.resetFor", {
                    command: command.label,
                  })}
                  aria-describedby={bubbleId}
                  className="icon-button size-6 text-[15px] opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100"
                >
                  <i className="ic-rotate-ccw" aria-hidden="true" />
                </button>
              )}
            </Tooltip>
          )}
        </div>
      </div>
      {isRecording && platform !== "native" && !message && !conflict && (
        <p className="text-text-muted mt-1 text-right text-[12px] leading-[18px]">
          {t("settings.shortcuts.browserKeeps", {
            keys: new Intl.ListFormat(locale, { type: "conjunction" }).format(
              BROWSER_KEPT_SHORTCUTS.map(formatShortcut),
            ),
          })}
        </p>
      )}
      {message && (
        <p role="alert" className="text-text-muted mt-1 text-right text-[12px] leading-[18px]">
          {message}
        </p>
      )}
      {conflict && (
        <div role="alert" className="mt-1 flex items-center justify-end gap-2 text-[12px] leading-[18px]">
          <span className="text-text-muted">
            {t("settings.shortcuts.inUse", {
              key: formatShortcut(conflict.key),
              command: conflict.owner.label,
            })}
          </span>
          <button type="button" onClick={() => onReplace(conflict)} className="btn sm primary">
            {t("settings.shortcuts.replace")}
          </button>
          <button type="button" onClick={() => onCancelConflict(conflict)} className="btn sm">
            {t("common.cancel")}
          </button>
        </div>
      )}
    </li>
  );
}

/** Says why a key cannot be added to a command, or returns null when it can. */
function refusalMessage(key: string, command: Command, commands: readonly Command[], platform: string): string | null {
  const shown = formatShortcut(key);
  if (command.shortcuts?.includes(normalizeShortcut(key))) {
    return t("settings.shortcuts.refused.already", {
      command: command.label,
      key: shown,
    });
  }
  switch (shortcutRefusal(key, platform, editorShortcuts(commands))) {
    case "no-modifier":
      return t("settings.shortcuts.refused.noModifier", { key: shown });
    case "alt-graph":
      return t("settings.shortcuts.refused.altGraph", { key: shown });
    case "host":
      return t("settings.shortcuts.refused.host", { key: shown });
    case "editor": {
      const editorCommand = commands.find(
        (other) => other.shortcutHint && normalizeShortcut(other.shortcutHint) === normalizeShortcut(key),
      );
      return t("settings.shortcuts.refused.editor", {
        key: shown,
        command: editorCommand?.label ?? "",
      });
    }
    case null:
      return null;
  }
}
