import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./markdown-editor";

const TASK_LIST_MARKDOWN = "- [ ] a\n- [x] b\n- c";

describe("MarkdownEditor", () => {
  it("renders each task list item with a design-system checkbox in its checked state", async () => {
    render(<MarkdownEditor content={TASK_LIST_MARKDOWN} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    });
    const [unchecked, checked] = screen.getAllByRole("checkbox");
    expect(unchecked).toHaveClass("checkbox");
    expect(unchecked).not.toBeChecked();
    expect(checked).toHaveClass("checkbox");
    expect(checked).toBeChecked();
  });

  it("does not render a checkbox for a plain list item", async () => {
    render(<MarkdownEditor content={TASK_LIST_MARKDOWN} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("c")).toBeVisible();
    });
    expect(screen.getByText("c").closest("li")?.querySelector("input")).toBeNull();
  });

  it("names each task checkbox by the action a click would perform", async () => {
    render(<MarkdownEditor content={TASK_LIST_MARKDOWN} onChange={vi.fn()} />);

    expect(await screen.findByRole("checkbox", { name: "Mark task as done" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mark task as not done" })).toBeChecked();
  });

  it("reports the checked marker in Markdown when a task checkbox is clicked", async () => {
    const onChange = vi.fn();
    render(<MarkdownEditor content={TASK_LIST_MARKDOWN} onChange={onChange} />);
    const uncheckedTask = await screen.findByRole("checkbox", { name: "Mark task as done" });

    await userEvent.click(uncheckedTask);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining("[x] a"));
    });
    expect(uncheckedTask).toBeChecked();
  });

  it("renders the initial Markdown content as formatted output", async () => {
    render(<MarkdownEditor content={"# Hello Vista\n\n- one\n- two"} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Hello Vista", level: 1 })).toBeVisible();
    });
    expect(screen.getByText("one")).toBeVisible();
    expect(screen.getByText("two")).toBeVisible();
  });

  it("exposes an accessible, editable text region", async () => {
    render(<MarkdownEditor content="Some notes." onChange={vi.fn()} />);

    const editable = await screen.findByRole("textbox", { name: "Markdown Editor" });
    expect(editable).toHaveAttribute("contenteditable", "true");
  });

  it("shows the new document when remounted with a different key and content", async () => {
    const { rerender } = render(<MarkdownEditor key="file-a" content="# Document A" onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Document A" })).toBeVisible();
    });

    rerender(<MarkdownEditor key="file-b" content="# Document B" onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Document B" })).toBeVisible();
    });
    expect(screen.queryByRole("heading", { name: "Document A" })).not.toBeInTheDocument();
  });

  it("tears down the editor on unmount without throwing", async () => {
    const { unmount } = render(<MarkdownEditor content="# Hello" onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Hello" })).toBeVisible();
    });

    expect(() => unmount()).not.toThrow();
  });
});
