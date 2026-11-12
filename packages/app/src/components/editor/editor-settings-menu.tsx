import { useState } from "react";

import type { EditorSettings } from "../../domain/settings";
import { Tooltip } from "../feedback/tooltip";
import { Menu, type MenuItem } from "../menu/menu";

/** Space between the button and its menu, in pixels. */
const MENU_GAP_PX = 4;

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
 * Gear button that opens the raw editor settings as a menu of check items, the same menu the
 * menu bar and the right-click menus use.
 *
 * @param props - EditorSettingsMenu properties.
 * @returns The button and, while open, its menu.
 */
export function EditorSettingsMenu({ settings, onChange }: EditorSettingsMenuProps) {
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const toggle = () => {
    if (anchor || !button) {
      setAnchor(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    // The menu keeps itself inside the viewport, so it ends up right-aligned under the button.
    setAnchor({ x: rect.left, y: rect.bottom + MENU_GAP_PX });
  };

  const items: MenuItem[] = SETTING_LABELS.map(({ name, label }) => ({
    label,
    checked: settings[name],
    onSelect: () => onChange({ [name]: !settings[name] }),
  }));

  return (
    <>
      <Tooltip text="Editor settings" position="bottom" align="end">
        {(bubbleId) => (
          <button
            ref={setButton}
            type="button"
            onClick={toggle}
            aria-label="Editor settings"
            aria-haspopup="menu"
            aria-expanded={anchor !== null}
            aria-describedby={bubbleId}
            className={anchor ? "btn soft icon sm" : "btn ghost icon sm"}
          >
            <i className="ic-settings-2" aria-hidden="true" />
          </button>
        )}
      </Tooltip>
      {anchor && (
        <Menu
          label="Editor settings"
          items={items}
          x={anchor.x}
          y={anchor.y}
          onClose={() => setAnchor(null)}
          returnFocusTo={button}
          ignorePointerDownIn={button}
        />
      )}
    </>
  );
}
