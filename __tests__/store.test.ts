/**
 * SinwanJS Store — Comprehensive Unit Tests
 *
 * Covers: createMutable, createStore, modifyMutable, produce, reconcile, unwrap.
 * Reactive integration verified via Sinwan effect() + nextTick().
 */

import { describe, it, expect } from "bun:test";
import { effect } from "../src/reactivity/effect.ts";
import { nextTick } from "../src/reactivity/scheduler.ts";
import {
  createMutable,
  createStore,
  modifyMutable,
  produce,
  reconcile,
  unwrap,
} from "../src/store/index.ts";

// ─── createMutable ─────────────────────────────────────────

describe("createMutable", () => {
  it("creates a mutable store proxy", () => {
    const state = createMutable({ count: 0 });
    expect(state.count).toBe(0);
  });

  it("tracks property reads reactively", async () => {
    const state = createMutable({ value: "a" });
    const log: string[] = [];

    effect(() => {
      log.push(state.value);
    });

    expect(log).toEqual(["a"]);

    state.value = "b";
    await nextTick();
    expect(log).toEqual(["a", "b"]);
  });

  it("tracks nested property reads", async () => {
    const state = createMutable({ user: { name: "John" } });
    const log: string[] = [];

    effect(() => {
      log.push(state.user.name);
    });

    expect(log).toEqual(["John"]);

    state.user.name = "Jane";
    await nextTick();
    expect(log).toEqual(["John", "Jane"]);
  });

  it("does not re-run effect when unrelated property changes", async () => {
    const state = createMutable({ a: 1, b: 2 });
    const log: number[] = [];

    effect(() => {
      log.push(state.a);
    });

    log.length = 0;
    state.b = 20;
    await nextTick();
    expect(log).toEqual([]);

    state.a = 10;
    await nextTick();
    expect(log).toEqual([10]);
  });

  it("supports array push with batching", async () => {
    const state = createMutable({ list: [1, 2] });
    const log: number[][] = [];

    effect(() => {
      log.push([...state.list]);
    });

    expect(log).toEqual([[1, 2]]);

    state.list.push(3);
    await nextTick();
    expect(log).toEqual([
      [1, 2],
      [1, 2, 3],
    ]);
  });

  it("supports array pop", async () => {
    const state = createMutable({ list: [1, 2, 3] });
    const log: number[][] = [];

    effect(() => {
      log.push([...state.list]);
    });

    state.list.pop();
    await nextTick();
    expect(state.list).toEqual([1, 2]);
    expect(log).toEqual([
      [1, 2, 3],
      [1, 2],
    ]);
  });

  it("supports array shift", async () => {
    const state = createMutable({ list: [1, 2, 3] });
    state.list.shift();
    expect(state.list).toEqual([2, 3]);
  });

  it("supports array unshift", async () => {
    const state = createMutable({ list: [2, 3] });
    state.list.unshift(1);
    expect(state.list).toEqual([1, 2, 3]);
  });

  it("supports array splice", async () => {
    const state = createMutable({ list: [1, 2, 3, 4] as (number | string)[] });
    state.list.splice(1, 2, "a", "b");
    expect(state.list).toEqual([1, "a", "b", 4]);
  });

  it("supports array sort", async () => {
    const state = createMutable({ list: [3, 1, 2] });
    state.list.sort();
    expect(state.list).toEqual([1, 2, 3]);
  });

  it("supports array reverse", async () => {
    const state = createMutable({ list: [1, 2, 3] });
    state.list.reverse();
    expect(state.list).toEqual([3, 2, 1]);
  });

  it("supports array fill", async () => {
    const state = createMutable({ list: new Array(3) });
    state.list.fill(0);
    expect(state.list).toEqual([0, 0, 0]);
  });

  it("supports array copyWithin", async () => {
    const state = createMutable({ list: [1, 2, 3, 4, 5] });
    state.list.copyWithin(0, 3);
    expect(state.list).toEqual([4, 5, 3, 4, 5]);
  });

  it("tracks length changes on arrays", async () => {
    const state = createMutable({ list: [1, 2] });
    const log: number[] = [];

    effect(() => {
      log.push(state.list.length);
    });

    state.list.push(3);
    await nextTick();
    expect(log).toEqual([2, 3]);
  });

  it("supports getter descriptors", async () => {
    const state = createMutable({
      firstName: "John",
      lastName: "Smith",
      get fullName() {
        return `${this.firstName} ${this.lastName}`;
      },
    });

    expect(state.fullName).toBe("John Smith");

    const log: string[] = [];
    effect(() => {
      log.push(state.fullName);
    });

    state.firstName = "Jane";
    await nextTick();
    expect(log).toEqual(["John Smith", "Jane Smith"]);
  });

  it("supports setter descriptors", () => {
    const state = createMutable({
      firstName: "John",
      lastName: "Smith",
      get fullName() {
        return `${this.firstName} ${this.lastName}`;
      },
      set fullName(value: string) {
        const [first, last] = value.split(" ");
        this.firstName = first;
        this.lastName = last;
      },
    });

    state.fullName = "Jane Doe";
    expect(state.firstName).toBe("Jane");
    expect(state.lastName).toBe("Doe");
    expect(state.fullName).toBe("Jane Doe");
  });

  it("batches multiple array mutations into one effect run", async () => {
    const state = createMutable({ list: [1] });
    let runs = 0;

    effect(() => {
      void state.list.length;
      runs++;
    });

    runs = 0;
    state.list.push(2);
    // push is already batched internally, so runs should be 1 after nextTick
    await nextTick();
    expect(runs).toBe(1);
  });

  it("does not trigger when value is set to same reference (Object.is)", async () => {
    const state = createMutable({ value: 5 });
    let runs = 0;

    effect(() => {
      void state.value;
      runs++;
    });

    runs = 0;
    state.value = 5;
    await nextTick();
    expect(runs).toBe(0);
  });

  it("supports deleting properties", () => {
    const state = createMutable({ a: 1, b: 2 } as any);
    delete state.a;
    expect("a" in state).toBe(false);
    expect(state.b).toBe(2);
  });

  it("ignores options.name parameter (dev tooling no-op)", () => {
    const state = createMutable({ count: 0 }, { name: "MyStore" });
    expect(state.count).toBe(0);
  });
});

