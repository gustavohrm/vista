import { defineConfig } from "vitest/config";

// Unit tests for the desktop host's own logic. Tauri calls are checked by running the app.
export default defineConfig({
  test: {
    name: "native",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
