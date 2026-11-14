import { expect, test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    reportCspViolation?: (violation: string) => Promise<void>;
  }
}

// Every test fails when its page breaks the content security policy in `src/public/_headers`, so a change that
// needs a looser policy shows up here rather than as a feature that silently stops working in production.
// Violations are collected on the test's side, so a navigation or reload, which starts a new document, cannot
// drop the ones reported before it.
export const test = base.extend<{ cspViolations: void }>({
  cspViolations: [
    async ({ page }, use) => {
      const violations: string[] = [];
      await page.exposeBinding("reportCspViolation", (_source, violation: string) => {
        violations.push(violation);
      });
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          void window.reportCspViolation?.(`${event.effectiveDirective} blocked ${event.blockedURI || "inline"}`);
        });
      });
      await use();
      if (!page.isClosed()) {
        // A round trip to the page, so a violation reported just before the test ended has arrived.
        await page.evaluate(() => undefined);
      }
      expect(violations, "content security policy violations").toEqual([]);
    },
    { auto: true },
  ],
});
