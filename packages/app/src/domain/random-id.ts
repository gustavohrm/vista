/**
 * A random id. `crypto.randomUUID` exists only in secure contexts, and the web host's directory-input
 * fallback also runs outside them, so this falls back to `crypto.getRandomValues`, which does not.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
