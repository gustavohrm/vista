import { defineConfig } from "vite";
import { iconsPlugin } from "@codenhub/vite-plugin-icons";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "./src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "./src/index.html",
    },
  },
  plugins: [tailwindcss(), iconsPlugin()],
});
