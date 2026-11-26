import { describe, expect, it } from "vitest";

import { readNotesByLocale } from "./updater-adapter";

describe("readNotesByLocale", () => {
  it("keeps each locale's summary, trimmed", () => {
    expect(
      readNotesByLocale({ "pt-BR": " Pastas abrem mais rápido.\n", es: "Las carpetas se abren más rápido." }),
    ).toEqual({
      "pt-BR": "Pastas abrem mais rápido.",
      es: "Las carpetas se abren más rápido.",
    });
  });

  it("leaves out a summary that is empty or not text", () => {
    expect(readNotesByLocale({ "pt-BR": " ", es: 3, fr: "Les dossiers s'ouvrent plus vite." })).toEqual({
      fr: "Les dossiers s'ouvrent plus vite.",
    });
  });

  it.each([undefined, null, "notes", ["a"], {}])("gives nothing for a manifest without summaries: %j", (value) => {
    expect(readNotesByLocale(value)).toBeUndefined();
  });
});
