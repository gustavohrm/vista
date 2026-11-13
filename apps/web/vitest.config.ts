import { defineConfig } from "vitest/config";

// Unit tests for the Worker. The browser host itself is covered by the Playwright tests in `tests/`.
export default defineConfig({
  test: {
    name: "web",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
