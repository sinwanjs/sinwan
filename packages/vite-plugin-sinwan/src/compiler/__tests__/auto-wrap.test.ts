import { describe, it, expect } from "bun:test";
import { transformJSX } from "../transform";

describe("transformJSX - Auto Wrap", () => {
  it("auto-wraps custom component reactive props", () => {
    const code = `const Comp = () => <Card title={dynamicTitle} />`;
    const result = transformJSX(code, "test.tsx");
    expect(result.code).toContain('title={() => dynamicTitle}');
  });

  it("does not wrap onEvent props", () => {
    const code = `const Comp = () => <Card onClick={() => doSomething()} onHover={handleHover} />`;
    const result = transformJSX(code, "test.tsx");
    expect(result.code).toContain('onClick={() => doSomething()}');
    expect(result.code).toContain('onHover={handleHover}'); // Not wrapped!
  });

  it("auto-wraps native element attributes", () => {
    const code = `const Comp = () => <div class={dynamicClass} />`;
    const result = transformJSX(code, "test.tsx");
    expect(result.code).toContain('() => dynamicClass');
  });
});
