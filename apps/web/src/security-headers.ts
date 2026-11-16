// The security headers on every response the web host sends. The Worker sets them on its own responses, and
// `public/_headers` sets the same ones on the static app, which Cloudflare serves without running the Worker;
// `worker.test.ts` fails when the two lists differ. A route never loosens them.
//
// `style-src` allows inline styles because CodeMirror and Milkdown inject their own, and `img-src` allows any
// HTTPS image because a note's web images load in the browser (docs/specs/workspaces.md). Scripts come only from the
// app's own origin, and nothing may frame the app.
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