// ─── createStore ─────────────────────────────────────────

describe("createStore", () => {
  it("creates a read-only store and setter", () => {
    const [state, setState] = createStore({ count: 0 });
    expect(state.count).toBe(0);
    expect(typeof setState).toBe("function");
  });

  it("throws on direct assignment", () => {
    const [state] = createStore({ count: 0 });
    expect(() => {
      (state as any).count = 5;
    }).toThrow("Store is read-only");
  });

  it("supports top-level object update via setter", async () => {
    const [state, setState] = createStore({ count: 0, name: "test" });
    const log: number[] = [];

    effect(() => {
      log.push(state.count);
    });

    setState({ count: 5 });
    await nextTick();
    expect(state.count).toBe(5);
    expect(log).toEqual([0, 5]);
  });

  it("supports path-based setter with string keys", async () => {
    const [state, setState] = createStore({ user: { firstName: "John" } });

    setState("user", "firstName", "Jane");
    await nextTick();
    expect(state.user.firstName).toBe("Jane");
  });

  it("supports path-based setter with function modifier", async () => {
    const [state, setState] = createStore({ count: 0 });

    setState("count", (prev: number) => prev + 1);
    await nextTick();
    expect(state.count).toBe(1);
  });

  it("supports nested path creation (missing intermediate objects)", () => {
    const [state, setState] = createStore({ a: {} as any });
    setState("a", "b", "c", 42);
    expect(state.a.b.c).toBe(42);
  });

  it("supports function setter at top level", async () => {
    const [state, setState] = createStore({ count: 0 });

    setState((prev: any) => ({ count: prev.count + 10 }));
    await nextTick();
    expect(state.count).toBe(10);
  });

  it("preserves getters from initial object", () => {
    const [state] = createStore({
      firstName: "John",
      lastName: "Smith",
      get fullName() {
        return `${this.firstName} ${this.lastName}`;
      },
    });

    expect(state.fullName).toBe("John Smith");
  });

  it("tracks reactive reads on store proxy", async () => {
    const [state, setState] = createStore({ value: "x" });
    const log: string[] = [];

    effect(() => {
      log.push(state.value);
    });

    setState({ value: "y" });
    await nextTick();
    expect(log).toEqual(["x", "y"]);
  });

  it("works with empty initial object", () => {
    const [state, setState] = createStore();
    setState({ foo: "bar" });
    expect((state as any).foo).toBe("bar");
  });

  it("ignores options.name parameter (dev tooling no-op)", () => {
    const [state] = createStore({ count: 0 }, { name: "TestStore" });
    expect((state as any).count).toBe(0);
  });
});

