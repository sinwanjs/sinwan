/**
 * Sinwan build script — produces dual development / production bundles
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

// ─── 3. Build JS bundles (cjs/esm × dev/prod) ───────────────
// NOTE: Bun.build reads `sideEffects: false` from package.json and
// over-tree-shakes during our own build, dropping re-exported symbols.
// We strip that flag from package.json on disk, run the bundling in
// FRESH child processes (so they read the modified file), then restore.
const ORIGINAL_PKG = await Bun.file(PKG_PATH).text();
const pkg = JSON.parse(ORIGINAL_PKG);
delete pkg.sideEffects;
await Bun.write(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");

try {
  const matrix = [
    ["esm", "development"],
    ["esm", "production"],
    ["cjs", "development"],
    ["cjs", "production"],
  ] as const;

  for (const [format, mode] of matrix) {
    console.log(`📦  bundling ${format} (${mode})`);
    await run(
      ["bun", "run", BUNDLE_SCRIPT, format, mode],
      `bundle ${format}/${mode}`,
    );
  }
} finally {
  // Always restore the original package.json (with sideEffects flag).
  await Bun.write(PKG_PATH, ORIGINAL_PKG);
}

// ─── 4. React-style entry shims ─────────────────────────────
console.log("🔗  writing entry shims");
await run(["bun", "run", SHIMS_SCRIPT], "make-shims");

console.log("✅  build complete → dist/");
