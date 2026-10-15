import { defaultValueCtx, Editor, editorViewOptionsCtx, nodeViewCtx, rootCtx } from "@milkdown/core";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { useEffect, useRef } from "react";

interface MarkdownEditorProps {
  /** Markdown content used to seed the editor when it mounts. */
  content: string;
  /** Callback fired with the serialized Markdown whenever the document changes. */
  onChange: (newContent: string) => void;
}

/*
 * ProseMirror node view types, derived from the slice Milkdown uses to register them. The
 * `@milkdown/prose` package that declares them is not a direct dependency of this package.
 */
type NodeViewEntry = ReturnType<typeof nodeViewCtx._typeInfo>[number];
type NodeViewConstructor = NodeViewEntry[1];
type ProseNode = Parameters<NodeViewConstructor>[0];
type ProseEditorView = Parameters<NodeViewConstructor>[1];
type ProseGetPos = Parameters<NodeViewConstructor>[2];
type ProseNodeView = ReturnType<NodeViewConstructor>;

/** Task list items carry a non-null `checked` attribute; plain list items carry `null`. */
function isTaskItem(node: ProseNode): boolean {
  return node.attrs.checked !== null;
}

function writeListItemAttributes(dom: HTMLElement, node: ProseNode): void {
  dom.dataset.label = node.attrs.label;
  dom.dataset.listType = node.attrs.listType;
  dom.dataset.spread = String(node.attrs.spread);
}

/**
 * Renders a `list_item` node, swapping in a checkbox view for GFM task items.
 *
 * Milkdown keeps the checked state on the node, so the checkbox must dispatch a transaction
 * instead of only changing the DOM. Otherwise the Markdown serializer and the dirty state would
 * never see the change.
 */
function createListItemView(node: ProseNode, view: ProseEditorView, getPos: ProseGetPos): ProseNodeView {
  return isTaskItem(node) ? createTaskItemView(node, view, getPos) : createPlainItemView(node);
}

/**
 * Mirrors the commonmark `list_item` markup. ProseMirror cannot decline a node view, so plain
 * items are rendered here instead of falling back to `toDOM`.
 */
function createPlainItemView(initialNode: ProseNode): ProseNodeView {
  const dom = document.createElement("li");
  writeListItemAttributes(dom, initialNode);

  return {
    dom,
    contentDOM: dom,
    update: (updated) => {
      if (isTaskItem(updated)) {
        return false;
      }
      writeListItemAttributes(dom, updated);
      return true;
    },
  };
}

function createTaskItemView(initialNode: ProseNode, view: ProseEditorView, getPos: ProseGetPos): ProseNodeView {
  let node = initialNode;
  const dom = document.createElement("li");
  const control = document.createElement("span");
  const checkbox = document.createElement("input");
  const contentDOM = document.createElement("div");

  dom.className = "task-list-item";
  dom.dataset.itemType = "task";
  // Non-editable so the checkbox is interactive inside the editable region and never receives text.
  control.className = "task-list-item-control";
  control.setAttribute("contenteditable", "false");
  checkbox.type = "checkbox";
  checkbox.className = "checkbox";
  control.append(checkbox);
  contentDOM.className = "task-list-item-content";
  dom.append(control, contentDOM);

  const render = (current: ProseNode) => {
    writeListItemAttributes(dom, current);
    dom.dataset.checked = String(current.attrs.checked);
    checkbox.checked = current.attrs.checked === true;
    checkbox.setAttribute("aria-label", checkbox.checked ? "Mark task as not done" : "Mark task as done");
  };
  render(node);

  // `change` fires after the native toggle, so the transaction stores the value the user chose.
  checkbox.addEventListener("change", () => {
    const position = getPos();
    const current = position === undefined ? null : view.state.doc.nodeAt(position);
    if (position === undefined || !current) {
      render(node);
      return;
    }
    view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...current.attrs, checked: checkbox.checked }));
  });

  return {
    dom,
    contentDOM,
    update: (updated) => {
      if (!isTaskItem(updated)) {
        return false;
      }
      node = updated;
      render(updated);
      return true;
    },
    // Keeps ProseMirror from treating the checkbox's own DOM changes or clicks as document edits.
    ignoreMutation: (mutation) =>
      control.contains(mutation.target) || (mutation.type === "attributes" && mutation.target === dom),
    stopEvent: (event) => event.target instanceof Node && control.contains(event.target),
  };
}

/**
 * WYSIWYG Markdown editor backed by Milkdown, rendering and editing formatted content in place.
 *
 * The editor owns its document once mounted: `content` only seeds the initial value, and edits
 * are reported through `onChange` rather than synchronized back from later `content` updates.
 * Callers that need the view to reflect a different document (such as switching the active file)
 * must remount this component, for example with a React `key`.
 *
 * @param props - MarkdownEditor properties.
 * @returns Editable rendered Markdown surface.
 */
export function MarkdownEditor({ content, onChange }: MarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The editor is seeded once, on mount, so the effect below reads the content from the first render.
  const initialContentRef = useRef(content);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialContentRef.current);
        ctx.set(editorViewOptionsCtx, { attributes: { "aria-label": "Markdown Editor" } });
        // Appended, not passed as `nodeViews` in editorViewOptionsCtx: core spreads that option
        // over its own node views, so it would replace them.
        const listItemView: NodeViewEntry = ["list_item", createListItemView];
        ctx.update(nodeViewCtx, (views) => [...views, listItemView]);
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener);

    const createEditor = async () => {
      try {
        await editor.create();
      } catch (error) {
        console.error("Failed to create Markdown editor", error);
      }
    };
    void createEditor();

    return () => {
      const destroyEditor = async () => {
        try {
          await editor.destroy();
        } catch (error) {
          console.error("Failed to destroy Markdown editor", error);
        }
      };
      void destroyEditor();
    };
    // Intentionally runs once per mount: `content` only seeds the initial document, and the
    // parent remounts this component (via `key`) when a different document should be shown.
  }, []);

  return <div ref={rootRef} className="markdown-editor bg-background h-full w-full overflow-y-auto p-8" />;
}
