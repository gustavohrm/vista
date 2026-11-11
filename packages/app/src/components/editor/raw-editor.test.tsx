import { EditorView } from "@codemirror/view";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_RAW_EDITOR_OPTIONS, RawEditor } from "./raw-editor";
import type { RawEditorStateCache } from "./raw-editor";

type RawEditorProps = ComponentProps<typeof RawEditor>;

function renderEditor(overrides: Partial<RawEditorProps> = {}) {
  const props: RawEditorProps = {
    documentKey: "ws:a.txt",
    content: "first line\nsecond line",
    fileName: "a.txt",
    onChange: vi.fn(),
    onCursorChange: vi.fn(),
    stateCache: new Map(),
    ...overrides,
  };
  const result = render(<RawEditor {...props} />);
  return {
    ...result,
    props,
    rerenderWith: (next: Partial<RawEditorProps>) => {
      Object.assign(props, next);
      result.rerender(<RawEditor {...props} />);
    },
  };
}

function getEditor(fileName = "a.txt"): HTMLElement {
  return screen.getByRole("textbox", { name: `Raw text content of ${fileName}` });
}

function getView(fileName = "a.txt"): EditorView {
  const view = EditorView.findFromDOM(getEditor(fileName));
  if (!view) {
    throw new Error("The raw editor has no CodeMirror view.");
  }
  return view;
}

describe("RawEditor", () => {
  it("reports each edit with the full text", async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();

    await user.click(getEditor());
    await user.keyboard("{Control>}{End}{/Control}!");

    expect(props.onChange).toHaveBeenLastCalledWith("first line\nsecond line!");
  });

  it("does not undo newer typing when the buffer echoes an older edit late", () => {
    const { props, rerenderWith } = renderEditor({ content: "ab" });
    const view = getView();

    view.dispatch({ changes: { from: 2, insert: "c" } });
    view.dispatch({ changes: { from: 3, insert: "d" } });
    rerenderWith({ content: "abc" });
    rerenderWith({ content: "abcd" });

    expect(view.state.doc.toString()).toBe("abcd");
    expect(props.onChange).toHaveBeenCalledTimes(2);
  });

  it("applies a buffer change made elsewhere without reporting it as an edit", () => {
    const { props, rerenderWith } = renderEditor({ content: "hello world" });
    const view = getView();
    view.dispatch({ selection: { anchor: 11 } });

    rerenderWith({ content: "hello brave world" });

    expect(view.state.doc.toString()).toBe("hello brave world");
    expect(view.state.selection.main.head).toBe(17);
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("restores a tab's selection and undo history when switching back to it", async () => {
    const user = userEvent.setup();
    const stateCache: RawEditorStateCache = new Map();
    const { rerenderWith } = renderEditor({ stateCache });
    await user.click(getEditor());
    await user.keyboard("{Control>}{End}{/Control}!");
    const editedContent = getView().state.doc.toString();

    rerenderWith({ documentKey: "ws:b.txt", fileName: "b.txt", content: "other file" });
    expect(getView("b.txt").state.doc.toString()).toBe("other file");
    rerenderWith({ documentKey: "ws:a.txt", fileName: "a.txt", content: editedContent });

    expect(getView().state.selection.main.head).toBe(editedContent.length);
    await user.click(getEditor());
    await user.keyboard("{Control>}z{/Control}");
    expect(getView().state.doc.toString()).toBe("first line\nsecond line");
  });

  it("restores a tab's state after the editor remounts", () => {
    const stateCache: RawEditorStateCache = new Map();
    const { unmount } = renderEditor({ stateCache });
    getView().dispatch({ selection: { anchor: 3, head: 7 } });
    unmount();

    renderEditor({ stateCache });

    expect(getView().state.selection.main).toMatchObject({ anchor: 3, head: 7 });
  });

  it("reports the cursor line, column, and selection length", () => {
    const { props } = renderEditor();

    getView().dispatch({ selection: { anchor: 13, head: 18 } });

    expect(props.onCursorChange).toHaveBeenLastCalledWith({ line: 2, column: 8, selectionLength: 5 });
  });

  it("leaves reserved shortcuts to the app instead of handling them", async () => {
    const user = userEvent.setup();
    renderEditor({ reservedShortcuts: ["Mod+A"] });

    await user.click(getEditor());
    await user.keyboard("{Control>}a{/Control}");

    expect(getView().state.selection.main.empty).toBe(true);
  });

  it("handles keys that are not reserved", async () => {
    const user = userEvent.setup();
    renderEditor({ reservedShortcuts: ["Mod+S"] });

    await user.click(getEditor());
    await user.keyboard("{Control>}a{/Control}");

    expect(getView().state.selection.main).toMatchObject({ from: 0, to: 22 });
  });

  it("starts vim in normal mode when vim is enabled", async () => {
    const user = userEvent.setup();
    const { props } = renderEditor({ options: { ...DEFAULT_RAW_EDITOR_OPTIONS, vim: true } });

    await user.click(getEditor());
    await user.keyboard("x");

    expect(props.onChange).toHaveBeenLastCalledWith("irst line\nsecond line");
  });
});
