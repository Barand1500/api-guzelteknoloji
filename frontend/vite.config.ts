import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.PUBLIC_BUILD_DIR || path.resolve(here, "../public");

export default defineConfig({
  root: here,
  plugins: [react()],
  build: { outDir, emptyOutDir: true },
});
