import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import type { EditorSettings } from "../../domain/settings";
import { Tooltip } from "../feedback/tooltip";

interface EditorSettingsMenuProps {
  settings: EditorSettings;
  onChange: (changes: Partial<EditorSettings>) => void;
}

const SETTING_LABELS: { name: keyof EditorSettings; label: string }[] = [
  { name: "lineNumbers", label: "Line numbers" },
  { name: "wordWrap", label: "Word wrap" },
  { name: "minimap", label: "Minimap" },
  { name: "vim", label: "Vim mode" },
];

/**
 * Gear button that opens a popover of raw editor switches. The popover closes on Escape, which
 * returns focus to the button, and on a click outside it.
 *
 * @param props - EditorSettingsMenu properties.
 * @returns The button and, while open, its popover.
 */
export function EditorSettingsMenu({ settings, onChange }: EditorSettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape anywhere in the menu closes it; the controls inside are the interactive elements
    <div ref={containerRef} onKeyDown={handleKeyDown} className="relative flex flex-none">
      <Tooltip text="Editor settings" position="bottom" align="end">
        {(bubbleId) => (
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-label="Editor settings"
            aria-expanded={isOpen}
            aria-controls={isOpen ? popoverId : undefined}
            aria-describedby={bubbleId}
            className={isOpen ? "btn soft icon sm" : "btn ghost icon sm"}
          >
            <i className="ic-settings" aria-hidden="true" />
          </button>
        )}
      </Tooltip>
      {isOpen && (
        <fieldset
          id={popoverId}
          className="card soft floating absolute top-full right-0 z-20 mt-1 flex w-52 flex-col p-1 text-xs"
        >
          <legend className="visually-hidden">Editor settings</legend>
          {SETTING_LABELS.map(({ name, label }) => (
            <label
              key={name}
              className="hover:bg-foreground flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5"
            >
              <span>{label}</span>
              <input
                type="checkbox"
                role="switch"
                checked={settings[name]}
                aria-checked={settings[name]}
                onChange={(event) => onChange({ [name]: event.target.checked })}
                className="switch primary"
              />
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
