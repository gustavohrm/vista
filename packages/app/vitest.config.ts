import lucide from "@codenhub/icons/data/lucide";
import viteIcons from "@codenhub/icons/vite";
import { defineConfig } from "vitest/config";

const iconsPlugin = viteIcons({
  mode: "svg",
  defaultPrefix: "lucide",
  families: [lucide],
});

export default defineConfig({
  plugins: [iconsPlugin],
  test: {
    name: "app",
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
