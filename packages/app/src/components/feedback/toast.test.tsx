import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast, type ShowToastInput } from "./toast";

const TOAST_DURATION_MS = 5000;

function ToastTrigger({ input }: { input: ShowToastInput }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(input)}>
      Trigger
    </button>
  );
}

function ConfirmTrigger({ onResult }: { onResult: (confirmed: boolean) => void }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        const confirmed = await toast.confirm({
          title: 'Delete "notes.md"?',
          message: "This file will be permanently deleted.",
          confirmLabel: "Delete",
          destructive: true,
        });
        onResult(confirmed);
      }}
    >
      Ask
    </button>
  );
}

describe("ToastProvider", () => {
  it("shows an error message with role=alert", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTrigger input={{ kind: "error", text: "Something went wrong" }} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Trigger" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it.each(["info", "success"] as const)("shows a %s message with role=status", async (kind) => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTrigger input={{ kind, text: "Heads up" }} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Trigger" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Heads up");
  });

  it("stacks multiple messages", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTrigger input={{ kind: "info", text: "First" }} />
      </ToastProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Trigger" });
    await user.click(trigger);
    await user.click(trigger);

    expect(await screen.findAllByRole("status")).toHaveLength(2);
  });

  it("dismisses a message when its close button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTrigger input={{ kind: "info", text: "Dismiss me" }} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Trigger" }));
    await screen.findByText("Dismiss me");

    await user.click(screen.getByRole("button", { name: "Dismiss message" }));

    expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument();
  });

  it("auto-dismisses a message after the display duration", async () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <ToastTrigger input={{ kind: "info", text: "Fades away" }} />
        </ToastProvider>,
      );

      act(() => {
        screen.getByRole("button", { name: "Trigger" }).click();
      });
      expect(screen.getByText("Fades away")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(TOAST_DURATION_MS);
      });

      expect(screen.queryByText("Fades away")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("invokes the action callback without dismissing the message", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <ToastTrigger input={{ kind: "error", text: "Save failed", action: { label: "Retry", onClick: onAction } }} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Trigger" }));
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });

  it("resolves a confirmation to true when the user confirms", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <ToastProvider>
        <ConfirmTrigger onResult={onResult} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(onResult).toHaveBeenCalledWith(true);
  });

  it("resolves a confirmation to false when the user cancels", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <ToastProvider>
        <ConfirmTrigger onResult={onResult} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(onResult).toHaveBeenCalledWith(false);
  });

  it("resolves a confirmation to false when the user presses Escape", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <ToastProvider>
        <ConfirmTrigger onResult={onResult} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("button", { name: "Delete" });
    // jsdom does not raise the native cancel event for Escape, so it is dispatched directly.
    fireEvent(document.querySelector("dialog") as HTMLDialogElement, new Event("cancel", { cancelable: true }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("keeps showing messages after a StrictMode mount, unmount, and remount cycle", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <ToastProvider>
          <ToastTrigger input={{ kind: "info", text: "Still works" }} />
        </ToastProvider>
      </StrictMode>,
    );

    await user.click(screen.getByRole("button", { name: "Trigger" }));

    expect(await screen.findByText("Still works")).toBeInTheDocument();
  });

  it("removes its confirmation dialog from the document when unmounted", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ToastProvider>
        <ConfirmTrigger onResult={vi.fn()} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("button", { name: "Delete" });
    unmount();

    expect(document.querySelector("dialog")).toBeNull();
  });

  it("throws when useToast is called outside a ToastProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<ToastTrigger input={{ kind: "info", text: "x" }} />)).toThrow(
      "useToast must be used within a ToastProvider",
    );
    consoleError.mockRestore();
  });
});
