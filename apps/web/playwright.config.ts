import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:8799",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "pnpm --filter=@vista/web build && pnpm --filter=@vista/web exec wrangler dev --local --ip 127.0.0.1 --port 8799 --inspector-port 9249",
    cwd: "../..",
    url: "http://127.0.0.1:8799",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
