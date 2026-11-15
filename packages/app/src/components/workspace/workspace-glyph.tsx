import type { CSSProperties, ReactNode } from "react";

import type { WorkspaceColor, WorkspaceIcon } from "../../domain/workspaces";

// Each hue reads on both themes: the darker step on light backgrounds, the lighter one on dark.
const COLOR_STYLES: Record<WorkspaceColor, CSSProperties | undefined> = {
  neutral: undefined,
  indigo: { color: "light-dark(var(--color-indigo-600), var(--color-indigo-300))" },
  emerald: { color: "light-dark(var(--color-emerald-700), var(--color-emerald-300))" },
  amber: { color: "light-dark(var(--color-amber-600), var(--color-amber-300))" },
  rose: { color: "light-dark(var(--color-rose-700), var(--color-rose-300))" },
};

interface WorkspaceGlyphProps {
  icon: WorkspaceIcon;
  color: WorkspaceColor;
  /** Draws the icon on a small rounded tile tinted with its colour, as the switcher shows it. */
  isTile?: boolean;
  className?: string;
}

/**
 * A workspace's icon in its colour. Every class is written out, because the icon build step only
 * rewrites literal `ic-*` classes.
 */
export function WorkspaceGlyph({ icon, color, isTile = false, className = "" }: WorkspaceGlyphProps) {
  const style = COLOR_STYLES[color];
  const tone = style ? "" : "text-text-secondary";
  // The tile's fill is the icon's own colour, faded, so each colour needs no second value.
  const tile = isTile
    ? "size-5 items-center justify-center rounded-[5px] bg-[color-mix(in_srgb,currentColor_18%,transparent)]"
    : "";
  const wrap = (glyph: ReactNode) => (
    <span aria-hidden="true" style={style} className={`flex flex-none ${tone} ${tile} ${className}`}>
      {glyph}
    </span>
  );
  switch (icon) {
    case "folder":
      return wrap(<i className="ic-folder" aria-hidden="true" />);
    case "book-open":
      return wrap(<i className="ic-book-open" aria-hidden="true" />);
    case "notebook-pen":
      return wrap(<i className="ic-notebook-pen" aria-hidden="true" />);
    case "briefcase":
      return wrap(<i className="ic-briefcase" aria-hidden="true" />);
    case "code":
      return wrap(<i className="ic-code" aria-hidden="true" />);
    case "house":
      return wrap(<i className="ic-house" aria-hidden="true" />);
    case "star":
      return wrap(<i className="ic-star" aria-hidden="true" />);
    case "heart":
      return wrap(<i className="ic-heart" aria-hidden="true" />);
    case "flask-conical":
      return wrap(<i className="ic-flask-conical" aria-hidden="true" />);
    case "graduation-cap":
      return wrap(<i className="ic-graduation-cap" aria-hidden="true" />);
    case "pen-line":
      return wrap(<i className="ic-pen-line" aria-hidden="true" />);
    case "globe":
      return wrap(<i className="ic-globe" aria-hidden="true" />);
  }
}
