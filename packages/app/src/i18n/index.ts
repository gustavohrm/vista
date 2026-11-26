import { createI18n } from "@codenhub/i18n";
import { initializeBrowserI18n, type BrowserI18nBinding } from "@codenhub/i18n/browser";
import { useSyncExternalStore } from "react";

import en from "./en";
import es from "./es.json";
import ptBR from "./pt-BR.json";

/** The interface languages, English first as the default and the fallback. */
export const LOCALES = ["en", "pt-BR", "es"] as const;

/** One of the interface languages. */
export type Locale = (typeof LOCALES)[number];

/** Each language in its own name, as the Language row lists it, so anyone can find theirs. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  en: "English",
  "pt-BR": "Português (Brasil)",
  es: "Español",
};

/** The key under which the browser binding saves a chosen language, beside `vista-theme`. */
export const LOCALE_STORAGE_KEY = "vista-locale";

// The translations are JSON, which TypeScript types as plain strings; they are held to English's shape here,
// and the dictionary tests check that each one has English's keys and placeholders.
const dictionaries: Readonly<Record<Locale, typeof en>> = {
  en,
  "pt-BR": ptBR as typeof en,
  es: es as typeof en,
};

let handleMissingKey: ((key: string, locale: Locale) => void) | undefined;

/** The interface's translation manager. Every dictionary is part of the app's code, so none is fetched. */
export const i18n = createI18n({
  locales: LOCALES,
  defaultLocale: "en",
  loadLocale: (locale) => dictionaries[locale],
  onMissingKey: (key, locale) => handleMissingKey?.(key, locale),
});

/** The text for a key in the interface language. */
export const t: typeof i18n.t = i18n.t;

/**
 * Sets what happens when `t()` is given a key no dictionary has, so the tests can fail on one; without it,
 * the manager warns.
 *
 * @param handler - Called with the key and the language, or `undefined` to warn again.
 */
export function setMissingKeyHandler(handler: ((key: string, locale: Locale) => void) | undefined): void {
  handleMissingKey = handler;
}

let binding: BrowserI18nBinding | null = null;
let starting: Promise<void> | null = null;

/**
 * Starts the interface language once: the saved choice, else the system's languages, else English, and keeps
 * `<html lang>` and `dir` in step with it. Calling it again while it starts or once it has returns the same
 * start.
 *
 * @returns Resolves once the language is in place.
 */
export function startLanguage(): Promise<void> {
  starting ??= (async () => {
    try {
      binding = await initializeBrowserI18n({ i18n, storageKey: LOCALE_STORAGE_KEY });
    } catch (error) {
      // A failed start can be tried again.
      starting = null;
      throw error;
    }
  })();
  return starting;
}

/** Stops following the system's languages and forgets the start, so the tests can start each one afresh. */
export function stopLanguage(): void {
  binding?.disconnect();
  binding = null;
  starting = null;
}

const getLocale = () => i18n.locale;
const isReady = () => i18n.isReady;

/**
 * The interface language, re-rendering the component that reads it whenever it changes.
 *
 * @returns The language in use.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(i18n.subscribe, getLocale, getLocale);
}

/**
 * Whether the interface language is in place, which the app waits for before it renders anything.
 *
 * @returns True once the language has started.
 */
export function useIsLanguageReady(): boolean {
  return useSyncExternalStore(i18n.subscribe, isReady, isReady);
}

/** What the Language row shows: _System_ or a chosen language, and the language _System_ gives. */
export interface LanguageChoice {
  choice: "system" | Locale;
  /** The language the system's languages give now, which choosing _System_ switches to. */
  systemLocale: Locale;
}

let shownChoice: LanguageChoice = { choice: "system", systemLocale: "en" };

function readChoice(): LanguageChoice {
  const choice = binding === null || binding.isUsingSystemLocale ? "system" : i18n.locale;
  // As the binding detects it: the system's languages, most preferred first, then English.
  const systemLocale = i18n.matchLocale(navigator.languages) ?? i18n.defaultLocale;
  if (shownChoice.choice !== choice || shownChoice.systemLocale !== systemLocale) {
    shownChoice = { choice, systemLocale };
  }
  return shownChoice;
}

function subscribeToChoice(listener: () => void): () => void {
  // The binding also reports a pick of the language already shown, and a change to following the system,
  // neither of which changes the language the manager reports.
  const unsubscribe = binding ? binding.subscribe(listener) : i18n.subscribe(listener);
  // While a language is chosen, the binding ignores a change to the system's languages, which still
  // changes the language _System_ names.
  window.addEventListener("languagechange", listener);
  return () => {
    unsubscribe();
    window.removeEventListener("languagechange", listener);
  };
}

/**
 * The Language row's selection, updated as the user chooses or the system's languages change.
 *
 * @returns The selected entry and the language _System_ gives.
 */
export function useLanguageChoice(): LanguageChoice {
  return useSyncExternalStore(subscribeToChoice, readChoice, readChoice);
}

/**
 * Chooses a language and saves the choice, or follows the system again and forgets it.
 *
 * @param choice - A language, or `"system"`.
 * @returns Resolves once the language applies; rejects, keeping the current one, when it can't load.
 */
export async function chooseLanguage(choice: "system" | Locale): Promise<void> {
  if (choice !== "system") {
    await i18n.setLocale(choice);
  } else if (binding !== null) {
    await binding.switchToSystemLocale();
  }
}
