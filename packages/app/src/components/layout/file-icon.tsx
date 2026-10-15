import { getFileIconCategory, type FileIconCategory } from "../../domain/file-types";

interface FileIconProps {
  /** Normalized file extension without leading dot; empty or unknown values show the generic file icon. */
  extension: string;
  /** Class names applied to the wrapper that holds the icon, e.g. size or color. */
  className?: string;
}

/**
 * Icon representing a file in the explorer, chosen by the category of its extension. The icon
 * is wrapped in a span so `className` can style it without making the icon class dynamic, since
 * the build-time icon plugin only recognizes literal `ic-*` class names.
 *
 * @param props - FileIcon properties.
 * @returns Icon element wrapped in a span.
 */
export function FileIcon({ extension, className }: FileIconProps) {
  return <span className={className}>{renderCategoryIcon(getFileIconCategory(extension))}</span>;
}

function renderCategoryIcon(category: FileIconCategory) {
  switch (category) {
    case "document":
      return <i className="ic-file-text" aria-hidden="true" />;
    case "spreadsheet":
      return <i className="ic-file-spreadsheet" aria-hidden="true" />;
    case "data":
      return <i className="ic-file-json" aria-hidden="true" />;
    case "image":
      return <i className="ic-file-image" aria-hidden="true" />;
    case "code":
      return <i className="ic-file-code" aria-hidden="true" />;
    case "generic":
      return <i className="ic-file" aria-hidden="true" />;
  }
}
