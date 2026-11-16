import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { WorkspaceColor, WorkspaceIcon } from "../../domain/workspaces";
import { Tooltip } from "../feedback/tooltip";
import { WorkspaceGlyph } from "../workspace/workspace-glyph";

/** A section of Settings: the open workspace's, or one of Vista's own. */
export type SettingsSection = "workspace" | "appearance" | "editor" | "files" | "shortcuts" | "about";

const VISTA_SECTIONS: readonly { id: Exclude<SettingsSection, "workspace">; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <i className="ic-sun" aria-hidden="true" /> },
  { id: "editor", label: "Editor", icon: <i className="ic-type" aria-hidden="true" /> },
  { id: "files", label: "Files", icon: <i className="ic-folder" aria-hidden="true" /> },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: <i className="ic-keyboard" aria-hidden="true" /> },
  { id: "about", label: "About", icon: <i className="ic-info" aria-hidden="true" /> },
];

const EASE_ENTER = [0.2, 0, 0, 1] as const;

interface SettingsPageProps {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  /** The open workspace, for its item under Workspace; with none, that group is not shown. */
  workspace: { name: string; icon: WorkspaceIcon; color: WorkspaceColor } | null;
  onClose: () => void;
  /** The shown section's content. */
  children: ReactNode;
}

/**
 * Settings, shown in the frame in place of the document: a header with the close button, the
 * sections on the left, grouped by where they apply, and the shown one on the right. It rises into
 * the frame as it opens, and a new section fades in. Escape closes it, as does the close button.
 * Focus moves to the shown section's item as it opens and, when it closes with focus inside it,
 * goes back to where it was.
 *
 * @param props - SettingsPage properties.
 * @returns Page element.
 */
export function SettingsPage({ section, onSectionChange, workspace, onClose, children }: SettingsPageProps) {
  const isReducedMotion = useReducedMotion() ?? false;
  const navRef = useRef<HTMLElement>(null);

  // Taken as the page first renders, before it moves focus: StrictMode runs the effect below twice,
  // and the second run would find the page's own item focused.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>("[aria-current='page']")?.focus();
    return () => {
      // Focus left inside the page goes nowhere once it is gone, so it goes back to the opener.
      const focused = document.activeElement;
      if ((focused === null || focused === document.body) && opener?.isConnected) {
        opener.focus();
      }
    };
  }, [opener]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <motion.section
      aria-label="Settings"
      initial={isReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: isReducedMotion ? 0.1 : 0.2, ease: EASE_ENTER }}
      onKeyDown={handleKeyDown}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="border-line flex h-10 flex-none items-center border-b pr-1.5 pl-4">
        <h1 className="text-text-strong flex-1 text-[13px] font-semibold">Settings</h1>
        <Tooltip text="Close" shortcut="Escape" position="bottom">
          {(tooltipId) => (
            <button
              type="button"
              aria-label="Close Settings"
              aria-describedby={tooltipId}
              onClick={onClose}
              className="icon-button size-7 text-base"
            >
              <i className="ic-x" aria-hidden="true" />
            </button>
          )}
        </Tooltip>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          ref={navRef}
          aria-label="Settings sections"
          className="border-line flex flex-none [scrollbar-width:none] gap-0.5 overflow-x-auto border-b px-2 py-2 md:block md:w-[232px] md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-5"
        >
          {workspace && (
            <>
              <GroupLabel isFirst>Workspace</GroupLabel>
              <NavItem isCurrent={section === "workspace"} onSelect={() => onSectionChange("workspace")}>
                <WorkspaceGlyph icon={workspace.icon} color={workspace.color} className="text-[15px]" />
                <span className="truncate">{workspace.name}</span>
              </NavItem>
            </>
          )}
          <GroupLabel isFirst={!workspace}>Vista</GroupLabel>
          {VISTA_SECTIONS.map(({ id, label, icon }) => (
            <NavItem key={id} isCurrent={section === id} onSelect={() => onSectionChange(id)}>
              <span className="text-text-faint flex text-[15px]">{icon}</span>
              {label}
            </NavItem>
          ))}
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-8 md:px-14 md:py-10">
          <motion.div
            key={section}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: EASE_ENTER }}
            className="max-w-[640px]"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

function GroupLabel({ isFirst = false, children }: { isFirst?: boolean; children: ReactNode }) {
  return (
    <div className={`text-text-faint mb-1.5 hidden px-2.5 text-xs font-medium md:block ${isFirst ? "" : "mt-[18px]"}`}>
      {children}
    </div>
  );
}

interface NavItemProps {
  isCurrent: boolean;
  onSelect: () => void;
  children: ReactNode;
}

function NavItem({ isCurrent, onSelect, children }: NavItemProps) {
  return (
    <button
      type="button"
      aria-current={isCurrent ? "page" : undefined}
      onClick={onSelect}
      className={`flex h-7 min-w-0 flex-none cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] whitespace-nowrap transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] md:w-full ${
        isCurrent ? "bg-selected text-text-strong font-medium" : "text-text hover:bg-hover"
      }`}
    >
      {children}
    </button>
  );
}
