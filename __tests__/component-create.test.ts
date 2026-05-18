import { describe, it, expect } from "bun:test";
import { cc } from "../src/component/create.ts";

describe("cc", () => {
  it("returns a component function with _SinwanComponent marker", () => {
    const MyComp = cc<{ title: string }>(({ title }) => title);
    expect(MyComp._SinwanComponent).toBe(true);
  });

  it("sets _displayName from function name", () => {
    function MyComp(props: { title: string }) {
      return props.title;
    }
    const Wrapped = cc(MyComp);
    expect(Wrapped._displayName).toBe("MyComp");
  });

  it("falls back to AnonymousComponent for unnamed functions", () => {
    const comp = cc(() => "hello");
    expect(comp._displayName).toBe("AnonymousComponent");
  });

  it("returns the expected node when called", () => {
    const MyComp = cc<{ title: string }>(({ title }) => title);
    expect(MyComp({ title: "hello" })).toBe("hello");
  });

  it("can be used for page components", () => {
    const Home = cc<{ title: string }>(({ title }) => title);
    expect(Home({ title: "world" })).toBe("world");
  });

  it("can be used for layout components with children", () => {
    const Layout = cc<{ title: string }>(
      ({ title, children }) =>
        ({ tag: "div", props: { title }, children: [children] }) as any,
    );
    const result = Layout({ title: "hello", children: "world" as any });
    expect((result as any).tag).toBe("div");
    expect((result as any).props.title).toBe("hello");
  });
});
