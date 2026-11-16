import type { ReactNode } from "react";

/**
 * A section's title and the one sentence that says where its settings apply.
 *
 * @param props - The title and the sentence.
 * @returns The section's heading block.
 */
export function SectionHeading({ title, lead }: { title: string; lead: string }) {
  return (
    <>
      <h2 className="text-text-strong text-[22px] leading-tight font-semibold tracking-[-0.015em]">{title}</h2>
      <p className="text-text-muted mt-1 mb-7 text-[13px] leading-normal">{lead}</p>
    </>
  );
}

/**
 * A heading for a group inside a section.
 *
 * @param props - The heading's id, for the group it names; whether it opens the section, right under
 *   the lead, which already sets the space above it; and its text.
 * @returns Heading element.
 */
export function GroupHeading({
  id,
  isFirst = false,
  children,
}: {
  id?: string;
  isFirst?: boolean;
  children: ReactNode;
}) {
  return (
    <h3 id={id} className={`text-text-strong mb-2.5 text-[13px] font-semibold ${isFirst ? "" : "mt-8"}`}>
      {children}
    </h3>
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
