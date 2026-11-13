import type { AppAdapter } from "@vista/app";

import { createNativeUpdaterAdapter } from "./updater-adapter";
import { createNativeWindowAdapter } from "./window-adapter";
import { createNativeWorkspaceAdapter } from "./workspace-adapter";

export const nativeAdapter: AppAdapter = {
  platform: "native",
  workspace: createNativeWorkspaceAdapter(),
  window: createNativeWindowAdapter(),
  updater: createNativeUpdaterAdapter(),
};
