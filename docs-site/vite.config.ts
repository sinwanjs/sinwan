import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "sinwan",
  },
  server: {
    port: 3000,
  },
});
