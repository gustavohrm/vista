import { defineConfig, mergeConfig } from "vite";
import path from "path";
import baseConfig from "../../packages/core/vite.config";

const host = process.env.TAURI_DEV_HOST;

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: path.resolve(__dirname, "../../packages/core"),
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1430,
          }
        : undefined,
    },
    envPrefix: ["VITE_", "TAURI_"],
    build: {
      target: process.env.TAURI_PLATFORM === "android" ? "chrome100" : "safari15",
      minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
      sourcemap: !!process.env.TAURI_DEBUG,
      outDir: path.resolve(__dirname, "./dist"),
      emptyOutDir: true,
    },
  })
);
