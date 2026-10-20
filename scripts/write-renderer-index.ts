/**
 * After Bun.build, rewrite `renderer/index.*.js` as thin ESM re-exports so
 * `import { render }` does not force-evaluate the web/template entry.
 */

import { mkdir, writeFile } from "node:fs/promises";

const ROOT = `${import.meta.dir}/..`;
const DIST = `${ROOT}/dist`;

function esmIndex(suffix: string): string {
  return [
    `export * from "./core.${suffix}.js";`,
    `export * from "./web.${suffix}.js";`,
    ``,
  ].join("\n");
}

await mkdir(`${DIST}/esm/renderer`, { recursive: true });
for (const suffix of ["development", "production.min"] as const) {
  const path = `${DIST}/esm/renderer/index.${suffix}.js`;
  await writeFile(path, esmIndex(suffix), "utf8");
  console.log(`  wrote thin esm/renderer/index.${suffix}.js`);
}
