import type { ViewMode } from "../ports";
import { getFileKind } from "./file-types";

/** Rendered presentations a file can have in enriched mode. */
export type EnrichedViewKind = "markdown" | "csv-table";

/** What presentations a file format offers. Formats with no raw form, such as PDF, set `hasRaw: false`. */
export interface ViewerDefinition {
  hasRaw: boolean;
  enriched?: EnrichedViewKind;
  defaultMode: ViewMode;
}

const RAW_ONLY: ViewerDefinition = { hasRaw: true, defaultMode: "raw" };

const VIEWERS_BY_KIND: Readonly<Partial<Record<ReturnType<typeof getFileKind>, ViewerDefinition>>> = {
  markdown: { hasRaw: true, enriched: "markdown", defaultMode: "enriched" },
  csv: { hasRaw: true, enriched: "csv-table", defaultMode: "raw" },
};

export function getViewer(extension: string): ViewerDefinition {
  return VIEWERS_BY_KIND[getFileKind(extension)] ?? RAW_ONLY;
}

/** Resolves a requested mode to one the format supports, so a tab never shows a view its format lacks. */
export function resolveViewMode(extension: string, requested: ViewMode): ViewMode {
  const viewer = getViewer(extension);
  if (requested === "enriched" && viewer.enriched) {
    return "enriched";
  }
  return viewer.hasRaw ? "raw" : "enriched";
}
