import { defineConfig, mergeConfig } from "vite";
import path from "path";
import baseConfig from "../../packages/core/vite.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: path.resolve(__dirname, "../../packages/core"),
    build: {
      outDir: path.resolve(__dirname, "./dist"),
    },
  })
);
