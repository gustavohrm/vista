import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { i18n, LOCALE_STORAGE_KEY, startLanguage, stopLanguage } from "../../i18n";
import { LanguageSection } from "./language-section";

describe("LanguageSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects System and names the language it gives while nothing is chosen", () => {
    render(<LanguageSection />);

    const list = screen.getByRole("combobox", { name: "Language" });
    expect(list).toHaveValue("system");
    expect(screen.getByRole("option", { name: "System (English)" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "System (English)",
      "English",
      "Português (Brasil)",
      "Español",
    ]);
  });

  it("switches the interface at once to the chosen language, and selects it", async () => {
    const user = userEvent.setup();
    render(<LanguageSection />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "Español");

    const list = await screen.findByRole("combobox", { name: "Idioma" });
    expect(list).toHaveValue("es");
    // In Spanish, System still names the system's language.
    expect(screen.getByRole("option", { name: "Sistema (English)" })).toBeInTheDocument();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(JSON.stringify({ locale: "es" }));
  });

  it("selects the language already shown when it is chosen, which saves it", async () => {
    const user = userEvent.setup();
    render(<LanguageSection />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "English");

    await waitFor(() => expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(JSON.stringify({ locale: "en" })));
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");
  });

  it("goes back to System and the system's language when System is chosen", async () => {
    stopLanguage();
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ locale: "en" }));
    await startLanguage();
    const user = userEvent.setup();
    render(<LanguageSection />);

    // System names the language it gives, not the one chosen.
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "System (Português (Brasil))");

    const list = await screen.findByRole("combobox", { name: "Idioma" });
    expect(list).toHaveValue("system");
    expect(i18n.locale).toBe("pt-BR");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("renames System when the system's languages change while a language is chosen", async () => {
    const languages = vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    const user = userEvent.setup();
    render(<LanguageSection />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "English");
    await waitFor(() => expect(localStorage.getItem(LOCALE_STORAGE_KEY)).not.toBeNull());

    languages.mockReturnValue(["es-ES"]);
    act(() => {
      window.dispatchEvent(new Event("languagechange"));
    });

    expect(screen.getByRole("option", { name: "System (Español)" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");
  });
});
