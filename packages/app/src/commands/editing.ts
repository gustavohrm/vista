import { redo, selectAll, undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";

/** An Edit menu action, applied to the focused text field or editor. */
export type EditingAction = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";

const CODEMIRROR_COMMANDS = { undo, redo, selectAll } as const;

/**
 * Finds the CodeMirror editor an element belongs to.
 *
 * @param element - An element inside the editor, such as the focused one.
 * @returns The editor's view, or null when the element is not in one.
 */
export function findCodeMirrorView(element: Element | null): EditorView | null {
  const root = element?.closest(".cm-editor");
  return root instanceof HTMLElement ? EditorView.findFromDOM(root) : null;
}

/**
 * Applies an editing action to the focused element, as its own key would. CodeMirror gets its own
 * commands: it draws only the lines in view, so the browser's select all and undo would miss the
 * rest. Every other field, including the rendered Markdown editor, gets the browser's commands,
 * which those editors handle as they handle the keys.
 *
 * @param action - The action to apply.
 * @param target - The element to apply it to. Defaults to the focused element.
 * @returns False when paste could not read the clipboard, so the caller can say how to paste
 *   instead; true otherwise.
 */
export async function runEditingAction(
  action: EditingAction,
  target: Element | null = document.activeElement,
): Promise<boolean> {
  const view = findCodeMirrorView(target);
  if (action === "paste") {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch (err) {
      console.error("Failed to read the clipboard:", err);
      return false;
    }
    if (view) {
      view.dispatch({ ...view.state.replaceSelection(text), userEvent: "input.paste", scrollIntoView: true });
    } else {
      execCommand("insertText", text);
    }
    return true;
  }
  if (view && action !== "cut" && action !== "copy") {
    CODEMIRROR_COMMANDS[action](view);
    return true;
  }
  // CodeMirror handles the cut and copy events these raise, as it does for the keys.
  execCommand(action);
  return true;
}

function execCommand(command: string, value?: string): void {
  // jsdom has no execCommand. Browsers deprecate it but offer no replacement that keeps undo.
  if (typeof document.execCommand === "function") {
    // oxlint-disable-next-line typescript/no-deprecated -- see above
    document.execCommand(command, false, value);
  }
}
