/**
 * Internal: bundle one (format, mode) combination.
 * Invoked by build.ts in a fresh Bun subprocess so it sees the
 * temporarily-stripped `sideEffects` flag in package.json.
 *
 *   bun run scripts/bundle.ts <format> <mode>
 *
 *   format = "esm" | "cjs"
 *   mode   = "development" | "production"
 */

const [, , formatArg, modeArg] = process.argv;

if (formatArg !== "esm" && formatArg !== "cjs") {
  console.error(`Invalid format: ${formatArg}`);
  process.exit(1);
}
if (modeArg !== "development" && modeArg !== "production") {
  console.error(`Invalid mode: ${modeArg}`);
  process.exit(1);
}

const format = formatArg as "esm" | "cjs";
const mode = modeArg as "development" | "production";
const isProd = mode === "production";
const suffix = isProd ? "production.min" : "development";

const ROOT = `${import.meta.dir}/..`;
const SRC = `${ROOT}/src`;
const OUTDIR = `${ROOT}/dist/${format}`;

const ENTRYPOINTS = [
  `${SRC}/component/index.ts`,
  `${SRC}/event/index.ts`,
  `${SRC}/hook/index.ts`,
  `${SRC}/hydration/index.ts`,
  `${SRC}/integrations/react/_client.ts`,
  `${SRC}/integrations/react/_server.ts`,
  `${SRC}/integrations/react/_shared.ts`,
  `${SRC}/integrations/react/_static.ts`,
  `${SRC}/integrations/react/_type.ts`,
  `${SRC}/jsx/jsx-runtime.ts`,
  `${SRC}/jsx/jsx-dev-runtime.ts`,
  `${SRC}/reactivity/index.ts`,
  `${SRC}/renderer/index.ts`,
  `${SRC}/server/index.ts`,
  `${SRC}/store/index.ts`,
];

const result = await Bun.build({
  entrypoints: ENTRYPOINTS,
  root: SRC,
  outdir: OUTDIR,
  target: format === "cjs" ? "node" : "bun",
  format,
  splitting: format === "esm",
  packages: "external",
  // sourcemap: isProd ? "external" : "linked",
  minify: isProd
    ? { whitespace: true, syntax: true, identifiers: format === "cjs" }
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
  console.error(`❌  bundle ${format}/${mode} failed:`);
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
