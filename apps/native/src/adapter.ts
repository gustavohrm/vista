import type { AppAdapter } from "@vista/app";

import { createNativeUpdaterAdapter } from "./updater-adapter";
import { createNativeWindowAdapter } from "./window-adapter";
import { createNativeWorkspaceAdapter } from "./workspace-adapter";

// Set by the Tauri CLI for the build. The updater and process plugins are registered on desktop only.
const isMobile = ["android", "ios"].includes(String(import.meta.env.TAURI_ENV_PLATFORM));

export const nativeAdapter: AppAdapter = {
  platform: "native",
  workspace: createNativeWorkspaceAdapter(),
  window: createNativeWindowAdapter(),
  ...(isMobile ? {} : { updater: createNativeUpdaterAdapter() }),
};
