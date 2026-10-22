/**
 * SinwanJS Release Metadata — package.json version ↔ CHANGELOG heading
 */

import { describe, it, expect } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("release metadata", () => {
  /**
   * package.json version must match the latest changelog heading.
   * Update this suite whenever section 8 bumps the package version.
   */
  it("publishes package version matching package.json and changelog", async () => {
    const pkg = await Bun.file(join(root, "package.json")).json();
    expect(typeof pkg.version).toBe("string");
    expect(pkg.version).toBe("2.0.2");
    expect(pkg.exports["./renderer"]).toBeDefined();
    expect(pkg.exports["./control-flow"]).toBeDefined();

    const changelog = await Bun.file(join(root, "CHANGELOG.md")).text();
    expect(changelog).toContain(`## [${pkg.version}]`);
  });

  /**
   * Prior release headings remain in the chronology.
   */
  it("keeps prior changelog version headings", async () => {
    const changelog = await Bun.file(join(root, "CHANGELOG.md")).text();
    expect(changelog).toContain("## [2.0.2]");
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
