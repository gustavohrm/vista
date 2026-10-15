import type { AppAdapter } from "@vista/app";

import { createNativeWorkspaceAdapter } from "./workspace-adapter";

export const nativeAdapter: AppAdapter = {
  platform: "native",
  workspace: createNativeWorkspaceAdapter(),
};
