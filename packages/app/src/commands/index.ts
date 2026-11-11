import { useEffect, useRef } from "react";

import { matchesShortcut } from "./shortcuts";

export { formatShortcut } from "./shortcuts";

/** An action the user can trigger from a shortcut, and later from menus and the command palette. */
export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  /** Disabled commands still swallow their shortcut, so Ctrl+S never falls through to the browser. */
  isEnabled?: boolean;
  run: () => void | Promise<void>;
}

/** Runs the command whose shortcut matches each keydown on the window. */
export function useCommandShortcuts(commands: readonly Command[]): void {
  // A ref keeps one listener for the app's lifetime while always reading the latest commands.
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const command = commandsRef.current.find((cmd) => cmd.shortcut && matchesShortcut(event, cmd.shortcut));
      if (!command) {
        return;
      }
      event.preventDefault();
      if (command.isEnabled === false) {
        return;
      }
      void runCommand(command);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

async function runCommand(command: Command): Promise<void> {
  try {
    await command.run();
  } catch (err) {
    console.error(`Command "${command.id}" failed:`, err);
  }
}
