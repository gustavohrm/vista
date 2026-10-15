import { createToaster, type Toaster, type ToasterConfig } from "@codenhub/toaster";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

/** Severity of a toast message, controlling its intent styling and accessible role. */
export type ToastKind = "error" | "info" | "success";

/** Inline action rendered on a toast, such as a retry or undo control. */
interface ToastActionInput {
  /** Text label of the action button. */
  label: string;
  /** Callback invoked when the user clicks the action button. */
  onClick: () => void;
}

/** Input for showing a new toast message. */
export interface ShowToastInput {
  /** Severity of the message. */
  kind: ToastKind;
  /** Human-readable message text. */
  text: string;
  /** Optional action button shown alongside the message. */
  action?: ToastActionInput;
}

/** Input for asking the user to confirm an operation in a modal dialog. */
interface ConfirmInput {
  /** Optional heading shown above the message. */
  title?: string;
  /** Question or explanation shown to the user. */
  message: string;
  /** Label of the affirmative button. */
  confirmLabel: string;
  /** Label of the negative button. Defaults to the toaster's own "Cancel" label when omitted. */
  cancelLabel?: string;
  /** Whether the affirmative action is destructive and should be styled as an error. */
  destructive?: boolean;
}

/** API exposed by the toast system for transient messages and modal confirmations. */
interface ToastApi {
  /**
   * Displays a transient message in the bottom-right corner. Messages auto-dismiss after a
   * fixed duration and can also be closed manually.
   */
  show(input: ShowToastInput): void;
  /**
   * Opens a modal confirmation dialog and waits for the user's decision.
   *
   * @returns `true` if the user confirmed, or `false` if they cancelled, pressed Escape, or the
   *   toaster was torn down while the dialog was open.
   */
  confirm(input: ConfirmInput): Promise<boolean>;
}

const TOASTER_CONFIG: ToasterConfig = {
  position: "bottom-right",
  closeButton: true,
  duration: 5000,
  // Lifts toasts clear of the 24px status bar along the bottom edge of the shell.
  margin: { y: "2.25rem" },
  labels: { dismiss: "Dismiss message" },
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Provides toast and confirmation APIs to descendants, backed by one `@codenhub/toaster` instance.
 * Mount once near the root of the application shell.
 *
 * @param props - Provider properties.
 * @returns Provider element wrapping children.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const toasterRef = useRef<Toaster | null>(null);

  // Created lazily rather than in an effect: child effects (such as startup restore) run before
  // this provider's effects, so they must be able to show messages immediately.
  const getToaster = useCallback((): Toaster => {
    if (!toasterRef.current) {
      toasterRef.current = createToaster(TOASTER_CONFIG);
    }
    return toasterRef.current;
  }, []);

  // `destroy()` is irreversible and makes later calls throw. Under StrictMode the effect runs,
  // cleans up, and runs again, so the ref is cleared here and recreated on the next use instead
  // of reusing a destroyed instance. `destroy()` also removes the dialog and container nodes
  // that `clear()` would leave attached to `document.body`.
  useEffect(() => {
    return () => {
      toasterRef.current?.destroy();
      toasterRef.current = null;
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show: ({ kind, text, action }) => {
        const toaster = getToaster();
        const options = action ? { action: { label: action.label, onClick: action.onClick } } : undefined;
        toaster[kind](text, options);
      },
      confirm: async ({ title, message, confirmLabel, cancelLabel, destructive }) => {
        const handle = getToaster().dialog.confirm(message, {
          title,
          confirmLabel,
          cancelLabel,
          type: destructive ? "error" : "primary",
        });
        const confirmed = await handle;
        return confirmed;
      },
    }),
    [getToaster],
  );

  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
}

/**
 * Accesses the toast and confirmation APIs.
 *
 * @returns The toast API from the nearest ToastProvider.
 * @throws If called outside a ToastProvider.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return api;
}