// ─── modifyMutable ───────────────────────────────────────

describe("modifyMutable", () => {
  it("applies direct mutation inside a batch", async () => {
    const state = createMutable({
      user: { firstName: "John", lastName: "Smith" },
    });

    modifyMutable(state, (s) => {
      s.user.firstName = "Jane";
      s.user.lastName = "Doe";
      return s;
    });

    expect(state.user.firstName).toBe("Jane");
    expect(state.user.lastName).toBe("Doe");
  });

  it("re-runs effects after modifyMutable batch", async () => {
    const state = createMutable({ count: 0, label: "a" });
    const log: number[] = [];

    effect(() => {
      log.push(state.count);
    });

    log.length = 0;

    modifyMutable(state, (s) => {
      s.count = 10;
      s.label = "b";
      return s;
    });

    await nextTick();
    expect(log).toEqual([10]);
  });

  it("works with produce modifier", async () => {
    const state = createMutable({ user: { name: "John" }, list: ["book"] });

    modifyMutable(
      state,
      produce((s) => {
        s.user.name = "Jane";
        s.list.push("pen");
      }),
    );

    expect(state.user.name).toBe("Jane");
    expect(state.list).toEqual(["book", "pen"]);
  });
});

// ─── produce ─────────────────────────────────────────────

describe("produce", () => {
  it("returns a modifier function", () => {
    const modifier = produce((state: any) => {
      state.name = "Jane";
    });
    expect(typeof modifier).toBe("function");
  });

  it("mutates a copy and returns the modified state", () => {
    const base = { name: "John", age: 30 };
    const modifier = produce((state: any) => {
      state.name = "Jane";
      state.age = 25;
    });
    const result = modifier(base);

    expect(result).toEqual({ name: "Jane", age: 25 });
    expect(base).toEqual({ name: "John", age: 30 }); // original untouched
  });

  it("handles nested object mutation", () => {
    const base = { user: { name: "John" }, list: ["book"] };
    const modifier = produce((state: any) => {
      state.user.name = "Jane";
      state.list.push("pen");
    });
    const result = modifier(base);

    expect(result.user.name).toBe("Jane");
    expect(result.list).toEqual(["book", "pen"]);
  });

  it("does not mutate the original object", () => {
    const base = { nested: { value: 1 } };
    const modifier = produce((state: any) => {
      state.nested.value = 2;
    });
    modifier(base);

    expect(base.nested.value).toBe(1);
  });

  it("can be used with createStore setter", async () => {
    const [state, setState] = createStore({ name: "John", count: 0 });

    setState(
      produce((state: any) => {
        state.name = "Jane";
        state.count = 5;
      }),
    );

    await nextTick();
    expect(state.name).toBe("Jane");
    expect(state.count).toBe(5);
  });

  it("supports array mutation in draft", () => {
    const base = { items: [1, 2] };
    const modifier = produce((state: any) => {
      state.items.push(3);
    });
    const result = modifier(base);

    expect(result.items).toEqual([1, 2, 3]);
  });

  it("supports property deletion in draft", () => {
    const base = { a: 1, b: 2 };
    const modifier = produce((state: any) => {
      delete state.a;
    });
    const result = modifier(base);

    expect(result).toEqual({ b: 2 });
  });
});

// ─── reconcile ───────────────────────────────────────────

