import { describe, expect, it } from "bun:test";
import { scanFile, mergeResults } from "../detector";

describe("scanFile", () => {
  it("detects named imports from sinwan", () => {
    const code = `import { Show, For, signal } from "sinwan";
export function App() {
  return <Show when={true}><p>hello</p></Show>;
}`;
    const result = scanFile(code, "/test/App.tsx");

    expect(result.usedIdentifiers.has("Show")).toBe(true);
    expect(result.usedIdentifiers.has("For")).toBe(true);
    expect(result.usedIdentifiers.has("signal")).toBe(true);
    expect(result.jsxTags.has("Show")).toBe(true);
  });

  it("detects namespace imports", () => {
    const code = `import * as sw from "sinwan";
export function App() {
  const [count] = sw.signal(0);
  return <sw.Show when={count() > 0}>{count()}</sw.Show>;
}`;
    const result = scanFile(code, "/test/App.tsx");

    expect(result.usedIdentifiers.has("Show")).toBe(true);
    expect(result.usedIdentifiers.has("signal")).toBe(true);
  });

  it("detects aliased imports", () => {
    const code = `import { Show as S, For as F } from "sinwan";
export function App() {
  return (
    <S when={true}><p>hi</p></S>
    <F each={[]}><p>item</p></F>
  );
}`;
    const result = scanFile(code, "/test/App.tsx");

    expect(result.usedIdentifiers.has("Show")).toBe(true);
    expect(result.usedIdentifiers.has("For")).toBe(true);
  });

  it("ignores non-sinwan imports", () => {
    const code = `import { useState } from "react";
import { Show } from "sinwan";
export function App() {
  const [s, setS] = useState(0);
  return <Show when={s > 0}><p>hi</p></Show>;
}`;
    const result = scanFile(code, "/test/App.tsx");

    expect(result.usedIdentifiers.has("Show")).toBe(true);
    expect(result.usedIdentifiers.has("useState")).toBe(false);
  });

  it("detects function calls", () => {
    const code = `import { signal, effect, mount } from "sinwan";
const [count, setCount] = signal(0);
effect(() => console.log(count()));
mount(App, document.getElementById("app")!);
`;
    const result = scanFile(code, "/test/main.ts");

    expect(result.functionCalls.has("signal")).toBe(true);
    expect(result.functionCalls.has("effect")).toBe(true);
    expect(result.functionCalls.has("mount")).toBe(true);
  });
});

describe("mergeResults", () => {
  it("merges multiple file results", () => {
    const r1 = scanFile(
      `import { Show } from "sinwan";\n<Show when={true} />`,
      "/a.tsx"
    );
    const r2 = scanFile(
      `import { For } from "sinwan";\n<For each={[]} />`,
      "/b.tsx"
    );
    const merged = mergeResults([r1, r2]);

    expect(merged.allUsedIdentifiers.has("Show")).toBe(true);
    expect(merged.allUsedIdentifiers.has("For")).toBe(true);
    expect(merged.allJsxTags.has("Show")).toBe(true);
    expect(merged.allJsxTags.has("For")).toBe(true);
  });
});
