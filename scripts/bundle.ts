/**
 * Internal: bundle one ESM mode combination.
 * Invoked by build.ts in a fresh Bun subprocess so it sees the
 * temporarily-stripped `sideEffects` flag in package.json.
 *
 *   bun run scripts/bundle.ts esm <mode>
 *
 *   mode = "development" | "production"
 */

import { hmrProdPlugin } from "./hmr-prod-plugin.ts";

const [, , formatArg, modeArg] = process.argv;

if (formatArg !== "esm") {
  console.error(`Invalid format: ${formatArg} (ESM-only build; use "esm")`);
  process.exit(1);
}
if (modeArg !== "development" && modeArg !== "production") {
  console.error(`Invalid mode: ${modeArg}`);
  process.exit(1);
}

const mode = modeArg as "development" | "production";
const isProd = mode === "production";
const suffix = isProd ? "production.min" : "development";

const ROOT = `${import.meta.dir}/..`;
const SRC = `${ROOT}/src`;
const OUTDIR = `${ROOT}/dist/esm`;

const CONTROL_FLOW_CLIENTS = [
  "activity",
  "dynamic",
  "error-boundary",
  "for",
  "index",
  "key",
  "match",
  "portal",
  "show",
  "suspense",
  "switch",
  "view-transition",
  "virtual",
  "visible",
].map(
  (name) => `${SRC}/control-flow/components/${name}/client.ts`,
);

const ENTRYPOINTS = [
  `${SRC}/component/index.ts`,
  ...CONTROL_FLOW_CLIENTS,
  `${SRC}/event/index.ts`,
  `${SRC}/hook/index.ts`,
  `${SRC}/hydration/index.ts`,
  `${SRC}/react/index.ts`,
  `${SRC}/jsx/jsx-runtime.ts`,
  `${SRC}/jsx/jsx-dev-runtime.ts`,
  `${SRC}/reactivity/index.ts`,
  `${SRC}/renderer/core.ts`,
  `${SRC}/renderer/web.ts`,
  `${SRC}/server/index.ts`,
];

const result = await Bun.build({
  entrypoints: ENTRYPOINTS,
  root: SRC,
  outdir: OUTDIR,
  target: "browser",
  format: "esm",
  splitting: true,
  packages: "external",
  plugins: isProd ? [hmrProdPlugin] : [],
  minify: isProd
    ? { whitespace: true, syntax: true, identifiers: false }
    : false,
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
    __DEV__: JSON.stringify(!isProd),
  },
  naming: {
    entry: `[dir]/[name].${suffix}.js`,
    chunk: `_chunks/[name]-[hash].js`,
    asset: `_assets/[name]-[hash].[ext]`,
  },
});

if (!result.success) {
  console.error(`❌  bundle esm/${mode} failed:`);
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
