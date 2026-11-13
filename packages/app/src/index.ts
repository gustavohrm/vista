export { App } from "./app";
export { getFileKind, normalizeExtension, supportsEnrichedView } from "./domain/file-types";
export type {
  AppAdapter,
  AppPlatform,
  AvailableUpdate,
  FileContents,
  FileDocument,
  FileStat,
  RestoreFolderResult,
  ThemeCapability,
  UpdaterCapability,
  ViewMode,
  WindowCapability,
  Workspace,
  WorkspaceCapability,
  WorkspaceErrorKind,
  WorkspaceNode,
} from "./ports";
export { WorkspaceError } from "./ports";
export { getThemeInstance, useTheme } from "./theme/theme-manager";
