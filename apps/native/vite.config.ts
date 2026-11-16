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
