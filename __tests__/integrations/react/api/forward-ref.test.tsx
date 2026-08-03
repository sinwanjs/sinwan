import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import {
  forwardRef,
  useRef,
  createRoot,
  useImperativeHandle,
  renderToString,
} from "../../../../src/react/index.ts";
import { REACT_FORWARD_REF_TYPE } from "../../../../src/react/_internal/symbols.ts";
import type { Ref } from "../../../../src/react/_types/core.ts";

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
});

describe("forwardRef — Reference", () => {
  it("returns a ForwardRefExoticComponent with $$typeof set", () => {
    const Comp = forwardRef<HTMLDivElement, { label: string }>((props, ref) => (
      <div ref={ref as Ref<HTMLDivElement>}>{props.label}</div>
    ));
    expect((Comp as any).$$typeof).toBe(REACT_FORWARD_REF_TYPE);
  });

  it("exposes the original render function on .render", () => {
    const render = (props: { label: string }, ref: Ref<HTMLDivElement>) => (
      <div ref={ref}>{props.label}</div>
    );
    const Comp = forwardRef<HTMLDivElement, { label: string }>(render);
    expect((Comp as any).render).toBe(render);
  });

  it("sets displayName from the render function's name", () => {
    function MyInput(props: { label: string }, ref: Ref<HTMLInputElement>) {
      return (
        <input ref={ref as Ref<HTMLInputElement>} placeholder={props.label} />
      );
    }
    const Comp = forwardRef<HTMLInputElement, { label: string }>(MyInput);
    expect((Comp as any).displayName).toBe("MyInput");
  });

  it("falls back to 'ForwardRef' when render is anonymous", () => {
    const Comp = forwardRef<unknown, { x: number }>((_props, _ref) => null);
    expect((Comp as any).displayName).toBe("ForwardRef");
  });

  it("sets displayName from render.displayName if present", () => {
    const render = (_props: {}, _ref: Ref<unknown>) => null;
    (render as any).displayName = "CustomName";
    const Comp = forwardRef<unknown, {}>(render);
    expect((Comp as any).displayName).toBe("CustomName");
  });
});

describe("forwardRef — Usage / ref forwarding", () => {
  it("forwards a ref object to the underlying DOM element", () => {
    const Input = forwardRef<HTMLInputElement, { label: string }>(
      (props, ref) => (
        <input ref={ref as Ref<HTMLInputElement>} placeholder={props.label} />
      ),
    );

    const container = document.createElement("div");
    const App = () => {
      const inputRef = useRef<HTMLInputElement>(null);
      return <Input ref={inputRef} label="Name" />;
    };

    createRoot(container).render(<App />);

    const input = container.getElementsByTagName("input")[0];
    expect(input?.tagName).toBe("INPUT");
    expect(input?.getAttribute("placeholder")).toBe("Name");
  });

  it("forwards a callback ref to the underlying DOM element", () => {
    const Div = forwardRef<HTMLDivElement, { text: string }>((props, ref) => (
      <div ref={ref as Ref<HTMLDivElement>}>{props.text}</div>
    ));

    const container = document.createElement("div");
    let capturedEl: HTMLDivElement | null = null;
    const App = () => (
      <Div
        ref={(el: HTMLDivElement | null) => {
          capturedEl = el;
        }}
        text="hello"
      />
    );

    createRoot(container).render(<App />);

    expect((capturedEl as any)?.tagName).toBe("DIV");
    expect((capturedEl as any)?.textContent).toBe("hello");
  });

  it("passes props through to the render function", () => {
    const Button = forwardRef<
      HTMLButtonElement,
      { label: string; disabled: boolean }
    >((props, ref) => (
      <button ref={ref as Ref<HTMLButtonElement>} disabled={props.disabled}>
        {props.label}
      </button>
    ));

    const container = document.createElement("div");
    const App = () => {
      const ref = useRef<HTMLButtonElement>(null);
      return <Button ref={ref} label="Click" disabled={true} />;
    };

    createRoot(container).render(<App />);

    const btn = container.getElementsByTagName("button")[0];
    expect(btn?.tagName).toBe("BUTTON");
    expect(btn?.textContent).toBe("Click");
    expect((btn as any)?.disabled).toBe(true);
  });

  it("works without a ref (ref is null)", () => {
    const Span = forwardRef<HTMLSpanElement, { text: string }>(
      (props, _ref) => <span>{props.text}</span>,
    );

    const container = document.createElement("div");
    createRoot(container).render(<Span text="no ref" />);

    expect(container.getElementsByTagName("span")[0]?.textContent).toBe(
      "no ref",
    );
  });

  it("renders correctly when ref is undefined", () => {
    const Div = forwardRef<HTMLDivElement, { value: number }>((props, _ref) => (
      <div>{props.value}</div>
    ));

    const container = document.createElement("div");
    createRoot(container).render(<Div value={42} />);

    expect(container.getElementsByTagName("div")[0]?.textContent).toBe("42");
  });
});

