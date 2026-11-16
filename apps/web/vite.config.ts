import lucide from "@codenhub/icons/data/lucide";
import viteIcons from "@codenhub/icons/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const iconsPlugin = viteIcons({
  mode: "svg",
  defaultPrefix: "lucide",
  families: [lucide],
});

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  plugins: [react(), tailwindcss(), iconsPlugin],
});
