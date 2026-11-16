/** An asset imported for its URL, which the bundler copies into the build. */
declare module "*.svg?url" {
  const url: string;
  export default url;
}
