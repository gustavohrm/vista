/**
 * The English interface text: the source the translations are written from, the fallback for a key a
 * translation lacks, and the type `t()` is checked against. `as const` keeps each message's text in its type,
 * so a call with an unknown key, or that leaves out a placeholder's value, fails to compile. The JSON
 * translations are only cast to this type, so the dictionary tests, not the compiler, catch a key or a
 * placeholder they get wrong. `docs/specs/languages.md`, "Writing translations", describes how keys are
 * grouped and messages written.
 */
const en = {
  settings: {
    sections: {
      language: "Language",
    },
    language: {
      title: "Language",
      lead: "Which language Vista is shown in, in every workspace.",
      label: "Language",
      description: "System follows your operating system's languages and changes with them.",
      system: "System ({language})",
    },
  },
} as const;

export default en;
