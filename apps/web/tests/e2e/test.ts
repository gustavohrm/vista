import { expect, test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    cspViolations?: string[];
  }
}

// Every test fails when its page breaks the content security policy in `src/public/_headers`, so a change that
// needs a looser policy shows up here rather than as a feature that silently stops working in production.
export const test = base.extend<{ cspViolations: void }>({
  cspViolations: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        window.cspViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          window.cspViolations?.push(`${event.effectiveDirective} blocked ${event.blockedURI || "inline"}`);
        });
      });
      await use();
      const violations = page.isClosed() ? [] : await page.evaluate(() => window.cspViolations ?? []);
      expect(violations, "content security policy violations").toEqual([]);
    },
    { auto: true },
  ],
});
