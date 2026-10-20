/**
 * SinwanJS Release Metadata — from 1.0.0 to 2.0.0
 */

import { describe, it, expect } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("release metadata", () => {
  /**
   * Publishes package version 2.0.0
   */
  it("publishes package version 2.0.1", async () => {
    const pkg = await Bun.file(join(root, "package.json")).json();
    expect(pkg.version).toBe("2.0.1");
    expect(pkg.exports["./renderer"]).toBeDefined();
    expect(pkg.exports["./control-flow"]).toBeDefined();
  });

  /**
   * Uses a 1.5.1 changelog entry without removed patch entries
   */
  it("uses a 1.5.1 changelog entry without removed patch entries", async () => {
    const changelog = await Bun.file(join(root, "CHANGELOG.md")).text();
    expect(changelog).toContain("## [2.0.1]");
    expect(changelog).toContain("## [2.0.0]");
    expect(changelog).toContain("## [1.5.1]");
    expect(changelog).toContain("## [1.5.0]");
    expect(changelog).toContain("## [1.4.1]");
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
