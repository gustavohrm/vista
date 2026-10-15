import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FileIcon } from "./file-icon";

function renderIconMarkup(extension: string): string {
  const { container, unmount } = render(<FileIcon extension={extension} />);
  const markup = container.querySelector("svg")?.outerHTML ?? "";
  unmount();
  return markup;
}

describe("FileIcon", () => {
  it("renders an svg icon for every extension", () => {
    for (const extension of ["md", "csv", "json", "png", "ts", "zip", ""]) {
      expect(renderIconMarkup(extension)).not.toBe("");
    }
  });

  it("renders the same icon for extensions in the same category", () => {
    expect(renderIconMarkup("md")).toBe(renderIconMarkup("txt"));
    expect(renderIconMarkup("png")).toBe(renderIconMarkup("svg"));
    expect(renderIconMarkup("ts")).toBe(renderIconMarkup("py"));
  });

  it("renders a distinct icon for each category", () => {
    const markups = ["md", "csv", "json", "png", "ts", "zip"].map(renderIconMarkup);
    expect(new Set(markups).size).toBe(markups.length);
  });

  it("applies the className to the wrapper around the icon", () => {
    const { container } = render(<FileIcon extension="md" className="text-text-secondary text-sm" />);
    expect(container.firstElementChild).toHaveClass("text-sm", "text-text-secondary");
  });
});
