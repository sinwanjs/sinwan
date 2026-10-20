import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const src = join(root, "src");
const workDir = join(root, ".tmp-consumer-bundle");
const libDir = join(workDir, "lib");

const CLIENTS = ["for", "show", "index", "visible"] as const;

async function bundleText(
  entry: string,
  options: Partial<Parameters<typeof Bun.build>[0]> = {},
): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
    minify: false,
    ...options,
  });
  expect(result.success).toBe(true);
  const parts = await Promise.all(result.outputs.map((output) => output.text()));
  return parts.join("\n");
}

async function buildLibrary(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [
      join(src, "component/index.ts"),
      join(src, "hydration/index.ts"),
      join(src, "server/index.ts"),
      ...CLIENTS.map((name) =>
        join(src, `control-flow/components/${name}/client.ts`),
      ),
    ],
    root: src,
    outdir: libDir,
    target: "browser",
    format: "esm",
    splitting: true,
    packages: "external",
    minify: false,
  });
  expect(result.success).toBe(true);
}

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("control-flow consumer bundle", () => {
  it("keeps each imported primitive's renderer registration", async () => {
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });
    await buildLibrary();

    const cases = [
      ["for", "For", "renderForBlock"],
      ["show", "Show", "renderShowBlock"],
      ["index", "Index", "renderIndexBlock"],
      ["visible", "Visible", "registerControlFlowFactory"],
    ] as const;

    for (const [dir, name, marker] of cases) {
      const entry = join(workDir, `entry-${dir}.js`);
      await writeFile(
        entry,
        `import { ${name} } from "./lib/control-flow/components/${dir}/client.js";\nconsole.log(${name});\n`,
      );
      const text = await bundleText(entry);
      expect(text).toContain(marker);
    }
  });
});
