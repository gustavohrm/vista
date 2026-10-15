/** Supported file format kinds in Vista. */
export type SupportedFileKind = "markdown" | "csv" | "text" | "unknown";

/** File extension mappings to supported file kinds. */
const EXTENSION_KINDS: Readonly<Record<string, SupportedFileKind>> = {
  md: "markdown",
  markdown: "markdown",
  csv: "csv",
  txt: "text",
};

/** Icon family used to represent a file in the explorer tree. */
export type FileIconCategory = "document" | "spreadsheet" | "data" | "image" | "code" | "generic";

/** Icon category for each known extension. Extensions not listed fall back to the generic category. */
const ICON_CATEGORY_BY_EXTENSION: ReadonlyMap<string, FileIconCategory> = new Map<string, FileIconCategory>([
  ["md", "document"],
  ["markdown", "document"],
  ["txt", "document"],
  ["csv", "spreadsheet"],
  ["json", "data"],
  ["png", "image"],
  ["jpg", "image"],
  ["jpeg", "image"],
  ["gif", "image"],
  ["svg", "image"],
  ["webp", "image"],
  ["avif", "image"],
  ["bmp", "image"],
  ["ico", "image"],
  ["js", "code"],
  ["ts", "code"],
  ["jsx", "code"],
  ["tsx", "code"],
  ["mjs", "code"],
  ["cjs", "code"],
  ["css", "code"],
  ["html", "code"],
  ["xml", "code"],
  ["yaml", "code"],
  ["yml", "code"],
  ["toml", "code"],
  ["sh", "code"],
  ["py", "code"],
  ["rs", "code"],
  ["go", "code"],
  ["java", "code"],
  ["c", "code"],
  ["cpp", "code"],
  ["h", "code"],
]);

/**
 * Normalizes a file extension or path to lowercase without a leading dot.
 *
 * @param pathOrExtension - File path or extension.
 * @returns Cleaned lowercase extension.
 */
export function normalizeExtension(pathOrExtension: string): string {
  const lastDot = pathOrExtension.lastIndexOf(".");
  if (lastDot === -1) {
    return pathOrExtension.toLowerCase().replace(/^\./, "");
  }
  return pathOrExtension.slice(lastDot + 1).toLowerCase();
}

/**
 * Categorizes a file extension into its supported format kind.
 *
 * @param extension - Normalized file extension.
 * @returns The supported kind, or 'unknown'.
 */
export function getFileKind(extension: string): SupportedFileKind {
  return EXTENSION_KINDS[extension.toLowerCase()] ?? "unknown";
}

/**
 * Determines whether a file format supports an enriched presentation mode.
 *
 * @param extension - Normalized file extension.
 * @returns True if the format has a dedicated enriched view (e.g. Markdown preview or CSV table).
 */
export function supportsEnrichedView(extension: string): boolean {
  const kind = getFileKind(extension);
  return kind === "markdown" || kind === "csv";
}

/**
 * Chooses the explorer icon family for a file extension.
 *
 * @param extension - Normalized file extension; an empty or unlisted extension yields the generic category.
 * @returns The icon category for the extension.
 */
export function getFileIconCategory(extension: string): FileIconCategory {
  return ICON_CATEGORY_BY_EXTENSION.get(extension.toLowerCase()) ?? "generic";
}
