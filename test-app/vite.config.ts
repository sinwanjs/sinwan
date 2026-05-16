import { defineConfig } from "vite";
import { sinwan } from "vite-plugin-sinwan";

export default defineConfig({
  plugins: [sinwan({ hoist: true, treeShake: true })],
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
