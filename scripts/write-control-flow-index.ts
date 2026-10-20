/**
 * After Bun.build, write `control-flow/index.{development,production.min}.js`
 * as thin ESM re-exports so app bundlers can tree-shake unused control-flow.
 */

import { mkdir, writeFile } from "node:fs/promises";

const ROOT = `${import.meta.dir}/..`;
const DIST = `${ROOT}/dist`;

const CONTROL_FLOW = [
  ["show", ["Show"]],
  ["for", ["For"]],
  ["switch", ["Switch"]],
  ["match", ["Match"]],
  ["index", ["Index"]],
  ["key", ["Key"]],
  ["dynamic", ["Dynamic"]],
  ["visible", ["Visible"]],
  ["portal", ["Portal"]],
  ["error-boundary", ["ErrorBoundary"]],
  ["virtual", ["Virtual"]],
] as const;

function esmIndex(suffix: string): string {
  const lines: string[] = [];
  for (const [dir, names] of CONTROL_FLOW) {
    lines.push(
      `export { ${names.join(", ")} } from "./components/${dir}/client.${suffix}.js";`,
    );
  }
  return lines.join("\n") + "\n";
}

await mkdir(`${DIST}/esm/control-flow`, { recursive: true });
for (const suffix of ["development", "production.min"] as const) {
  const path = `${DIST}/esm/control-flow/index.${suffix}.js`;
  await writeFile(path, esmIndex(suffix), "utf8");
  console.log(`  wrote thin esm/control-flow/index.${suffix}.js`);
}
