/**
 * Generate React-style entry shims at the root of `dist/`.
 *
 * For each public entry, we create:
 *   - `<entry>.js`   (CJS)  — NODE_ENV branch like React
 *   - `<entry>.mjs`  (ESM)  — re-exports the production ESM build (Node uses
 *                              `package.json` conditions to pick dev/prod;
 *                              this file is mostly a fallback).
 *   - `<entry>.d.ts` (Types) — re-export of the tsc-emitted declarations
 *                              when the entry's source file isn't already
 *                              at the dist root.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";

const ROOT = `${import.meta.dir}/..`;
const DIST = `${ROOT}/dist`;

interface PublicEntry {
  /** Public name used in `dist/<name>.js` */
  name: string;
  /** Path inside `dist/{cjs,esm}/` (without the `.<mode>.js` suffix). */
  internal: string;
  /** Path of the tsc-emitted `.d.ts` relative to dist root (no extension). */
  types: string;
}

const ENTRIES: PublicEntry[] = [
  {
    name: "component",
    internal: "component/index",
    types: "component/index",
  },
  { name: "event", internal: "event/index", types: "event/index" },
  { name: "hook", internal: "hook/index", types: "hook/index" },
  { name: "hydration", internal: "hydration/index", types: "hydration/index" },
  {
    name: "react-client",
    internal: "integrations/react/_client",
    types: "integrations/react/_client",
  },
  {
    name: "react-server",
    internal: "integrations/react/_server",
    types: "integrations/react/_server",
  },
  {
    name: "react-shared",
    internal: "integrations/react/_shared",
    types: "integrations/react/_shared",
  },
  {
    name: "react-static",
    internal: "integrations/react/_static",
    types: "integrations/react/_static",
  },
  {
    name: "react-type",
    internal: "integrations/react/_type",
    types: "integrations/react/_type",
  },
  {
    name: "jsx-runtime",
    internal: "jsx/jsx-runtime",
    types: "jsx/jsx-runtime",
  },
  {
    name: "jsx-dev-runtime",
    internal: "jsx/jsx-dev-runtime",
    types: "jsx/jsx-dev-runtime",
  },
  {
    name: "reactivity",
    internal: "reactivity/index",
    types: "reactivity/index",
  },
  { name: "renderer", internal: "renderer/index", types: "renderer/index" },
  { name: "server", internal: "server/index", types: "server/index" },
  { name: "store", internal: "store/index", types: "store/index" },
];

const cjsShim = (internal: string) => `'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/${internal}.production.min.js');
} else {
  module.exports = require('./cjs/${internal}.development.js');
}
`;

const mjsShim = (
  internal: string,
) => `// ESM consumers: Node/bundler resolves the proper variant via the
// "exports" field in package.json (development / production conditions).
// This file is a safe fallback that points at the production build.
export * from './esm/${internal}.production.min.js';
`;

const dtsShim = (typesPath: string, name: string) => {
  // If the public name already matches the d.ts location at the dist root,
  // tsc has already produced the file at the right place.
  if (typesPath === name) return null;
  return `export * from './${typesPath}';\n`;
};

await mkdir(DIST, { recursive: true });

// Drop "type" markers so Node treats bundles in each folder correctly,
// regardless of the root package.json's "type" field.
await mkdir(`${DIST}/esm`, { recursive: true });
await mkdir(`${DIST}/cjs`, { recursive: true });
await writeFile(
  `${DIST}/esm/package.json`,
  JSON.stringify({ type: "module", sideEffects: false }, null, 2) + "\n",
  "utf8",
);
await writeFile(
  `${DIST}/cjs/package.json`,
  JSON.stringify({ type: "commonjs", sideEffects: false }, null, 2) + "\n",
  "utf8",
);

for (const entry of ENTRIES) {
  const cjsPath = `${DIST}/${entry.name}.js`;
  const mjsPath = `${DIST}/${entry.name}.mjs`;
  const dtsPath = `${DIST}/${entry.name}.d.ts`;

  await writeFile(cjsPath, cjsShim(entry.internal), "utf8");
  await writeFile(mjsPath, mjsShim(entry.internal), "utf8");

  const dts = dtsShim(entry.types, entry.name);
  if (dts && !existsSync(dtsPath)) {
    await writeFile(dtsPath, dts, "utf8");
  }
}

console.log(`✨  generated ${ENTRIES.length * 2} shims at dist/`);