describe("forwardRef — Usage with useImperativeHandle", () => {
  it("exposes an imperative handle via forwardRef + useImperativeHandle", () => {
    interface InputAPI {
      focus(): void;
      getValue(): string;
    }

    const FancyInput = forwardRef<InputAPI, { initial: string }>(
      (props, ref) => {
        const innerRef = useRef<HTMLInputElement>(null);
        useImperativeHandle(
          ref,
          () => ({
            focus: () => innerRef.current?.focus(),
            getValue: () => innerRef.current?.value ?? props.initial,
          }),
          [],
        );
        return <input ref={innerRef} defaultValue={props.initial} />;
      },
    );

    const container = document.createElement("div");
    let api: InputAPI | null = null;
    const App = () => {
      const apiRef = useRef<InputAPI>(null);
      // Read after mount via onMounted-like pattern: assign in a ref callback
      return (
        <FancyInput
          ref={(handle: InputAPI | null) => {
            api = handle;
          }}
          initial="hello"
        />
      );
    };

    createRoot(container).render(<App />);

    // After mount, the imperative handle should be assigned
    expect(api).not.toBeNull();
    expect(typeof (api as any)?.focus).toBe("function");
    expect(typeof (api as any)?.getValue).toBe("function");
  });
});

describe("forwardRef — Edge cases", () => {
  it("handles children prop correctly", () => {
    const Wrapper = forwardRef<HTMLDivElement, { children?: unknown }>(
      (props, ref) => (
        <div ref={ref as Ref<HTMLDivElement>}>{props.children as any}</div>
      ),
    );

    const container = document.createElement("div");
    const App = () => {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <Wrapper ref={ref}>
          <span>child</span>
        </Wrapper>
      );
    };

    createRoot(container).render(<App />);

    expect(container.getElementsByTagName("span")[0]?.textContent).toBe(
      "child",
    );
  });

  it("does not pass ref as a prop to the render function", () => {
    let receivedProps: Record<string, unknown> = {};

    const Comp = forwardRef<HTMLDivElement, { label: string }>(
      (props, _ref) => {
        receivedProps = props;
        return <div>{props.label}</div>;
      },
    );

    const container = document.createElement("div");
    const App = () => {
      const ref = useRef<HTMLDivElement>(null);
      return <Comp ref={ref} label="test" />;
    };

    createRoot(container).render(<App />);

    expect(receivedProps).not.toHaveProperty("ref");
    expect(receivedProps.label).toBe("test");
  });

  it("can be nested inside another forwardRef", () => {
    const Inner = forwardRef<HTMLSpanElement, { text: string }>(
      (props, ref) => (
        <span ref={ref as Ref<HTMLSpanElement>}>{props.text}</span>
      ),
    );

    const Outer = forwardRef<HTMLSpanElement, { text: string }>(
      (props, ref) => <Inner ref={ref} text={props.text} />,
    );

    const container = document.createElement("div");
    const App = () => {
      const ref = useRef<HTMLSpanElement>(null);
      return <Outer ref={ref} text="nested" />;
    };

    createRoot(container).render(<App />);

    expect(container.getElementsByTagName("span")[0]?.textContent).toBe(
      "nested",
    );
  });
});

describe("forwardRef — SSR safety", () => {
  it("renders without errors on the server (no DOM access)", async () => {
    const Comp = forwardRef<HTMLDivElement, { label: string }>(
      (props, _ref) => <div>{props.label}</div>,
    );

    const html = await renderToString(<Comp label="server" />);
    expect(html).toContain("server");
  });
});
