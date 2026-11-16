import { useState } from "react";

import type { EditorSettings } from "../../domain/settings";
import { Tooltip } from "../feedback/tooltip";
import { Menu, MENU_SEPARATOR, type MenuEntry } from "../menu/menu";
import { EDITOR_OPTIONS } from "../settings/vista-sections";

/** Space between the button and its menu, in pixels. */
const MENU_GAP_PX = 4;

interface EditorSettingsMenuProps {
  settings: EditorSettings;
  onChange: (changes: Partial<EditorSettings>) => void;
  /** Opens the Editor section of Settings, from the menu's last item. */
  onOpenSettings: () => void;
}

/**
 * Gear button that opens the raw editor's settings as a menu of check items, followed by All
 * settings…, in the same menu the right-click menus use. The items mirror the Editor section of
 * Settings, with the same labels.
 *
 * @param props - EditorSettingsMenu properties.
 * @returns The button and, while open, its menu.
 */
export function EditorSettingsMenu({ settings, onChange, onOpenSettings }: EditorSettingsMenuProps) {
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const toggle = () => {
    if (anchor || !button) {
      setAnchor(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    // The menu opens at the button's left edge and moves inward only when it would overflow the viewport.
    setAnchor({ x: rect.left, y: rect.bottom + MENU_GAP_PX });
  };

  const items: MenuEntry[] = [
    ...EDITOR_OPTIONS.map(({ name, label }) => ({
      label,
      checked: settings[name],
      onSelect: () => onChange({ [name]: !settings[name] }),
    })),
    MENU_SEPARATOR,
    { label: "All settings…", onSelect: onOpenSettings },
  ];

  return (
    <>
      <Tooltip text="Editor settings" position="bottom">
        {(bubbleId) => (
          <button
            ref={setButton}
            type="button"
            onClick={toggle}
            aria-label="Editor settings"
            aria-haspopup="menu"
            aria-expanded={anchor !== null}
            aria-describedby={bubbleId}
            className="icon-button size-7 text-base"
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
