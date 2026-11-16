import type { ViewMode } from "../ports";
import { fitsTable } from "./csv";
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
  csv: { hasRaw: true, enriched: "csv-table", defaultMode: "enriched" },
};

export function getViewer(extension: string): ViewerDefinition {
  return VIEWERS_BY_KIND[getFileKind(extension)] ?? RAW_ONLY;
}

/**
 * Whether a file's enriched view can show its content: a format with one, and for a CSV, a file the
 * table can show.
 */
export function canShowEnriched(extension: string, content: string): boolean {
  const { enriched } = getViewer(extension);
  return enriched !== undefined && (enriched !== "csv-table" || fitsTable(content));
}

/**
 * Resolves a requested mode to one the format supports, so a tab never shows a view its format lacks.
 * Given the content, it also keeps a CSV too large for the table in the raw view.
 */
export function resolveViewMode(extension: string, requested: ViewMode, content?: string): ViewMode {
  const viewer = getViewer(extension);
  if (requested === "enriched" && viewer.enriched && (content === undefined || canShowEnriched(extension, content))) {
    return "enriched";
  }
  return viewer.hasRaw ? "raw" : "enriched";
}
