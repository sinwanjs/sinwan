/**
 * Sinwan build script — ESM development / production bundles
 * (React-style: `*.development.js` + `*.production.min.js`) plus full
 * TypeScript declarations.
 *
 *   bun run build.ts
 */

import { $ } from "bun";
import { rm } from "node:fs/promises";

const ROOT = import.meta.dir;
const DIST = `${ROOT}/dist`;
const PKG_PATH = `${ROOT}/package.json`;
const BUNDLE_SCRIPT = `${ROOT}/scripts/bundle.ts`;
const SHIMS_SCRIPT = `${ROOT}/scripts/make-shims.ts`;

async function run(cmd: string[], label: string) {
  const proc = Bun.spawn(cmd, {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${label} exited with code ${code}`);
  }
}

// ─── 1. Clean dist ──────────────────────────────────────────
console.log("🧹  cleaning dist/");
await rm(DIST, { recursive: true, force: true });

// ─── 2. Emit .d.ts declarations via tsc ─────────────────────
console.log("📝  emitting type declarations");
await $`bunx tsc -p tsconfig.build.json`.cwd(ROOT);

// ─── 3. Build ESM bundles (dev + prod) ───────────────────────
// NOTE: Bun.build may over-tree-shake with sideEffects set; strip during
// bundling in fresh child processes, then restore.
const ORIGINAL_PKG = await Bun.file(PKG_PATH).text();
const pkg = JSON.parse(ORIGINAL_PKG);
delete pkg.sideEffects;
await Bun.write(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");

try {
  for (const mode of ["development", "production"] as const) {
    console.log(`📦  bundling esm (${mode})`);
    await run(
      ["bun", "run", BUNDLE_SCRIPT, "esm", mode],
      `bundle esm/${mode}`,
    );
  }
} finally {
  await Bun.write(PKG_PATH, ORIGINAL_PKG);
}

// ─── 4. Thin control-flow index (tree-shakeable per-primitive re-exports) ─
console.log("🧩  writing thin control-flow index");
await run(
  ["bun", "run", `${ROOT}/scripts/write-control-flow-index.ts`],
  "write-control-flow-index",
);

// ─── 5. Thin renderer index (core vs web split) ─────────────
console.log("🧩  writing thin renderer index");
await run(
  ["bun", "run", `${ROOT}/scripts/write-renderer-index.ts`],
  "write-renderer-index",
);

// ─── 6. ESM entry shims ─────────────────────────────────────
console.log("🔗  writing entry shims");
await run(["bun", "run", SHIMS_SCRIPT], "make-shims");

console.log("✅  build complete → dist/ (ESM only)");
