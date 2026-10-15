import lucide from "@codenhub/icons/data/lucide";
import viteIcons from "@codenhub/icons/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const host = env.TAURI_DEV_HOST || false;

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

  return {
    root: "src",
    clearScreen: false,
    envPrefix: ["VITE_", "TAURI_ENV_"],
    plugins: [react(), tailwindcss(), iconsPlugin],
    build: {
      outDir: "../dist",
      emptyOutDir: true,
    },
    server: {
      host,
      port: 1420,
      strictPort: true,
      hmr: host
        ? {
            host,
            port: 1421,
            protocol: "ws",
          }
        : undefined,
    },
  };
});
