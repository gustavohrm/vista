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
