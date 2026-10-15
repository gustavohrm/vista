import type { AppAdapter } from "@vista/app";

import { createWebWorkspaceAdapter } from "./workspace-adapter";

export const webAdapter: AppAdapter = {
  platform: "web",
  workspace: createWebWorkspaceAdapter(),
};
