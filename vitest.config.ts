import { defineConfig } from "vitest/config";

// One Vitest run covers every package and app: each one with a vitest.config.ts of its own is a project
// here, named in that file, so `pnpm test --project <name>` runs one alone.
export default defineConfig({
  test: {
    projects: [
      // The repository's own scripts. It also keeps the list from being empty, which Vitest refuses, before
      // the first package exists.
      { test: { name: "root", include: ["scripts/**/*.test.ts", "scripts/**/*.test.mjs"] } },
      "packages/*/vitest.config.ts",
      "apps/*/vitest.config.ts",
    ],
    // A workspace with no tests yet is not a failure.
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/*/src/**", "scripts/**"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.test.mjs",
        // Test setup, and modules that only re-export or declare types.
        "packages/app/src/test-setup.ts",
        "packages/app/src/index.ts",
        "packages/app/src/ports.ts",
      ],
    },
  },
});
