/**
 * The English interface text: the source the translations are written from, the fallback for a key a
 * translation lacks, and the type every dictionary is held to. `as const` keeps each message's text in its
 * type, so a call that leaves out a placeholder's value fails to compile. `docs/specs/languages.md`,
 * "Writing translations", describes how keys are grouped and messages written.
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
