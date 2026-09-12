/**
 * SinwanJS Release Metadata — from 1.0.0 to 1.4.0
 */

import { describe, it, expect } from "bun:test";

describe("release metadata", () => {
  /**
   * Publishes package version 1.4.0
   */
  it("publishes package version 1.4.0", async () => {
    const pkg = await Bun.file("package.json").json();
    expect(pkg.version).toBe("1.4.0");
    expect(pkg.exports["./renderer"]).toBeDefined();
  });

  /**
   * Uses a 1.4.0 changelog entry without removed patch entries
   */
  it("uses a 1.4.0 changelog entry without removed patch entries", async () => {
    const changelog = await Bun.file("CHANGELOG.md").text();
    expect(changelog).toContain("## [1.4.0]");
    expect(changelog).toContain("## [1.3.3]");
    expect(changelog).toContain("## [1.3.2]");
    expect(changelog).toContain("## [1.3.1]");
    expect(changelog).toContain("## [1.3.0]");
    expect(changelog).toContain("## [1.2.7]");
    expect(changelog).toContain("## [1.2.6]");
    expect(changelog).toContain("## [1.2.5]");
    expect(changelog).toContain("## [1.2.4]");
    expect(changelog).toContain("## [1.2.3]");
    expect(changelog).toContain("## [1.2.2]");
    expect(changelog).toContain("## [1.2.1]");
    expect(changelog).toContain("## [1.2.0]");
    expect(changelog).toContain("## [1.1.2]");
    expect(changelog).toContain("## [1.1.1]");
    expect(changelog).toContain("## [1.1.0]");
    expect(changelog).toContain("## [1.0.0]");
  });
});
