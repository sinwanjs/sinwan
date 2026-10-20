import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import {
  resolveLatestComponent,
  replaceComponent,
  registerRefreshRoot,
  rerenderRefreshRoots,
} from "../src/hmr/component-registry.prod-stub.ts";
import { hmrProdPlugin } from "../scripts/hmr-prod-plugin.ts";

const root = join(import.meta.dir, "..");

async function bundleText(
  entry: string,
  plugins: typeof hmrProdPlugin[] = [],
): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(root, entry)],
    target: "browser",
    format: "esm",
    packages: "external",
    minify: false,
    plugins,
  });
  expect(result.success).toBe(true);
  const parts = await Promise.all(result.outputs.map((output) => output.text()));
  return parts.join("\n");
}

describe("hmr production stub", () => {
  it("resolveLatestComponent is identity", () => {
    const fn = () => 1;
    expect(resolveLatestComponent(fn)).toBe(fn);
  });

  it("production bundle redirects the live registry to the stub", async () => {
    const entry = "src/react/create-root.ts";
    const dev = await bundleText(entry);
    expect(dev).toContain("latestOf");
    expect(dev).toContain("rootRerenders");

    const prod = await bundleText(entry, [hmrProdPlugin]);
    expect(prod).not.toContain("latestOf");
    expect(prod).not.toContain("rootRerenders");
  });

  it("replace/register/rerender are no-ops", () => {
    replaceComponent(
      () => null,
      () => null,
    );
    const dispose = registerRefreshRoot(() => {
      throw new Error("should not run");
    });
    rerenderRefreshRoots();
    dispose();
  });
});