describe("reconcile", () => {
  it("reconciles object properties", () => {
    const state = { a: 1, b: 2, c: 3 };
    const modifier = reconcile({ a: 10, b: 20 });
    const result = modifier(state);

    expect(result).toEqual({ a: 10, b: 20 });
    expect(result).toBe(state); // mutated in place
  });

  it("replaces arrays by default (positional)", () => {
    const state = { todos: [1, 2, 3] };
    const modifier = reconcile({ todos: [4, 5] });
    const result = modifier(state);

    expect(result.todos).toEqual([4, 5]);
  });

  it("reconciles arrays with key matching by id", () => {
    const state = {
      todos: [
        { id: 1, title: "A" },
        { id: 2, title: "B" },
      ],
    };
    const originalRef = state.todos[1];
    const modifier = reconcile({
      todos: [
        { id: 2, title: "B2" },
        { id: 3, title: "C" },
      ],
    });
    const result = modifier(state);

    expect(result.todos).toEqual([
      { id: 2, title: "B2" },
      { id: 3, title: "C" },
    ]);
    expect(result.todos[0]).toBe(originalRef); // same object reference
  });

  it("allows custom key for array reconciliation", () => {
    const state = {
      items: [
        { key: "a", val: 1 },
        { key: "b", val: 2 },
      ],
    };
    const originalRef = state.items[1];
    const modifier = reconcile(
      { items: [{ key: "b", val: 3 }] },
      { key: "key" },
    );
    const result = modifier(state);

    expect(result.items).toEqual([{ key: "b", val: 3 }]);
    expect(result.items[0]).toBe(originalRef); // same object ref
  });

  it("supports null key for positional matching", () => {
    const state = { list: [10, 20, 30] };
    const modifier = reconcile({ list: [100, 200] }, { key: null });
    const result = modifier(state);

    expect(result.list).toEqual([100, 200]);
  });

  it("can be used with createStore setter", async () => {
    const [state, setState] = createStore({ todos: [] as any[] });

    setState("todos", reconcile([{ id: 1, title: "Write docs" }]));
    await nextTick();

    expect(state.todos).toEqual([{ id: 1, title: "Write docs" }]);
  });

  it("replaces primitives directly", () => {
    const state = { count: 0 };
    const modifier = reconcile({ count: 5 });
    const result = modifier(state);

    expect(result.count).toBe(5);
  });

  it("removes keys not present in source", () => {
    const state = { a: 1, b: 2 };
    const modifier = reconcile({ a: 10 });
    const result = modifier(state);

    expect(result).toEqual({ a: 10 });
  });
});

// ─── unwrap ──────────────────────────────────────────────

describe("unwrap", () => {
  it("returns plain object from mutable store", () => {
    const state = createMutable({ name: "John", nested: { value: 1 } });
    const plain = unwrap(state);

    expect(plain).toEqual({ name: "John", nested: { value: 1 } });
    expect((plain as any).$PROXY).toBeUndefined();
  });

  it("returns plain object from createStore", () => {
    const [state] = createStore({ name: "Jane", items: [1, 2] });
    const plain = unwrap(state);

    expect(plain).toEqual({ name: "Jane", items: [1, 2] });
  });

  it("returns non-proxy values unchanged", () => {
    expect(unwrap(42)).toBe(42);
    expect(unwrap("hello")).toBe("hello");
    expect(unwrap(null)).toBe(null);
    expect(unwrap(undefined)).toBe(undefined);
  });

  it("unwraps nested store subtrees", () => {
    const state = createMutable({ user: { name: "John" } });
    const user = unwrap(state.user);

    expect(user).toEqual({ name: "John" });
  });

  it("mutating unwrapped value can mutate underlying store", () => {
    const state = createMutable({ user: { name: "John" } });
    const user = unwrap(state.user);

    user.name = "Jane";
    expect(state.user.name).toBe("Jane");
  });

  it("unwraps arrays correctly", () => {
    const state = createMutable({ list: [1, 2, { a: 3 }] });
    const plain = unwrap(state);

    expect(plain.list).toEqual([1, 2, { a: 3 }]);
  });

  it("handles frozen objects by shallow copying", () => {
    const frozen = Object.freeze({ a: 1, nested: { b: 2 } });
    const state = createMutable({ data: frozen });
    const plain = unwrap(state.data);

    expect(plain).toEqual({ a: 1, nested: { b: 2 } });
    expect(Object.isFrozen(plain)).toBe(false);
  });
});

// ─── Reactivity integration ──────────────────────────────

