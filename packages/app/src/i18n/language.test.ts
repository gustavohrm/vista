import { afterEach, describe, expect, it, vi } from "vitest";

import { chooseLanguage, i18n, LOCALE_STORAGE_KEY, startLanguage, stopLanguage, t } from ".";

/** Starts the language again as Vista would at launch, with these system languages. */
async function restart(systemLanguages: readonly string[] = ["en-US"]): Promise<void> {
  stopLanguage();
  vi.spyOn(navigator, "languages", "get").mockReturnValue(systemLanguages);
  await startLanguage();
}

describe("interface language", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("follows the system's languages, most preferred first, when none is chosen", async () => {
    await restart(["fr-FR", "es-MX", "en-US"]);

    expect(i18n.locale).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("gives a Portuguese visitor from Portugal Brazilian Portuguese", async () => {
    await restart(["pt-PT"]);

    expect(i18n.locale).toBe("pt-BR");
  });

  it("falls back to English when no system language is offered", async () => {
    await restart(["fr-FR", "de-DE"]);

    expect(i18n.locale).toBe("en");
  });

  it("saves a chosen language under vista-locale and applies it at once", async () => {
    await chooseLanguage("pt-BR");

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(JSON.stringify({ locale: "pt-BR" }));
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(t("settings.language.title")).toBe("Idioma");
  });

  it("keeps a saved language over the system's at the next start", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ locale: "es" }));

    await restart(["pt-BR"]);

    expect(i18n.locale).toBe("es");
  });

  it("matches a saved language Vista does not ship like a system language", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ locale: "pt-PT" }));

    await restart(["es-ES"]);

    expect(i18n.locale).toBe("pt-BR");
  });

  it("follows the system when the saved language has no match", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ locale: "fr" }));

    await restart(["es-ES"]);

    expect(i18n.locale).toBe("es");
  });

  it("detects the language at each start when storage can't be read, and still switches", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    await restart(["es-ES"]);
    expect(i18n.locale).toBe("es");

    await chooseLanguage("pt-BR");
    expect(i18n.locale).toBe("pt-BR");
  });

  it("forgets the choice and follows the system again when System is chosen", async () => {
    await restart(["es-ES"]);
    await chooseLanguage("en");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).not.toBeNull();

    await chooseLanguage("system");

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(i18n.locale).toBe("es");
  });
});
