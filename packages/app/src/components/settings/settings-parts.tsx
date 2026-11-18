import type { ReactNode } from "react";

/**
 * A section's title and the one sentence that says where its settings apply.
 *
 * @param props - The title, the sentence, and an optional icon before the title and action after it.
 * @returns The section's heading block.
 */
export function SectionHeading({
  title,
  lead,
  icon,
  action,
}: {
  title: string;
  lead: string;
  /** Shown before the title, such as a workspace's tile. */
  icon?: ReactNode;
  /** An action at the heading's right end, such as a button that adds to the section. */
  action?: ReactNode;
}) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <h2 className="text-text-strong min-w-0 flex-1 truncate text-[22px] leading-tight font-semibold tracking-[-0.015em]">
          {title}
        </h2>
        {action}
      </div>
      <p className="text-text-muted mt-1 mb-7 text-[13px] leading-normal">{lead}</p>
    </>
  );
}

/**
 * A heading for a group inside a section.
 *
 * @param props - The heading's id, for the group it names; whether it opens the section, right under
 *   the lead, which already sets the space above it; its text; and an optional action for the group,
 *   such as an icon button that adds to it, at the row's right end.
 * @returns Heading element.
 */
export function GroupHeading({
  id,
  isFirst = false,
  action,
  children,
}: {
  id?: string;
  isFirst?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const spacing = `mb-2.5 ${isFirst ? "" : "mt-8"}`;
  const heading = (
    <h3 id={id} className={`text-text-strong text-[13px] font-semibold ${action ? "" : spacing}`}>
      {children}
    </h3>
  );
  if (!action) {
    return heading;
  }
  // The action's box overhangs the row, so the heading's text keeps the same place as without one.
  return (
    <div className={`flex h-5 items-center justify-between ${spacing}`}>
      {heading}
      {action}
    </div>
  );
}

/**
 * Related rows in one hairline box, with a hairline between rows.
 *
 * @param props - The rows, and an optional label for the group.
 * @returns Group element.
 */
export function SettingsGroup({ labelledBy, children }: { labelledBy?: string; children: ReactNode }) {
  return (
    <div
      role={labelledBy ? "group" : undefined}
      aria-labelledby={labelledBy}
      className="border-line rounded-[10px] border"
    >
      {children}
    </div>
  );
}

interface SettingsRowProps {
  /** The setting's name. */
  label: string;
  /** What the setting does, under its name. */
  description?: ReactNode;
  /** The id of a form field the name labels, which makes the name a `<label>`. */
  htmlFor?: string;
  /** An id for the name, for a control that names itself with `aria-labelledby`. */
  labelId?: string;
  /** An id for the description, for a control's `aria-describedby`. */
  descriptionId?: string;
  /** The control, at the row's right end. */
  children: ReactNode;
}

/**
 * One setting: its name and description on the left, its control on the right.
 *
 * @param props - SettingsRow properties.
 * @returns Row element.
 */
export function SettingsRow({ label, description, htmlFor, labelId, descriptionId, children }: SettingsRowProps) {
  const labelClass = "text-text-strong block text-[13px] font-medium";
  return (
    <div className="border-line flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5 [&+&]:border-t">
      <div className="min-w-48 flex-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} id={labelId} className={labelClass}>
            {label}
          </label>
        ) : (
          <span id={labelId} className={labelClass}>
            {label}
          </span>
        )}
        {description && (
          <span id={descriptionId} className="text-text-muted mt-0.5 block text-[12.5px] leading-[1.45]">
            {description}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

interface SwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  describedBy?: string;
}

/**
 * An on/off setting, as a checkbox with the switch role, named by the row's `<label>`.
 *
 * @param props - Switch properties.
 * @returns Switch element.
 */
export function Switch({ id, checked, onChange, describedBy }: SwitchProps) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      checked={checked}
      aria-checked={checked}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.checked)}
      className="switch flex-none"
    />
  );
}
