import { useId, useState } from "react";

import { chooseLanguage, LOCALE_NAMES, LOCALES, t, useLanguageChoice, type Locale } from "../../i18n";
import { SectionHeading, SettingsGroup, SettingsRow } from "./settings-parts";

/**
 * The interface language: _System_, which follows the operating system's languages and names the one it
 * gives, followed by each language in its own name, as `docs/specs/languages.md` describes.
 *
 * @returns Section content.
 */
export function LanguageSection() {
  const selectId = useId();
  const descriptionId = useId();
  const { choice, systemLocale } = useLanguageChoice();
  // The user's pick, shown while its language loads, so the list doesn't jump back to the old one.
  const [pending, setPending] = useState<"system" | Locale>();

  const choose = async (next: "system" | Locale) => {
    setPending(next);
    try {
      await chooseLanguage(next);
    } catch (error) {
      // The language stays as it was, and the list shows it again.
      console.error("Vista could not switch the interface language.", error);
    } finally {
      // Unless a later pick is still loading.
      setPending((current) => (current === next ? undefined : current));
    }
  };

  return (
    <>
      <SectionHeading title={t("settings.language.title")} lead={t("settings.language.lead")} />
      <SettingsGroup>
        <SettingsRow
          label={t("settings.language.label")}
          htmlFor={selectId}
          description={t("settings.language.description")}
          descriptionId={descriptionId}
        >
          <select
            id={selectId}
            value={pending ?? choice}
            aria-describedby={descriptionId}
            onChange={(event) => void choose(event.target.value as "system" | Locale)}
            className="select text-[13px]"
          >
            <option value="system">{t("settings.language.system", { language: LOCALE_NAMES[systemLocale] })}</option>
            {LOCALES.map((option) => (
              <option key={option} value={option} lang={option}>
                {LOCALE_NAMES[option]}
              </option>
            ))}
          </select>
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
