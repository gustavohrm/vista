import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WindowCapability } from "@vista/app";

/** Asks the app before the desktop window closes, since a webview window gets no `beforeunload`. */
export function createNativeWindowAdapter(): WindowCapability {
  return {
    onCloseRequested(check) {
      const appWindow = getCurrentWindow();
      let isDisposed = false;
      let unlisten: (() => void) | null = null;
      const listen = async () => {
        try {
          const stop = await appWindow.onCloseRequested(async (event) => {
            // Held open while the app asks; closed only once it agrees.
            event.preventDefault();
            let mayClose = true;
            try {
              mayClose = await check();
            } catch (err) {
              // A broken check must never trap the user in a window they cannot close.
              console.error("Failed to check for unsaved changes before closing:", err);
            }
            if (mayClose) {
              await appWindow.destroy();
            }
          });
          if (isDisposed) {
            stop();
          } else {
            unlisten = stop;
          }
        } catch (err) {
          console.error("Failed to watch for the window closing:", err);
        }
      };
      void listen();
      return () => {
        isDisposed = true;
        unlisten?.();
      };
    },
  };
}
