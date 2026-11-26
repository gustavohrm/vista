import { afterEach, describe, expect, it, vi } from "vitest";

import { i18n, LOCALES } from ".";

// Plural forms other than `other` differ by language, so a dictionary has only the ones its language uses.
function isLanguageSpecificForm(key: string, dictionary: Readonly<Record<string, string>>): boolean {
  const form = /^(.+)\.(zero|one|two|few|many)$/.exec(key);
  return form !== null && `${form[1]}.other` in dictionary;
}

// The names a message fills, such as `version` in `Update to {version}` or `count` in a plural. A `#`
// inside a plural form is the plural's own number, not a name.
function placeholders(message: string): string[] {
  return [...new Set([...message.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]/g)].map((match) => match[1] ?? ""))].sort();
}

/** Every language's dictionary, flattened to keys, by locale. */
async function loadAll(): Promise<[(typeof LOCALES)[number], Readonly<Record<string, string>>][]> {
  return Promise.all(LOCALES.map(async (locale) => [locale, await i18n.loadLocale(locale)] as const));
}

describe("dictionaries", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.setLocale("en");
  });

  it("fails a test that asks for a key no dictionary has", () => {
    expect(() => i18n.t("settings.language.missing" as Parameters<typeof i18n.t>[0])).toThrow(
      'Missing translation "settings.language.missing" in en',
    );
  });

  it("gives every language exactly English's keys", async () => {
    const english = await i18n.loadLocale("en");
    const reference = Object.keys(english)
      .filter((key) => !isLanguageSpecificForm(key, english))
      .sort();

    for (const [locale, dictionary] of await loadAll()) {
      const keys = Object.keys(dictionary)
        .filter((key) => !isLanguageSpecificForm(key, dictionary))
        .sort();
      expect({ locale, keys }).toEqual({ locale, keys: reference });
    }
  });

  it("writes every message in valid ICU syntax", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const [locale, dictionary] of await loadAll()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a message is checked in its own language, one at a time
      await i18n.setLocale(locale);
      for (const key of Object.keys(dictionary)) {
        i18n.t(key as Parameters<typeof i18n.t>[0]);
      }
    }

    const invalid = warn.mock.calls.filter(([text]) => String(text).startsWith("[I18n] Invalid message"));
    expect(invalid).toEqual([]);
  });

  it("fills the same placeholders in every language as in English", async () => {
    const english = await i18n.loadLocale("en");

    for (const [locale, dictionary] of await loadAll()) {
      for (const [key, message] of Object.entries(dictionary)) {
        const source = english[key] ?? english[key.replace(/\.(zero|one|two|few|many)$/, ".other")] ?? "";
        expect({ locale, key, placeholders: placeholders(message) }).toEqual({
          locale,
          key,
          placeholders: placeholders(source),
        });
      }
    }
  });
});
