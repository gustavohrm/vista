import { useId, useState } from "react";

import {
  isValidOpenSizeMb,
  MAX_OPEN_SIZE_MB_LIMIT,
  MIN_OPEN_SIZE_MB,
  type EditorSettings,
  type Settings,
} from "../../domain/settings";
import type { SettingsChanges } from "../../state/settings";
import { HelpDialog } from "../help/help-dialog";

interface SettingsDialogProps {
  settings: Settings;
  onChange: (changes: SettingsChanges) => void;
  onClose: () => void;
}

const EDITOR_OPTIONS: { name: keyof EditorSettings; label: string }[] = [
  { name: "lineNumbers", label: "Line numbers" },
  { name: "wordWrap", label: "Word wrap" },
  { name: "minimap", label: "Minimap" },
  { name: "vim", label: "Vim mode" },
];

/** Every setting in one place. Each change applies as soon as it is made and valid. */
export function SettingsDialog({ settings, onChange, onClose }: SettingsDialogProps) {
  const sizeId = useId();
  const sizeErrorId = useId();
  const [sizeDraft, setSizeDraft] = useState(String(settings.files.maxOpenSizeMb));
  const draftValue = Number(sizeDraft.trim());
  const isSizeValid = sizeDraft.trim() !== "" && isValidOpenSizeMb(draftValue);

  return (
    <HelpDialog title="Settings" onClose={onClose}>
      <fieldset className="pt-3">
        <legend className="text-text-secondary pb-1 text-xs font-medium">Editor</legend>
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
      <fieldset className="pt-4">
        <legend className="text-text-secondary pb-1 text-xs font-medium">Files</legend>
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
      </fieldset>
    </HelpDialog>
  );
}
