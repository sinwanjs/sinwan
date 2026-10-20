import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("sinwan/server module graph", () => {
  it("omits client control-flow renderers", async () => {
    const result = await Bun.build({
      entrypoints: [join(root, "src/server/index.ts")],
      target: "browser",
      format: "esm",
      packages: "external",
      minify: false,
    });
    expect(result.success).toBe(true);
    const parts = await Promise.all(
      result.outputs.map((output) => output.text()),
    );
    const text = parts.join("\n");
    expect(text).not.toContain("function renderForBlock");
    expect(text).not.toContain("function renderShowBlock");
    expect(text).toContain("function renderToString");
  });
});
