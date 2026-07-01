import { defineConfig, mergeConfig } from "vite";
import path from "path";
import baseConfig from "../../packages/core/vite.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: path.resolve(__dirname, "../../packages/core"),
    server: {
      port: 1420,
      strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_"],
    build: {
      target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari13",
      minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
      sourcemap: !!process.env.TAURI_DEBUG,
      outDir: path.resolve(__dirname, "./dist"),
      emptyOutDir: true,
    },
  })
);
