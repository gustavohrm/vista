import lucide from "@codenhub/icons/data/lucide";
import viteIcons from "@codenhub/icons/vite";
import { defineConfig } from "vitest/config";

const iconsPlugin = viteIcons({
  mode: "svg",
  defaultPrefix: "lucide",
  families: [lucide],
});

const originalTransform = iconsPlugin.transform;
if (typeof originalTransform === "function") {
  iconsPlugin.transform = function (code: string, id: string) {
    const res = (originalTransform as (c: string, i: string) => unknown).call(this, code, id) as
      | { code?: string }
      | string
      | null
      | undefined;
    if (!res) {
      return res;
    }
    const str = typeof res === "string" ? res : res.code;
    if (!str) {
      return res;
    }
    const cleaned = str.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svgBlock: string) =>
      svgBlock
        .replaceAll('\\"', '"')
        .replaceAll('stroke-width="', 'strokeWidth="')
        .replaceAll('stroke-linecap="', 'strokeLinecap="')
        .replaceAll('stroke-linejoin="', 'strokeLinejoin="'),
    );
    return typeof res === "string" ? cleaned : { ...res, code: cleaned };
  };
}

export default defineConfig({
  plugins: [iconsPlugin],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-setup.ts", "src/index.ts", "src/ports.ts"],
    },
  },
});
