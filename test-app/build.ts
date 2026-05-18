/**
 * Sinwan Test-App Build Script — using Bun.build
 *
 * This replaces Vite for production builds, providing a faster
 * and more direct bundling process using Bun's native builder.
 *
 * Usage: bun run build.ts
 */

import { rm, mkdir } from "node:fs/promises";

import { sinwanBun } from "vite-plugin-sinwan";
const ROOT = import.meta.dir;
const DIST = `${ROOT}/dist`;
const SRC = `${ROOT}/src`;

console.log("🧹  cleaning dist/");
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await mkdir(`${DIST}/assets`, { recursive: true });

console.log("📦  bundling test-app scripts");
const result = await Bun.build({
  entrypoints: [
    `${SRC}/main.tsx`,
    `${SRC}/benchmarks/mount-bench.tsx`,
    `${SRC}/benchmarks/counter-stress.tsx`,
  ],
  plugins: [
    sinwanBun({ hoist: true, treeShake: true })
  ],
  outdir: `${DIST}/assets`,
  minify: true,
  splitting: true,
  format: "esm",
  naming: "[name].js",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __DEV__: JSON.stringify(false),
  },
});

if (!result.success) {
  console.error("❌  build failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// ─── Copy HTML and inject script tags ─────────────────────────
console.log("📄  processing HTML files");

const copyHtml = async (src: string, dest: string, scriptSrc: string) => {
  let html = await Bun.file(`${ROOT}/${src}`).text();
  
  // Replace the dev script tag with the bundled one.
  // We use a regex that matches the src attribute pattern.
  html = html.replace(
    /<script type="module" src="\/src\/.*?"><\/script>/,
    `<script type="module" src="${scriptSrc}"></script>`
  );
  
  // Fix the CSS path
  html = html.replace('href="/src/styles.css"', 'href="/assets/styles.css"');
  
  await Bun.write(`${DIST}/${dest}`, html);
};

await copyHtml("index.html", "index.html", "./assets/main.js");
await copyHtml("bench.html", "bench.html", "./assets/mount-bench.js");
await copyHtml("counter-stress.html", "counter-stress.html", "./assets/counter-stress.js");

// Copy CSS
const css = await Bun.file(`${SRC}/styles.css`).text();
await Bun.write(`${DIST}/assets/styles.css`, css);

console.log("✅  build complete → test-app/dist/");
