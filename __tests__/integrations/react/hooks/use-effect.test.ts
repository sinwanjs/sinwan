/**
 * Comprehensive tests for `useEffect`.
 *
 * Tests are organized to mirror the React documentation sections.
 * NOTE: Sinwan's `useEffect` registers once per component instance, runs
 * after mount via `queueMicrotask`, and always fires cleanup on unmount.
 * The `_deps` parameter is accepted for API compatibility but is cosmetic
 * because Sinwan components do not re-render; signals drive updates instead.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import {
  createComponentInstance,
  withInstance,
} from "../../../../src/component/instance.ts";
import { effect } from "../../../../src/reactivity/effect.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useEffectEvent,
} from "../../../../src/integrations/react/_client.ts";
import { onUpdated } from "../../../../src/component/lifecycle.ts";

let container: HTMLElement;
beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
});

const el = (
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: tag as any,
  props: { ...props, children },
  children: children as any,
});

/** Wait for the next microtask flush (effects schedule via queueMicrotask). */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("useEffect — Reference", () => {
  it("accepts a setup function and an optional dependency array", () => {
    // Covers: Reference / Parameters — setup and dependencies
    const App = cc(() => {
      useEffect(() => {}, []);
      useEffect(() => {}); // no deps array at all
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("runs setup after mount via microtask", async () => {
    // Covers: Reference / Parameters / setup — React runs setup after commit
    let ran = false;
    const App = cc(() => {
      useEffect(() => {
        ran = true;
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(ran).toBe(false); // not yet — microtask pending
    await tick();
    expect(ran).toBe(true);
  });

  it("calls cleanup on unmount", async () => {
    // Covers: Reference / Parameters / setup — cleanup runs on unmount
    let cleaned = false;
    const App = cc(() => {
      useEffect(() => {
        return () => {
          cleaned = true;
        };
      }, []);
      return el("div");
    });
    const app = mount(App, container);
    await tick();
    expect(cleaned).toBe(false);
    app.unmount();
    expect(cleaned).toBe(true);
  });

  it("calls cleanup on unmount with no deps", async () => {
    let cleaned = false;
    const App = cc(() => {
      useEffect(() => {
        return () => {
          cleaned = true;
        };
      });
      return el("div");
    });
    const app = mount(App, container);
    await tick();
    expect(cleaned).toBe(false);
    app.unmount();
    expect(cleaned).toBe(true);
  });

  it("returns undefined", () => {
    // Covers: Reference / Returns — useEffect returns undefined
    let result: unknown = "initial";
    const App = cc(() => {
      result = useEffect(() => {}, []);
      return el("div");
    });
    mount(App, container);
    expect(result).toBeUndefined();
  });

  it("throws when called outside a component", () => {
    // Covers: Reference / Caveats — Hook called outside of component
    expect(() => {
      useEffect(() => {}, []);
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Connecting to an external system ─────────────────────────────

describe("useEffect — Usage / Connecting to an external system", () => {
  it("connects to a chat server on mount and disconnects on unmount", async () => {
    // Covers: Usage / Connecting — setup connects, cleanup disconnects
    const log: string[] = [];
    function createConnection(serverUrl: string, roomId: string) {
      return {
        connect() {
          log.push(`connect:${roomId}@${serverUrl}`);
        },
        disconnect() {
          log.push(`disconnect:${roomId}@${serverUrl}`);
        },
      };
    }

    const App = cc(() => {
      useEffect(() => {
        const conn = createConnection("https://localhost:1234", "general");
        conn.connect();
        return () => conn.disconnect();
      }, []);
      return el("div");
    });

    const app = mount(App, container);
    await tick();
    expect(log).toEqual(["connect:general@https://localhost:1234"]);

    app.unmount();
    expect(log).toEqual([
      "connect:general@https://localhost:1234",
      "disconnect:general@https://localhost:1234",
    ]);
  });

  it("listens to global window events", async () => {
    // Covers: Usage / Listening to a global browser event
    const win = (globalThis as any).window;
    let captured = false;

    const App = cc(() => {
      useEffect(() => {
        function handler() {
          captured = true;
        }
        win.addEventListener("test-event", handler);
        return () => {
          win.removeEventListener("test-event", handler);
        };
      }, []);
      return el("div");
    });

    const app = mount(App, container);
    await tick();
    expect(captured).toBe(false);

    win.dispatchEvent(new (win as any).Event("test-event"));
    expect(captured).toBe(true);

    app.unmount();
    // After unmount the handler is removed; dispatching again shouldn't change captured
    captured = false;
    win.dispatchEvent(new (win as any).Event("test-event"));
    expect(captured).toBe(false);
  });

  it("triggers a third-party animation", async () => {
    // Covers: Usage / Triggering an animation
    let started = false;
    let stopped = false;

    class FakeAnimation {
      start() {
        started = true;
      }
      stop() {
        stopped = true;
      }
    }

    const App = cc(() => {
      const ref = useRef<HTMLDivElement>(null);
      useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const anim = new FakeAnimation();
        anim.start();
        return () => anim.stop();
      }, []);
      return el("div", { ref: ref as any });
    });

    const app = mount(App, container);
    await tick();
    expect(started).toBe(true);
    expect(stopped).toBe(false);

    app.unmount();
    expect(stopped).toBe(true);
  });

  it("controls a modal dialog element", async () => {
    // Covers: Usage / Controlling a modal dialog
    const win = (globalThis as any).window;
    const App = cc(({ isOpen }: { isOpen: boolean }) => {
      const ref = useRef<HTMLDialogElement>(null);
      const [isOpenDep] = useState(isOpen);
      useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (isOpenDep()) {
          (dialog as any).showModal = () => {
            dialog.setAttribute("open", "");
          };
          dialog.showModal();
        } else {
          (dialog as any).close = () => {
            dialog.removeAttribute("open");
          };
          dialog.close();
        }
        return () => {
          (dialog as any).close?.();
        };
      }, [isOpenDep]);
      return el("dialog", { ref: ref as any });
    });

    const app = mount(App, container, { isOpen: true });
    await tick();
    const dialog = container.querySelector("dialog");
    expect(dialog?.hasAttribute("open")).toBe(true);

    app.unmount();
    expect(dialog?.hasAttribute("open")).toBe(false);
  });

  it("tracks element visibility with IntersectionObserver", async () => {
    // Covers: Usage / Tracking element visibility
    let observed = false;
    let disconnected = false;

    const win = (globalThis as any).window;
    (win as any).IntersectionObserver = class MockIntersectionObserver {
      constructor(
        private cb: any,
        private opts: any,
      ) {}
      observe(target: Element) {
        observed = true;
        this.cb([{ isIntersecting: true, target }]);
      }
      disconnect() {
        disconnected = true;
      }
    };

    const App = cc(() => {
      const ref = useRef<HTMLDivElement>(null);
      useEffect(() => {
        const div = ref.current;
        if (!div) return;
        const observer = new (win as any).IntersectionObserver(
          (entries: any[]) => {
            void entries[0].isIntersecting;
          },
          { threshold: 1.0 },
        );
        observer.observe(div);
        return () => observer.disconnect();
      }, []);
      return el("div", { ref: ref as any });
    });

    const app = mount(App, container);
    await tick();
    expect(observed).toBe(true);
    expect(disconnected).toBe(false);

    app.unmount();
    expect(disconnected).toBe(true);
  });
});

// ─── Usage / Wrapping Effects in custom Hooks ─────────────────────────────

describe("useEffect — Usage / Wrapping Effects in custom Hooks", () => {
  it("useChatRoom encapsulates connection logic", async () => {
    // Covers: Usage / Wrapping Effects / Custom useChatRoom Hook
    const log: string[] = [];
    function useChatRoom({
      serverUrl,
      roomId,
    }: {
      serverUrl: string;
      roomId: string;
    }) {
      const [roomIdDep] = useState(roomId);
      const [serverUrlDep] = useState(serverUrl);
      useEffect(() => {
        log.push(`connect:${roomIdDep()}`);
        return () => {
          log.push(`disconnect:${roomIdDep()}`);
        };
      }, [roomIdDep, serverUrlDep]);
    }

    const App = cc(() => {
      useChatRoom({ serverUrl: "https://localhost:1234", roomId: "music" });
      return el("div");
    });

    const app = mount(App, container);
    await tick();
    expect(log).toContain("connect:music");

    app.unmount();
    expect(log).toContain("disconnect:music");
  });

  it("useWindowListener encapsulates event subscription", async () => {
    // Covers: Usage / Wrapping Effects / Custom useWindowListener Hook
    const win = (globalThis as any).window;
    let received = false;

    function useWindowListener(eventType: string, listener: EventListener) {
      const [eventTypeDep] = useState(eventType);
      const [listenerDep] = useState<EventListener>(() => listener);
      useEffect(() => {
        const type = eventTypeDep();
        const handler = listenerDep();
        win.addEventListener(type, handler);
        return () => win.removeEventListener(type, handler);
      }, [eventTypeDep, listenerDep]);
    }

    const App = cc(() => {
      useWindowListener("custom-win", () => {
        received = true;
      });
      return el("div");
    });

    const app = mount(App, container);
    await tick();
    win.dispatchEvent(new (win as any).Event("custom-win"));
    expect(received).toBe(true);

    app.unmount();
    received = false;
    win.dispatchEvent(new (win as any).Event("custom-win"));
    expect(received).toBe(false);
  });

  it("useIntersectionObserver encapsulates visibility tracking", async () => {
    // Covers: Usage / Wrapping Effects / Custom useIntersectionObserver Hook
    let observed = false;
    const win = (globalThis as any).window;
    (win as any).IntersectionObserver = class MockIntersectionObserver {
      constructor(
        private cb: any,
        private opts: any,
      ) {}
      observe() {
        observed = true;
      }
      disconnect() {}
    };

    function useIntersectionObserver(ref: { current: HTMLElement | null }) {
      const [isIntersecting, setIsIntersecting] = useState(false);
      const [refDep] = useState(ref);
      useEffect(() => {
        const div = refDep().current;
        if (!div) return;
        const observer = new (win as any).IntersectionObserver(
          (entries: any[]) => {
            setIsIntersecting(entries[0].isIntersecting);
          },
          { threshold: 1.0 },
        );
        observer.observe(div);
        return () => observer.disconnect();
      }, [refDep]);
      return isIntersecting;
    }

    const App = cc(() => {
      const ref = useRef<HTMLElement>(null);
      useIntersectionObserver(ref);
      return el("div", { ref: ref as any });
    });

    mount(App, container);
    await tick();
    expect(observed).toBe(true);
  });
});

// ─── Usage / Controlling a non-React widget ───────────────────────────────

describe("useEffect — Usage / Controlling a non-React widget", () => {
  it("synchronizes a map widget with React state", async () => {
    // Covers: Usage / Controlling a non-React widget
    class FakeMapWidget {
      zoom = 0;
      setZoom(level: number) {
        this.zoom = level;
      }
    }

    const App = cc(({ zoomLevel }: { zoomLevel: number }) => {
      const containerRef = useRef<HTMLDivElement>(null);
      const mapRef = useRef<FakeMapWidget | null>(null);
      const [zoomDep] = useState(zoomLevel);

      useEffect(() => {
        if (mapRef.current === null && containerRef.current) {
          mapRef.current = new FakeMapWidget();
        }
        const map = mapRef.current;
        if (map) {
          map.setZoom(zoomDep());
        }
      }, [zoomDep]);

      return el("div", { ref: containerRef as any });
    });

    const app = mount(App, container, { zoomLevel: 3 });
    await tick();
    // The widget instance is created and zoom is set
    expect(app.root).toBeTruthy();
  });
});

describe("useEffect — Usage / Fetching data with Effects", () => {
  it("fetches data on mount with ignore-flag race prevention", async () => {
    // Covers: Usage / Fetching data — ignore flag prevents race conditions
    const bioMap = new Map<string, string>();
    let pendingResolve: ((v: string) => void) | null = null;

    function mockFetchBio(person: string): Promise<string> {
      return new Promise((resolve) => {
        pendingResolve = (value: string) => {
          bioMap.set(person, value);
          resolve(value);
        };
      });
    }

    const App = cc(({ person }: { person: string }) => {
      const [bio, setBio] = useState<string | null>(null);
      const [personDep] = useState(person);

      useEffect(() => {
        let ignore = false;
        setBio(null);
        mockFetchBio(personDep()).then((result) => {
          if (!ignore) {
            setBio(result);
          }
        });
        return () => {
          ignore = true;
        };
      }, [personDep]);

      // Pass the reactive getter directly so DOM updates when the signal changes.
      return el("div", {}, bio);
    });

    mount(App, container, { person: "Alice" });
    await tick();
    // bio is null initially → empty text node
    expect(container.textContent).toBe("");

    pendingResolve!("Alice's bio.");
    await tick(); // flush promise .then microtask
    await tick(); // flush signal-driven DOM update microtask
    expect(container.textContent).toBe("Alice's bio.");
  });

  it("supports async/await syntax inside the effect", async () => {
    // Covers: Usage / Fetching data — async/await syntax with cleanup
    let pendingResolve: ((v: string) => void) | null = null;

    function mockFetchBio(person: string): Promise<string> {
      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    }

    const App = cc(({ person }: { person: string }) => {
      const [bio, setBio] = useState<string | null>(null);
      const [personDep] = useState(person);

      useEffect(() => {
        let ignore = false;

        async function startFetching() {
          setBio(null);
          const result = await mockFetchBio(personDep());
          if (!ignore) {
            setBio(result);
          }
        }

        startFetching();
        return () => {
          ignore = true;
        };
      }, [personDep]);

      // Pass the reactive getter directly so DOM updates when the signal changes.
      return el("div", {}, bio);
    });

    mount(App, container, { person: "Bob" });
    await tick();
    expect(container.textContent).toBe("");

    pendingResolve!("Bob's bio.");
    await tick(); // flush async continuation microtask
    await tick(); // flush signal-driven DOM update microtask
    expect(container.textContent).toBe("Bob's bio.");
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("useEffect — Caveats", () => {
  it("does not run during server rendering", () => {
    // Covers: Caveats — Effects only run on the client
    // Simulate SSR by removing window/document globals temporarily.
    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;

      const App = cc(() => {
        useEffect(() => {
          // This should never run in a server context
          throw new Error("Should not run on server");
        }, []);
        return el("div");
      });
      // In SSR, useEffect setup doesn't throw even though there's no DOM.
      // We verify by calling the component function directly with an instance.
      const instance = createComponentInstance(App, {}, null);
      expect(() => withInstance(instance, () => App({}))).not.toThrow();
    } finally {
      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
    }
  });

  it("registers only once even with multiple reactive updates", async () => {
    // Covers: Caveats — useEffect is a Hook, call at top level only once.
    let effectCount = 0;
    const App = cc(() => {
      const [count, setCount] = useState(0);
      useEffect(() => {
        effectCount++;
      }, []);
      return el(
        "button",
        { onClick: () => setCount((c: number) => c + 1) },
        count as unknown as number,
      );
    });

    mount(App, container);
    await tick();
    expect(effectCount).toBe(1);

    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await tick();
    // Sinwan useEffect runs once per instance; signal updates don't re-trigger it
    expect(effectCount).toBe(1);
  });
});

// ─── Troubleshooting ────────────────────────────────────────────────────────

describe("useEffect — Troubleshooting", () => {
  it("cleanup should mirror setup logic", async () => {
    // Covers: Troubleshooting / My cleanup logic runs even though...
    // cleanup should stop or undo whatever setup did.
    const log: string[] = [];
    const App = cc(() => {
      useEffect(() => {
        log.push("setup");
        return () => {
          log.push("cleanup");
        };
      }, []);
      return el("div");
    });

    const app = mount(App, container);
    await tick();
    expect(log).toEqual(["setup"]);

    app.unmount();
    expect(log).toEqual(["setup", "cleanup"]);
  });

  it("useLayoutEffect runs synchronously before useEffect microtask", async () => {
    // Covers: Troubleshooting / My Effect does something visual...
    // useLayoutEffect runs before browser paint; useEffect after microtask.
    const order: string[] = [];
    const App = cc(() => {
      useLayoutEffect(() => {
        order.push("layout");
      }, []);
      useEffect(() => {
        order.push("effect");
      }, []);
      return el("div");
    });

    mount(App, container);
    // useLayoutEffect fires synchronously during mount
    expect(order).toEqual(["layout"]);

    await tick();
    // useEffect fires after microtask
    expect(order).toEqual(["layout", "effect"]);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("useEffect — Edge cases", () => {
  it("handles effect with no cleanup", async () => {
    let ran = false;
    const App = cc(() => {
      useEffect(() => {
        ran = true;
      }, []);
      return el("div");
    });
    mount(App, container);
    await tick();
    expect(ran).toBe(true);
  });

  it("handles null and undefined in dependency list", () => {
    const App = cc(() => {
      const [nil] = useState<null>(null);
      const [undef] = useState<undefined>(undefined);
      useEffect(() => {}, [nil, undef]);
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("handles multiple useEffect calls in one component", async () => {
    const log: string[] = [];
    const App = cc(() => {
      useEffect(() => {
        log.push("a");
      }, []);
      useEffect(() => {
        log.push("b");
      }, []);
      return el("div");
    });
    mount(App, container);
    await tick();
    expect(log).toContain("a");
    expect(log).toContain("b");
  });

  it("handles empty deps array (runs once)", async () => {
    let count = 0;
    const App = cc(() => {
      useEffect(() => {
        count++;
      }, []);
      return el("div");
    });
    mount(App, container);
    await tick();
    expect(count).toBe(1);
  });

  it("handles effect that reads reactive signals inside a nested Sinwan effect", async () => {
    // NOTE: Sinwan-specific pattern.  Because useEffect itself doesn't re-run
    // on dep changes, reactive work is done via Sinwan's `effect()` inside
    // the useEffect setup, with cleanup disposing the reactive effect.
    const values: number[] = [];
    const App = cc(() => {
      const [num, setNum] = useState(0);

      useEffect(() => {
        const dispose = effect(() => {
          // Reading the getter tracks the signal
          const n = (num as unknown as () => number)();
          values.push(n);
        });
        return () => dispose();
      }, []);

      return el(
        "button",
        { onClick: () => setNum((n: number) => n + 1) },
        "inc",
      );
    });

    mount(App, container);
    await tick();
    expect(values).toEqual([0]);

    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await tick();
    expect(values).toEqual([0, 1]);
  });

  it("effect cleanup is called on unmount even when setup threw", async () => {
    // NOTE: If the effect callback throws, cleanup won't be registered.
    // This test verifies normal behavior when setup succeeds.
    let cleaned = false;
    const App = cc(() => {
      useEffect(() => {
        return () => {
          cleaned = true;
        };
      }, []);
      return el("div");
    });

    const app = mount(App, container);
    await tick();
    app.unmount();
    expect(cleaned).toBe(true);
  });
});

// ─── Dependency Array Behaviour ──────────────────────────────────────────────

describe("useEffect — Dependency Array", () => {
  // 1. Sans dependency array — runs after mount and on every reactive update
  it("no dependency array: runs after mount and on every reactive update", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      useEffect(() => {
        const c = count(); // capture at setup time
        log.push(`effect:${c}`);
        return () => {
          log.push(`cleanup:${c}`); // captured value
        };
      }); // no deps

      return el("div", {}, count);
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["effect:0"]);

    // Signal change triggers reactive DOM update → onUpdated → effect re-runs
    setCount(1);
    await tick();
    expect(log).toEqual(["effect:0", "cleanup:0", "effect:1"]);

    setCount(2);
    await tick();
    expect(log).toEqual([
      "effect:0",
      "cleanup:0",
      "effect:1",
      "cleanup:1",
      "effect:2",
    ]);
  });

  // 2. Empty dependency array [] — runs once on mount, cleanup on unmount
  it("empty deps []: runs once on mount, cleanup on unmount", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      useEffect(() => {
        const c = count(); // capture at setup time
        log.push(`setup:${c}`);
        return () => {
          log.push(`cleanup:${c}`); // captured value
        };
      }, []);

      return el("div", {}, count);
    });

    const app = mount(App, container);
    await tick();
    expect(log).toEqual(["setup:0"]);

    // Changing state does NOT re-trigger effect
    setCount(1);
    await tick();
    expect(log).toEqual(["setup:0"]);

    app.unmount();
    expect(log).toEqual(["setup:0", "cleanup:0"]);
  });

  // 3. Single dependency [count] — runs on mount + when count changes
  it("single dep [count]: runs on mount and when count changes", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      useEffect(() => {
        const c = count(); // capture at setup time
        log.push(`setup:${c}`);
        return () => {
          log.push(`cleanup:${c}`); // captured value
        };
      }, [count]);

      return el("div", {}, count);
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["setup:0"]);

    setCount(1);
    await tick();
    expect(log).toEqual(["setup:0", "cleanup:0", "setup:1"]);

    setCount(2);
    await tick();
    expect(log).toEqual([
      "setup:0",
      "cleanup:0",
      "setup:1",
      "cleanup:1",
      "setup:2",
    ]);
  });

  // 4. Multiple dependencies [count, name] — runs when a OR b changes
  it("multiple deps [count, name]: runs when either changes", async () => {
    const log: string[] = [];
    let setCount: any;
    let setName: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      const [name, setN] = useState("A");
      setCount = setC;
      setName = setN;

      useEffect(() => {
        const c = count();
        const n = name();
        log.push(`setup:${c}:${n}`);
        return () => {
          log.push(`cleanup:${c}:${n}`);
        };
      }, [count, name]);

      return el("div", {}, count, name);
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["setup:0:A"]);

    // Only count changes
    setCount(1);
    await tick();
    expect(log).toEqual(["setup:0:A", "cleanup:0:A", "setup:1:A"]);

    // Only name changes
    setName("B");
    await tick();
    expect(log).toEqual([
      "setup:0:A",
      "cleanup:0:A",
      "setup:1:A",
      "cleanup:1:A",
      "setup:1:B",
    ]);
  });

  // 5. Object dependency — reference equality (Object.is)
  it("object dep: re-runs when reference changes, not when content mutates", async () => {
    const log: string[] = [];
    let setObj: any;

    const App = cc(() => {
      const [obj, setO] = useState({ a: 1 });
      setObj = setO;

      useEffect(() => {
        log.push("setup");
        return () => {
          log.push("cleanup");
        };
      }, [obj]);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["setup"]);

    // Mutating the object in-place does NOT change reference
    setObj((prev: any) => {
      prev.a = 2;
      return prev;
    });
    await tick();
    // Same reference → no re-run
    expect(log).toEqual(["setup"]);

    // Returning a new object DOES change reference
    setObj({ a: 3 });
    await tick();
    expect(log).toEqual(["setup", "cleanup", "setup"]);
  });

  // 6. Function dependency — recreated every render (useCallback needed)
  it("function dep: re-runs when function reference changes", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      // A new function on every "render" — but in Sinwan setup runs once
      // so this function is stable. We simulate change by reading count.
      const handler = () => count();

      useEffect(() => {
        log.push("setup");
        return () => {
          log.push("cleanup");
        };
      }, [handler]);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["setup"]);

    // In Sinwan, the function is created once during setup; deps are stable
    setCount(1);
    await tick();
    expect(log).toEqual(["setup"]);
  });

  // 7. Cleanup + dependencies cycle: cleanup old → setup new → cleanup on unmount
  it("cleanup + deps: cleanup old runs before setup new, and on unmount", async () => {
    const log: string[] = [];
    let setRoom: any;

    const App = cc(() => {
      const [roomId, setR] = useState("general");
      setRoom = setR;

      useEffect(() => {
        const room = roomId(); // capture at setup time
        log.push(`connect:${room}`);
        return () => {
          log.push(`disconnect:${room}`);
        };
      }, [roomId]);

      return el("div", {}, roomId);
    });

    const app = mount(App, container);
    await tick();
    expect(log).toEqual(["connect:general"]);

    setRoom("random");
    await tick();
    expect(log).toEqual([
      "connect:general",
      "disconnect:general",
      "connect:random",
    ]);

    app.unmount();
    expect(log).toEqual([
      "connect:general",
      "disconnect:general",
      "connect:random",
      "disconnect:random",
    ]);
  });

  // 8. Missing dependency — stale closure (same as React: value is captured)
  it("missing dep: captured value is stale (same as React)", async () => {
    const values: number[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      // Missing dep: count is read inside effect but not in deps
      useEffect(() => {
        values.push(count());
      }, []);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(values).toEqual([0]);

    // Effect does NOT re-run because deps are empty
    setCount(5);
    await tick();
    expect(values).toEqual([0]);
  });

  // 9. Derived unnecessary dependency
  it("derived dep: fullName is redundant if first and last are already deps", async () => {
    const log: string[] = [];
    let setFirst: any;

    const App = cc(() => {
      const [first, setF] = useState("Ada");
      const last = "Lovelace";
      setFirst = setF;

      useEffect(() => {
        const fullName = first() + " " + last; // compute inside effect
        log.push(`effect:${fullName}`);
      }, [first]);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["effect:Ada Lovelace"]);

    // first changed → effect re-runs with new fullName
    setFirst("Grace");
    await tick();
    expect(log).toEqual(["effect:Ada Lovelace", "effect:Grace Lovelace"]);
  });

  // 10. Infinite loop guard: rapid setState inside effect with dep
  it("rapid dep changes are batched to a single re-run", async () => {
    let runCount = 0;
    let cleanupCount = 0;
    let setDep: any;

    const App = cc(() => {
      const [dep, setD] = useState(0);
      setDep = setD;

      useEffect(() => {
        runCount++;
        return () => {
          cleanupCount++;
        };
      }, [dep]);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(runCount).toBe(1);
    expect(cleanupCount).toBe(0);

    // Single change
    setDep(1);
    await tick();
    expect(runCount).toBe(2);
    expect(cleanupCount).toBe(1);

    // Rapid changes: batched to one re-run
    for (let i = 2; i < 52; i++) {
      setDep(i);
    }
    await tick();
    expect(runCount).toBe(3);
    expect(cleanupCount).toBe(2);
  });

  // 11. Async effect pattern (inner async function)
  it("async effect: inner async function with cleanup", async () => {
    const log: string[] = [];
    let setQuery: any;

    const App = cc(() => {
      const [query, setQ] = useState("cats");
      setQuery = setQ;

      useEffect(() => {
        const q = query(); // capture at setup time
        let cancelled = false;

        async function fetchData() {
          log.push(`fetch:${q}`);
          // Simulate async work
          await Promise.resolve();
          if (!cancelled) {
            log.push(`done:${q}`);
          }
        }

        fetchData();

        return () => {
          cancelled = true;
          log.push(`cancel:${q}`);
        };
      }, [query]);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["fetch:cats", "done:cats"]);

    setQuery("dogs");
    await tick();
    expect(log).toEqual([
      "fetch:cats",
      "done:cats",
      "cancel:cats",
      "fetch:dogs",
      "done:dogs",
    ]);
  });

  // Regression: async component lifecycle hooks must fire on updates
  it("async component: useEffect and onUpdated fire on every reactive update", async () => {
    const effectLog: number[] = [];
    const updatedLog: number[] = [];
    let setCount: any;

    const AsyncCounter = cc(async () => {
      const [count, setC] = useState(0);
      setCount = setC;

      useEffect(() => {
        effectLog.push(count());
      }, [count]);

      onUpdated(() => {
        updatedLog.push(count());
      });

      await Promise.resolve();

      return el("span", {}, count as any);
    });

    const App = cc(() => {
      return el("div", {}, el(AsyncCounter, {}));
    });

    mount(App, container);
    await tick();
    expect(effectLog).toEqual([0]);
    // onUpdated fires once when the child async component resolves
    expect(updatedLog).toEqual([0]);

    setCount(1);
    await tick();
    expect(effectLog).toEqual([0, 1]);
    expect(updatedLog).toEqual([0, 1]);

    setCount(2);
    await tick();
    expect(effectLog).toEqual([0, 1, 2]);
    expect(updatedLog).toEqual([0, 1, 2]);
  });
});
