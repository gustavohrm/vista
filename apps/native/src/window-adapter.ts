import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { WindowCapability, WindowControls } from "@vista/app";

/**
 * The window's buttons and dragging for the app's title bar, since the desktop window has no system
 * frame (`decorations: false`).
 */
function createWindowControls(isWindows: boolean): WindowControls {
  const appWindow = getCurrentWindow();
  return {
    minimize: () => appWindow.minimize(),
    toggleMaximize: () => appWindow.toggleMaximize(),
    // Emits the close request, so the unsaved-changes check below runs as for any other close.
    close: () => appWindow.close(),
    startDragging: () => appWindow.startDragging(),
    // Only Windows has the layouts; the command sends `Win + Z`, which shows them for the active window.
    ...(isWindows ? { showSnapLayouts: () => invoke<void>("show_snap_layouts") } : {}),
    watchMaximized(listener) {
      let isDisposed = false;
      let unlisten: (() => void) | null = null;
      const report = async () => {
        try {
          const isMaximized = await appWindow.isMaximized();
          if (!isDisposed) {
            listener(isMaximized);
          }
        } catch (err) {
          console.warn("Could not tell whether the window is maximized:", err);
        }
      };
      const watch = async () => {
        try {
          // Maximizing, restoring, and snapping all resize the window.
          const stop = await appWindow.onResized(() => void report());
          if (isDisposed) {
            stop();
          } else {
            unlisten = stop;
          }
        } catch (err) {
          console.warn("Could not watch the window's size:", err);
        }
      };
      void report();
      void watch();
      return () => {
        isDisposed = true;
        unlisten?.();
      };
    },
  };
}

/**
 * Asks the app before the desktop window closes, since a webview window gets no `beforeunload`.
 *
 * @param withControls - Whether the app draws the window's frame, which only the desktop window lacks.
 * @param isWindows - Whether the app runs on Windows, the one system with layouts to show from Maximize.
 */
export function createNativeWindowAdapter(withControls: boolean, isWindows: boolean): WindowCapability {
  return {
    ...(withControls ? { controls: createWindowControls(isWindows) } : {}),
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
