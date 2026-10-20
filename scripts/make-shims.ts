/**
 * Generate ESM entry shims at the root of `dist/`.
 *
 * For each public entry:
 *   - `<entry>.development.js` — re-exports the development ESM build
 *   - `<entry>.production.min.js` — re-exports the production ESM build
 *   - `<entry>.d.ts` — types re-export when needed
 *
 * `package.json` `exports` select via `development` / `production` conditions;
 * `default` points at the production shim.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, relative } from "node:path";

const ROOT = `${import.meta.dir}/..`;
const DIST = `${ROOT}/dist`;

interface PublicEntry {
  /** Public name used in `dist/<name>.*` */
  name: string;
  /** Path inside `dist/esm/` (without the `.<mode>.js` suffix). */
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
  {
    name: "control-flow",
    internal: "control-flow/index",
    types: "control-flow/index",
  },
  { name: "event", internal: "event/index", types: "event/index" },
  { name: "hook", internal: "hook/index", types: "hook/index" },
  { name: "hydration", internal: "hydration/index", types: "hydration/index" },
  {
    name: "react",
    internal: "react/index",
    types: "react/index",
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
  {
    name: "renderer/web",
    internal: "renderer/web",
    types: "renderer/web",
  },
  { name: "server", internal: "server/index", types: "server/index" },
];

/** Relative import from `dist/<name>.*` to `dist/esm/<internal>.*`. */
const shim = (name: string, internal: string, suffix: string): string => {
  const fromDir = dirname(`${DIST}/${name}.js`);
  const target = `${DIST}/esm/${internal}.${suffix}.js`;
  let rel = relative(fromDir, target).split("\\").join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return `export * from '${rel}';\n`;
};

const dtsShim = (typesPath: string, name: string) => {
  if (typesPath === name) return null;
  return `export * from './${typesPath}';\n`;
};

await mkdir(DIST, { recursive: true });
await mkdir(`${DIST}/esm`, { recursive: true });

const nestedSideEffects = ["./control-flow/components/*/client.*.js"];
await writeFile(
  `${DIST}/esm/package.json`,
  JSON.stringify(
    { type: "module", sideEffects: nestedSideEffects },
    null,
    2,
  ) + "\n",
  "utf8",
);

for (const entry of ENTRIES) {
  const base = `${DIST}/${entry.name}`;
  await mkdir(dirname(base), { recursive: true });

  const development = shim(entry.name, entry.internal, "development");
  const production = shim(entry.name, entry.internal, "production.min");

  await writeFile(`${base}.development.js`, development, "utf8");
  await writeFile(`${base}.production.min.js`, production, "utf8");

  const dts = dtsShim(entry.types, entry.name);
  if (dts && !existsSync(`${base}.d.ts`)) {
    await writeFile(`${base}.d.ts`, dts, "utf8");
  }
}

console.log(
  `✨  generated ${ENTRIES.length}× (development + production) ESM shims at dist/`,
);
