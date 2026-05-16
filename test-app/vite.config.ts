import { defineConfig } from "vite";
import { sinwan, sinwanTreeShake } from "vite-plugin-sinwan";

export default defineConfig({
  plugins: [sinwan(), sinwanTreeShake({ verbose: true })],
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "sinwan",
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        bench: "bench.html",
      },
    },
  },
});
