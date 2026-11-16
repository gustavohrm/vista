import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_TABLE_CELLS } from "../../domain/csv";
import type { DocumentLocation } from "../../domain/document-location";
import type { OpenDocument } from "../../state/documents";
import { StatusBar } from "./status-bar";

const file: OpenDocument = {
  key: "notes:deep.md",
  folderId: "notes",
  path: "deep.md",
  name: "deep.md",
  extension: "md",
  content: "# Deep\n",
  isDirty: false,
  viewMode: "raw",
  diskStat: { size: 7, modifiedAt: 0 },
  hasBom: false,
  isReadOnly: false,
  externalChange: null,
  revision: 0,
  isPending: false,
};

/** Lays out each path text as `characters × 8px` in a 200px bar, which jsdom does not measure. */
function stubLayout() {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    return (this.textContent?.length ?? 0) * 8;
  });
}

describe("StatusBar path", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shortens a path deeper than React's nested update limit without overflowing it", () => {
    stubLayout();
    const segments = ["", ...Array.from({ length: 80 }, (_, index) => `folder-${index}`), "deep.md"];
    const location: DocumentLocation = { segments, separator: "/" };

    render(<StatusBar activeFile={file} location={location} />);

    const text = screen.getByText("deep.md").parentElement as HTMLElement;
    // Hiding 79 of the 80 folders is the first candidate that fits, 19 characters wide.
    expect(text.textContent).toBe("/folder-0/…/deep.md");
  });

  it("hides only as many segments as it takes to fit", () => {
    stubLayout();
    const location: DocumentLocation = { segments: ["", "home", "me", "notes", "docs", "deep.md"], separator: "/" };

    render(<StatusBar activeFile={file} location={location} />);

    // `/home/me/notes/docs/deep.md` is 27 characters, 216px; hiding one segment leaves 23, 184px.
    const text = screen.getByText("deep.md").parentElement as HTMLElement;
    expect(text.textContent).toBe("/home/me/…/docs/deep.md");
  });
});

describe("StatusBar notes", () => {
  const location: DocumentLocation = { segments: ["data.csv"], separator: "/" };

  it("says when a CSV has too many cells for the table", () => {
    const content = Array.from({ length: MAX_TABLE_CELLS + 1 }, (_, index) => `${index}`).join("\n");
    render(<StatusBar activeFile={{ ...file, name: "data.csv", extension: "csv", content }} location={location} />);

    expect(screen.getByText("Raw only")).toHaveAttribute(
      "title",
      expect.stringContaining(`${MAX_TABLE_CELLS.toLocaleString("en-US")} cells`),
    );
  });

  it("says nothing for a CSV the table can show", () => {
    render(
      <StatusBar
        activeFile={{ ...file, name: "data.csv", extension: "csv", content: "a,b\n1,2\n" }}
        location={location}
      />,
    );

    expect(screen.queryByText("Raw only")).not.toBeInTheDocument();
  });
});
