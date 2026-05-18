import { describe, it, expect } from "bun:test";
import { transformJSX } from "../transform";

describe("transformJSX", () => {
  it("hoists a fully static element", () => {
    const code = `const Card = () => <div class="card"><p>Hello</p></div>;`;
    const result = transformJSX(code, "test.tsx");

    expect(result.code).toContain("const _$tmpl_0");
    expect(result.code).toContain(
      'html: "<div class=\\"card\\"><p>Hello</p></div>"',
    );
    expect(result.code).toContain("_$createTemplate(_$tmpl_0");
    expect(result.code).toContain('import { _$createTemplate } from "sinwan"');
  });

  it("handles dynamic children with comment markers", () => {
    const code = `const Card = ({ title }) => <div class="card"><h1>{title}</h1></div>;`;
    const result = transformJSX(code, "test.tsx");

    expect(result.code).toContain("<!--s:0-->");
    expect(result.code).toContain(
      'slots: [{\n    path: [0, 0],\n    type: "child"\n  }]',
    );
    expect(result.code).toContain("_$createTemplate(_$tmpl_0, [title])");
  });

  it("leaves component calls untouched", () => {
    const code = `const App = () => <Card title="hello" />;`;
    const result = transformJSX(code, "test.tsx");

    // Card is capitalized, so it should NOT be compiled as a template
    expect(result.code).not.toContain("_$createTemplate");
    expect(result.code).toContain("<Card");
  });

  it("preserves code with no JSX", () => {
    const code = `const x = 1 + 2;`;
    const result = transformJSX(code, "test.tsx");
    expect(result.code).toBe("const x = 1 + 2;");
  });

  it("skips hoisting for elements with spread attributes", () => {
    const code = `const Card = (props) => <div {...props}><p>Hello</p></div>;`;
    const result = transformJSX(code, "test.tsx");
    expect(result.code).not.toContain("_$createTemplate");
    expect(result.code).toContain("<div");
    expect(result.code).toContain("{...props}");
  });

  it("skips hoisting for elements with ref", () => {
    const code = `const Input = () => <input ref={(el) => el?.focus()} />;`;
    const result = transformJSX(code, "test.tsx");
    expect(result.code).not.toContain("_$createTemplate");
    expect(result.code).toContain("<input");
    expect(result.code).toContain("ref=");
  });

  it("ignores whitespace JSXText when computing child paths", () => {
    const code = `const Card = ({ title }) => (
      <div>
        <h1>{title}</h1>
      </div>
    );`;
    const result = transformJSX(code, "test.tsx");
    expect(result.code).toContain("<!--s:0-->");
    // h1 should be at index 0 (whitespace stripped), not index 1
    expect(result.code).toContain(
      'slots: [{\n    path: [0, 0],\n    type: "child"\n  }]',
    );
    expect(result.code).toContain("_$createTemplate(_$tmpl_0, [title])");
  });

  it("skips hoisting when a nested child is a component call", () => {
    const code = `const App = () => (
      <div>
        <Card title="hello" />
        <p>static</p>
      </div>
    );`;
    const result = transformJSX(code, "test.tsx");
    expect(result.code).not.toContain("_$createTemplate");
    expect(result.code).toContain("<div>");
    expect(result.code).toContain("<Card");
  });
});
