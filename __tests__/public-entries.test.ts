import { describe, expect, it } from "bun:test";
import * as component from "../src/component/index.ts";
import * as controlFlow from "../src/control-flow/index.ts";
import { For as ForClient } from "../src/control-flow/components/for/client.ts";
import { For as ForIdentity } from "../src/control-flow/identity.ts";

const CONTROL_FLOW = [
  "Show",
  "For",
  "Switch",
  "Match",
  "Index",
  "Key",
  "Dynamic",
  "Visible",
  "Portal",
  "ErrorBoundary",
  "Virtual",
] as const;

describe("public entries", () => {
  it("sinwan/control-flow exports the control-flow primitives", () => {
    expect(Object.keys(controlFlow).sort()).toEqual([...CONTROL_FLOW].sort());
    for (const name of CONTROL_FLOW) {
      expect(typeof controlFlow[name]).toBe("function");
    }
    expect(controlFlow.For).toBe(ForClient);
    expect(controlFlow.For).toBe(ForIdentity);
  });

  it("sinwan/component exports components without control flow", () => {
    expect(typeof component.cc).toBe("function");
    expect(typeof component.onMounted).toBe("function");
    expect(typeof component.provide).toBe("function");
    const exported = new Set(Object.keys(component));
    for (const name of CONTROL_FLOW) {
      expect(exported.has(name)).toBe(false);
    }
  });
});
