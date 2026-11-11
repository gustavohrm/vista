import { afterEach, describe, expect, it, vi } from "vitest";

import { runEditingAction } from "./editing";

describe("runEditingAction paste", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
    Reflect.deleteProperty(document, "execCommand");
    document.body.replaceChildren();
  });

  function setUp() {
    const execCommand = vi.fn(() => true);
    Object.assign(document, { execCommand });
    let resolveRead: (text: string) => void = () => {};
    const readText = () =>
      new Promise<string>((resolve) => {
        resolveRead = resolve;
      });
    // jsdom has no clipboard; user-event installs one only through its setup.
    Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
    const field = document.createElement("textarea");
    document.body.append(field);
    field.focus();
    return { execCommand, field, resolveRead: (text: string) => resolveRead(text) };
  }

  it("inserts the clipboard text into the field that asked for it", async () => {
    const { execCommand, field, resolveRead } = setUp();

    const result = runEditingAction("paste", field);
    resolveRead("hello");

    await expect(result).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("insertText", false, "hello");
  });

  it("cancels the paste when focus left the field while the clipboard was read", async () => {
    const { execCommand, field, resolveRead } = setUp();

    const result = runEditingAction("paste", field);
    field.blur();
    resolveRead("hello");

    await expect(result).resolves.toBe(true);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("reports a paste the browser did not insert", async () => {
    const { execCommand, field, resolveRead } = setUp();
    execCommand.mockReturnValue(false);

    const result = runEditingAction("paste", field);
    resolveRead("hello");

    await expect(result).resolves.toBe(false);
  });
});
