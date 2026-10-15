export { App } from "./app";
export { getFileKind, normalizeExtension, supportsEnrichedView } from "./domain/file-types";
export type {
  AppAdapter,
  AppPlatform,
  FileDocument,
  RestoreFolderResult,
  ThemeCapability,
  ViewMode,
  Workspace,
  WorkspaceCapability,
  WorkspaceNode,
} from "./ports";
export { getThemeInstance, useTheme } from "./theme/theme-manager";
