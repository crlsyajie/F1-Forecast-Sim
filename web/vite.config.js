import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative asset paths work both on GitHub Pages (/F1-Forecast-Sim/) and when inlined into one file.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
});
