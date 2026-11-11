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

describe("MarkdownEditor images", () => {
  const IMAGE_MARKDOWN = "![A cat](img/cat.png)";

  it("shows an image from the loaded file and keeps the Markdown as written", async () => {
    const createObjectURL = vi.fn(() => "blob:cat");
    const revokeObjectURL = vi.fn();
    // jsdom has no object URLs.
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const loadImage = vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    const onChange = vi.fn();
    const { unmount } = render(<MarkdownEditor content={IMAGE_MARKDOWN} onChange={onChange} loadImage={loadImage} />);

    const image = await screen.findByRole("img", { name: "A cat" });
    await waitFor(() => expect(image).toHaveAttribute("src", "blob:cat"));
    expect(loadImage).toHaveBeenCalledWith("img/cat.png");
    expect(onChange).not.toHaveBeenCalled();

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cat");
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("shows a web URL as it is", async () => {
    const loadImage = vi.fn().mockResolvedValue("https://example.com/cat.png");
    render(<MarkdownEditor content={IMAGE_MARKDOWN} onChange={vi.fn()} loadImage={loadImage} />);

    const image = await screen.findByRole("img", { name: "A cat" });
    await waitFor(() => expect(image).toHaveAttribute("src", "https://example.com/cat.png"));
  });

  it("shows a placeholder naming an image that cannot be loaded", async () => {
    const loadImage = vi.fn().mockRejectedValue(new Error("File not found"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<MarkdownEditor content={IMAGE_MARKDOWN} onChange={vi.fn()} loadImage={loadImage} />);

    expect(await screen.findByRole("img", { name: "Image not shown: A cat" })).toHaveTextContent("A cat");
    vi.restoreAllMocks();
  });
});
