import { runCommand, shownShortcut, type Command } from "../../commands";
import { MENU_SEPARATOR, type MenuEntry } from "./menu";

/**
 * Lists commands as menu items, with their shortcuts, enabled states, and toggle states.
 *
 * @param ids - Command ids and `MENU_SEPARATOR`s, in menu order. An id with no command is left out.
 * @param commands - The commands to look the ids up in.
 */
export function commandMenuEntries(ids: readonly string[], commands: readonly Command[]): MenuEntry[] {
  return ids.flatMap((id): MenuEntry[] => {
    if (id === MENU_SEPARATOR) {
      return [MENU_SEPARATOR];
    }
    const command = commands.find((candidate) => candidate.id === id);
    if (!command) {
      return [];
    }
    return [
      {
        label: command.label,
        shortcut: shownShortcut(command),
        disabled: command.isEnabled === false,
        checked: command.isChecked,
        onSelect: () => void runCommand(command),
      },
    ];
  });
}
