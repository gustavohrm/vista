/** Where the source of a Markdown image points. */
export type ImageSource =
  /** A file in the open workspace, by workspace-relative path. */
  | { kind: "workspace"; path: string }
  /** A web or data URL, which the browser loads itself where the host allows it. */
  | { kind: "url"; url: string }
  /** Nothing Vista loads: a path outside the workspace, another scheme, or an empty source. */
  | { kind: "none" };

const MIME_TYPES: Record<string, string> = {
  apng: "image/apng",
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/**
 * Resolves a Markdown image source against the document that contains it. A relative source
 * starts from the document's folder, and a source starting with `/` from the workspace root.
 * Percent escapes such as `%20` are decoded, and a query or fragment is dropped. A path that
 * climbs out of the workspace with `..` is not loaded.
 *
 * @param src - The image source as written in the Markdown.
 * @param documentPath - Workspace-relative path of the Markdown document.
 */
export function resolveImageSource(src: string, documentPath: string): ImageSource {
  const source = src.trim();
  if (/^(https?:|data:image\/)/i.test(source) || source.startsWith("//")) {
    return { kind: "url", url: source };
  }
  // Any other scheme, such as file: or javascript:, and Windows drive paths such as C:/.
  if (source === "" || /^[a-z][a-z\d+.-]*:/i.test(source)) {
    return { kind: "none" };
  }
  const withoutSuffix = source.replace(/[?#].*$/, "").replaceAll("\\", "/");
  const isFromRoot = withoutSuffix.startsWith("/");
  const segments = isFromRoot ? [] : documentPath.split("/").slice(0, -1);
  for (const segment of decode(withoutSuffix).split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return { kind: "none" };
      }
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.length === 0 ? { kind: "none" } : { kind: "workspace", path: segments.join("/") };
}

/**
 * Names the image type of a file from its extension, so the browser can show an SVG from bytes.
 *
 * @returns The MIME type, or an empty string for an unknown extension, which leaves the browser to sniff it.
 */
export function imageMimeType(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME_TYPES[extension] ?? "";
}

function decode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    // A stray `%` that starts no escape, as in "100%.png", is part of the name.
    return path;
  }
}
