import type { AppAdapter } from "@vista/app";

import { createNativeUpdaterAdapter } from "./updater-adapter";
import { createNativeWindowAdapter } from "./window-adapter";
import { createNativeWorkspaceAdapter } from "./workspace-adapter";

// Set by the Tauri CLI for the build. The updater and process plugins are registered on desktop only.
const isMobile = ["android", "ios"].includes(String(import.meta.env.TAURI_ENV_PLATFORM));

const workspace = createNativeWorkspaceAdapter();
// Android and iOS have no file manager to reveal an entry in; the opener plugin rejects the call there.
if (isMobile) {
  delete workspace.reveal;
}

export const nativeAdapter: AppAdapter = {
  platform: "native",
  workspace,
  window: createNativeWindowAdapter(),
  ...(isMobile ? {} : { updater: createNativeUpdaterAdapter() }),
};
