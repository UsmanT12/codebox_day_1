import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "frontend",
  base: "/tracker/",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
});
