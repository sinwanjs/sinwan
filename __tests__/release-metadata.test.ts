/**
 * SinwanJS Release Metadata — 1.1.1
 */

import { describe, it, expect } from "bun:test";

describe("release metadata", () => {
  it("publishes package version 1.1.1", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.version).toBe("1.1.2");
    expect(pkg.exports["./renderer"]).toBeDefined();
  });

  it("uses a 1.1.2 changelog entry without removed patch entries", async () => {
    const changelog = await Bun.file("docs/v1/CHANGELOG.md").text();
    expect(changelog).toContain("## [1.1.2]");
    expect(changelog).toContain("## [1.1.1]");
    expect(changelog).toContain("## [1.1.0]");
    expect(changelog).toContain("## [1.0.0]");
  });
});
