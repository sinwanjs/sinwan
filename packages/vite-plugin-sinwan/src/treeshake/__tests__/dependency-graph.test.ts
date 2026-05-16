import { describe, expect, it } from "bun:test";
import {
  resolveTransitiveDependencies,
  resolveRequiredModules,
} from "../dependency-graph";

describe("resolveTransitiveDependencies", () => {
  it("keeps directly-used exports", () => {
    const needed = resolveTransitiveDependencies(new Set(["Show", "For"]));
    expect(needed.has("Show")).toBe(true);
    expect(needed.has("For")).toBe(true);
  });

  it("includes always-keep primitives", () => {
    const needed = resolveTransitiveDependencies(new Set(["Show"]));
    expect(needed.has("signal")).toBe(true);
    expect(needed.has("computed")).toBe(true);
    expect(needed.has("effect")).toBe(true);
    expect(needed.has("Fragment")).toBe(true);
  });

  it("expands renderer dependencies", () => {
    const needed = resolveTransitiveDependencies(new Set(["mount"]));
    expect(needed.has("renderNodeToDOM")).toBe(true);
    expect(needed.has("renderElementToDOM")).toBe(true);
    expect(needed.has("createComponentInstance")).toBe(true);
  });

  it("includes helpers when a renderer is kept", () => {
    const needed = resolveTransitiveDependencies(new Set(["render"]));
    expect(needed.has("isShowElement")).toBe(true);
    expect(needed.has("isForElement")).toBe(true);
  });

  it("expands Visible dependencies", () => {
    const needed = resolveTransitiveDependencies(new Set(["Visible"]));
    expect(needed.has("computed")).toBe(true);
    expect(needed.has("resolve")).toBe(true);
  });
});

describe("resolveRequiredModules", () => {
  it("resolves modules for Show", () => {
    const mods = resolveRequiredModules(new Set(["Show"]));
    expect(mods.has("component/control-flow.ts")).toBe(true);
  });

  it("resolves modules for signal", () => {
    const mods = resolveRequiredModules(new Set(["signal"]));
    expect(mods.has("reactivity/signal.ts")).toBe(true);
  });

  it("includes transitive module dependencies", () => {
    const mods = resolveRequiredModules(new Set(["mount"]));
    expect(mods.has("renderer/mount.ts")).toBe(true);
    expect(mods.has("renderer/render-children.ts")).toBe(true);
    expect(mods.has("component/instance.ts")).toBe(true);
  });
});
