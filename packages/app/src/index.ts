export { App } from "./app";
export { getFileKind, normalizeExtension, supportsEnrichedView } from "./domain/file-types";
export type {
  AppAdapter,
  AppPlatform,
  AvailableUpdate,
  FileContents,
  FileDocument,
  FileStat,
  FolderRelation,
  RestoreFolderResult,
  ThemeCapability,
  UpdaterCapability,
  ViewMode,
  WindowCapability,
  WindowControls,
  WorkspaceCapability,
  WorkspaceFolder,
  WorkspaceErrorKind,
  WorkspaceNode,
} from "./ports";
export { LEGACY_FOLDER_ID, WorkspaceError } from "./ports";
export { initAppearance } from "./theme/appearance";
export { getThemeInstance, useTheme } from "./theme/theme-manager";
