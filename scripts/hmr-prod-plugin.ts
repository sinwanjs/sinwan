import { resolve } from "node:path";
import type { BunPlugin } from "bun";

const STUB = resolve(
  import.meta.dir,
  "../src/hmr/component-registry.prod-stub.ts",
);

/**
 * Production builds load the no-op Fast Refresh registry.
 * Development keeps `hmr/component-registry.ts`.
 */
export const hmrProdPlugin: BunPlugin = {
  name: "sinwan-hmr-prod-stub",
  setup(build) {
    build.onResolve({ filter: /component-registry\.ts$/ }, (args) => {
      if (args.path.includes("prod-stub")) return;
      return { path: STUB };
    });
  },
};