describe("store reactivity integration", () => {
  it("createMutable + effect tracks like signals", async () => {
    const state = createMutable({ counter: 0 });
    const values: number[] = [];

    effect(() => {
      values.push(state.counter);
    });

    expect(values).toEqual([0]);

    state.counter = 1;
    await nextTick();
    expect(values).toEqual([0, 1]);

    state.counter = 2;
    await nextTick();
    expect(values).toEqual([0, 1, 2]);
  });

  it("createStore + effect tracks through setter updates", async () => {
    const [state, setState] = createStore({ items: ["a"] });
    const log: string[][] = [];

    effect(() => {
      log.push([...state.items]);
    });

    setState("items", ["a", "b"]);
    await nextTick();
    expect(log).toEqual([["a"], ["a", "b"]]);
  });

  it("nested effects track independently", async () => {
    const state = createMutable({ a: { b: { c: 1 } } });
    const logC: number[] = [];
    const logB: number[] = [];

    effect(() => {
      logC.push(state.a.b.c);
    });

    effect(() => {
      logB.push(state.a.b.c + 100);
    });

    state.a.b.c = 2;
    await nextTick();
    expect(logC).toEqual([1, 2]);
    expect(logB).toEqual([101, 102]);
  });

  it("dynamic dependencies work with stores (conditional branches)", async () => {
    const state = createMutable({ toggle: true, a: "A", b: "B" });
    const log: string[] = [];

    effect(() => {
      if (state.toggle) {
        log.push(state.a);
      } else {
        log.push(state.b);
      }
    });

    expect(log).toEqual(["A"]);
    log.length = 0;

    state.b = "B2";
    await nextTick();
    expect(log).toEqual([]); // b not tracked in current branch

    state.toggle = false;
    await nextTick();
    expect(log).toEqual(["B2"]);
    log.length = 0;

    state.a = "A2";
    await nextTick();
    expect(log).toEqual([]); // a no longer tracked
  });

  it("effect cleanup works with stores", async () => {
    const state = createMutable({ value: 0 });
    let cleanedUp = false;

    effect(() => {
      void state.value;
      return () => {
        cleanedUp = true;
      };
    });

    expect(cleanedUp).toBe(false);
    state.value = 1;
    await nextTick();
    expect(cleanedUp).toBe(true);
  });

  it("dispose stops store tracking", async () => {
    const state = createMutable({ count: 0 });
    let runs = 0;

    const dispose = effect(() => {
      void state.count;
      runs++;
    });

    expect(runs).toBe(1);

    dispose();
    state.count = 1;
    await nextTick();
    expect(runs).toBe(1); // did not re-run
  });

  it("batch works with store updates", async () => {
    const state = createMutable({ a: 1, b: 2 });
    let runs = 0;

    effect(() => {
      void state.a;
      void state.b;
      runs++;
    });

    runs = 0;
    // Direct property sets are not batched by default,
    // but modifyMutable wraps in batch
    modifyMutable(state, (s) => {
      s.a = 10;
      s.b = 20;
      return s;
    });

    await nextTick();
    expect(runs).toBe(1);
    expect(state.a).toBe(10);
    expect(state.b).toBe(20);
  });
});

// ─── Edge cases ──────────────────────────────────────────

