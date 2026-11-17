/** An asset imported for its URL, which the bundler copies into the build. */
declare module "*.svg?url" {
  const url: string;
  export default url;
}

/** An asset imported as its text, which the bundler inlines. */
declare module "*.svg?raw" {
  const text: string;
  export default text;
}

/**
 * Vite's `import.meta.glob`, in the one form the app uses: files read as text at build time and inlined, keyed
 * by their path relative to the importing file.
 */
interface ImportMeta {
  glob(pattern: string, options: { query: "?raw"; import: "default"; eager: true }): Record<string, string>;
}
