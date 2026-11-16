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
  WorkspaceCapability,
  WorkspaceFolder,
  WorkspaceErrorKind,
  WorkspaceNode,
} from "./ports";
export { LEGACY_FOLDER_ID, WorkspaceError } from "./ports";
export { getThemeInstance, useTheme } from "./theme/theme-manager";