describe("store edge cases", () => {
  it("handles null and undefined properties", () => {
    const state = createMutable({ a: null, b: undefined, c: 1 });
    expect(state.a).toBeNull();
    expect(state.b).toBeUndefined();
    expect(state.c).toBe(1);
  });

  it("handles circular reference in unwrap", () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    const state = createMutable({ data: obj });
    const plain = unwrap(state);

    expect(plain.data.a).toBe(1);
    expect(plain.data.self).toBe(plain.data);
  });

  it("does not wrap functions as store nodes", () => {
    const fn = () => 42;
    const state = createMutable({ fn });
    expect(typeof state.fn).toBe("function");
    expect(state.fn()).toBe(42);
  });

  it("supports symbol keys in ownKeys", () => {
    const sym = Symbol("test");
    const state = createMutable({ [sym]: "value", regular: 1 });
    expect(state.regular).toBe(1);
    expect((state as any)[sym]).toBe("value");
  });

  it("re-reading same property returns cached proxy", () => {
    const state = createMutable({ nested: { value: 1 } });
    const a = state.nested;
    const b = state.nested;
    expect(a).toBe(b);
  });

  it("createStore with existing store wraps correctly", () => {
    const [inner] = createStore({ value: 42 });
    const [outer] = createStore({ inner: inner as any });
    expect(outer.inner.value).toBe(42);
  });

  it("store proxy has correct property descriptor behavior", () => {
    const state = createMutable({ count: 0 });
    const desc = Object.getOwnPropertyDescriptor(state, "count");
    expect(desc).toBeDefined();
    expect(desc!.value).toBe(0);
    expect(desc!.writable).toBe(true);
    expect(desc!.enumerable).toBe(true);
    expect(desc!.configurable).toBe(true);
  });

  it("supports has() trap", () => {
    const state = createMutable({ a: 1 });
    expect("a" in state).toBe(true);
    expect("b" in state).toBe(false);
  });

  it("supports Object.keys on mutable store", () => {
    const state = createMutable({ a: 1, b: 2 });
    expect(Object.keys(state)).toEqual(["a", "b"]);
  });

  it("supports Object.keys on createStore", () => {
    const [state] = createStore({ x: 1, y: 2 });
    expect(Object.keys(state)).toEqual(["x", "y"]);
  });

  it("handles deeply nested path updates", () => {
    const [state, setState] = createStore({ a: { b: { c: { d: 1 } } } });
    setState("a", "b", "c", "d", 42);
    expect(state.a.b.c.d).toBe(42);
  });

  it("produce with top-level createStore replaces entire state", async () => {
    const [state, setState] = createStore({ a: 1, b: 2 });

    setState(
      produce((s: any) => {
        s.a = 10;
        s.b = 20;
      }),
    );

    await nextTick();
    expect(state.a).toBe(10);
    expect(state.b).toBe(20);
  });

  it("reconcile merge false replaces non-matching branches", () => {
    const state = { nested: { a: 1, b: 2 } };
    const modifier = reconcile({ nested: { a: 10 } });
    const result = modifier(state);

    expect(result.nested).toEqual({ a: 10 });
  });

  it("reconcile merge true pushes updates deeper", () => {
    const state = { nested: { a: 1, b: 2 } };
    const modifier = reconcile<any>({ nested: { a: 10 } }, { merge: true });
    const result = modifier(state);

    expect(result.nested).toEqual({ a: 10, b: 2 });
  });
});

// ─── Regression tests ────────────────────────────────────

describe("store regressions", () => {
  it("array pop() returns the removed element", () => {
    const state = createMutable({ list: [1, 2, 3] });
    const popped = state.list.pop();
    expect(popped).toBe(3);
  });

  it("array shift() returns the removed element", () => {
    const state = createMutable({ list: [1, 2, 3] });
    const shifted = state.list.shift();
    expect(shifted).toBe(1);
  });

  it("array splice() returns the removed elements", () => {
    const state = createMutable({ list: [1, 2, 3, 4] });
    const removed = state.list.splice(1, 2);
    expect(removed).toEqual([2, 3]);
  });

  it("array push() returns the new length", () => {
    const state = createMutable({ list: [1, 2] });
    const newLen = state.list.push(3);
    expect(newLen).toBe(3);
  });

  it("array unshift() returns the new length", () => {
    const state = createMutable({ list: [2, 3] });
    const newLen = state.list.unshift(1);
    expect(newLen).toBe(3);
  });

  it("deleting a property triggers reactive effects", async () => {
    const state = createMutable({ a: 1, b: 2 } as any);
    const log: (number | undefined)[] = [];

    effect(() => {
      log.push(state.a);
    });

    expect(log).toEqual([1]);

    delete state.a;
    await nextTick();
    expect(log).toEqual([1, undefined]);
  });

  it("Date objects are stored as-is without proxy wrapping", () => {
    const now = new Date();
    const state = createMutable({ date: now });
    expect(state.date).toBe(now);
    expect(state.date.getTime()).toBe(now.getTime());
  });

  it("RegExp objects are stored as-is without proxy wrapping", () => {
    const re = /test/gi;
    const state = createMutable({ pattern: re });
    expect(state.pattern).toBe(re);
    expect(state.pattern.test("test")).toBe(true);
  });

  it("Map objects are stored as-is without proxy wrapping", () => {
    const map = new Map([["key", "value"]]);
    const state = createMutable({ data: map });
    expect(state.data).toBe(map);
    expect(state.data.get("key")).toBe("value");
  });

  it("Set objects are stored as-is without proxy wrapping", () => {
    const set = new Set([1, 2, 3]);
    const state = createMutable({ data: set });
    expect(state.data).toBe(set);
    expect(state.data.has(2)).toBe(true);
  });

  it("unwrap handles circular proxy references without infinite loop", () => {
    const obj: any = { name: "root" };
    obj.self = obj;
    const state = createMutable(obj);
    const plain = unwrap(state);
    expect(plain.name).toBe("root");
    expect(plain.self).toBe(plain);
  });
});
