import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EditorSettings } from "../../domain/settings";
import type { OpenDocument } from "../../state/documents";
import { EditorPane } from "./editor-pane";

function csvDocument(key: string, content: string): OpenDocument {
  return {
    key,
    folderId: "notes",
    path: `${key}.csv`,
    name: `${key}.csv`,
    extension: "csv",
    content,
    isDirty: false,
    viewMode: "enriched",
    diskStat: { size: content.length, modifiedAt: 0 },
    hasBom: false,
    isReadOnly: false,
    externalChange: null,
    revision: 0,
    isPending: false,
  };
}

function renderPane(document: OpenDocument) {
  return (
    <EditorPane
      platform="web"
      document={document}
      onContentChange={vi.fn()}
      onCursorChange={vi.fn()}
      onVimModeChange={vi.fn()}
      rawEditorStates={new Map()}
      reservedShortcuts={[]}
      editorSettings={{} as EditorSettings}
      find={null}
      onFindClose={vi.fn()}
      pendingJump={null}
      onJumpApplied={vi.fn()}
      contextMenuItems={[]}
    />
  );
}

describe("EditorPane", () => {
  it("gives each CSV document its own table, so a row drag settling as the tab changes stays in its file", () => {
    // A drag's move lands after the row slides into place. A table shared between tabs would make that
    // move in the tab shown by then; its own table completes it, with its own file, as it unmounts.
    const { rerender } = render(renderPane(csvDocument("people", "Name\nAda\nBob\n")));
    const firstHandle = screen.getByRole("button", { name: "Move row 1" });

    rerender(renderPane(csvDocument("places", "Name\nOslo\nLima\n")));

    expect(screen.getByRole("button", { name: "Move row 1" })).not.toBe(firstHandle);
  });
});
