/**
 * Comprehensive tests for `<Suspense>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Suspense,
  use,
  useDeferredValue,
  useState,
} from "../../../../src/integrations/react/_client.ts";

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

/** Wait for the next microtask flush (effects + promise resolutions). */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

/** Create a deferred promise that can be resolved manually. */
function createDeferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// ─── Reference ────────────────────────────────────────────────────────────

describe("Suspense — Reference", () => {
  it("shows fallback while a child component suspends", async () => {
    // Covers: Reference / Props / children & fallback — If children suspends
    // while rendering, the Suspense boundary switches to rendering fallback.
    const { promise, resolve } = createDeferred<string>();

    const AsyncChild = cc(() => {
      const value = use(promise);
      return el("div", { "data-testid": "content" }, value);
    });

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("p", { "data-testid": "fallback" }, "loading"),
        },
        el(AsyncChild as any, {}),
      ),
    );

    mount(App, container);

    // Fallback should be visible immediately
    expect(container.querySelector('[data-testid="fallback"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="content"]')).toBeNull();

    // Resolve the promise and wait for retry
    resolve("hello");
    await tick();

    // Content should now be visible
    expect(container.querySelector('[data-testid="content"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="fallback"]')).toBeNull();
  });

  it("renders children directly when no suspension occurs", () => {
    // Covers: Reference / Props — When children does not suspend,
    // it renders immediately without showing fallback.
    const SyncChild = cc(() =>
      el("div", { "data-testid": "sync" }, "sync content"),
    );

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("p", {}, "loading"),
        },
        el(SyncChild as any, {}),
      ),
    );

    mount(App, container);

    expect(container.querySelector('[data-testid="sync"]')).toBeTruthy();
    expect(container.textContent).toContain("sync content");
    expect(container.textContent).not.toContain("loading");
  });

  it("does not catch non-promise errors — renderer handles them as placeholders", () => {
    // Covers: Reference / Caveats — Suspense only catches thrown promises.
    // NOTE: In Sinwan, renderComponentToDOM catches all component errors
    // and returns an empty placeholder. The Suspense boundary then treats
    // this as a successful render and removes the fallback.
    const ErrorChild = cc(() => {
      throw new Error("boom");
    });

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("p", {}, "loading"),
        },
        el(ErrorChild as any, {}),
      ),
    );

    mount(App, container);

    // Fallback is removed because the error was caught and turned into a
    // placeholder component, which Suspense sees as a successful render.
    expect(container.textContent).not.toContain("loading");
  });
});

// ─── Usage / Displaying a fallback while content is loading ─────────────────

describe("Suspense — Usage / Displaying a fallback", () => {
  it("switches from fallback to content when the suspended promise resolves", async () => {
    // Covers: Usage / Displaying a fallback — React displays the fallback
    // until all code and data needed by children has been loaded.
    const { promise, resolve } = createDeferred<string>();

    const Albums = cc(() => {
      const albums = use(promise);
      return el("ul", {}, el("li", {}, albums));
    });

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("h2", {}, "Loading..."),
        },
        el(Albums as any, {}),
      ),
    );

    mount(App, container);
    expect(container.textContent).toContain("Loading...");
    expect(container.querySelector("ul")).toBeNull();

    resolve("Let It Be");
    await tick();

    expect(container.textContent).toContain("Let It Be");
    expect(container.querySelector("ul")).toBeTruthy();
    expect(container.textContent).not.toContain("Loading...");
  });
});

// ─── Usage / Revealing content together at once ─────────────────────────────

describe("Suspense — Usage / Revealing content together", () => {
  it("waits for all children to resolve before revealing any of them", async () => {
    // Covers: Usage / Revealing content together — The whole tree inside
    // Suspense is treated as a single unit.
    const { promise: bioPromise, resolve: resolveBio } =
      createDeferred<string>();
    const { promise: albumsPromise, resolve: resolveAlbums } =
      createDeferred<string>();

    const Biography = cc(() => {
      const bio = use(bioPromise);
      return el("p", { "data-testid": "bio" }, bio);
    });

    const Albums = cc(() => {
      const albums = use(albumsPromise);
      return el("ul", { "data-testid": "albums" }, albums);
    });

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("h2", {}, "BigSpinner"),
        },
        el(Biography as any, {}),
        el(Albums as any, {}),
      ),
    );

    mount(App, container);
    expect(container.textContent).toContain("BigSpinner");

    // Resolve biography first — content should still not appear
    resolveBio("The Beatles were...");
    await tick();
    expect(container.textContent).toContain("BigSpinner");
    expect(container.querySelector('[data-testid="bio"]')).toBeNull();

    // Resolve albums — now everything appears together
    resolveAlbums("Please Please Me");
    await tick();
    expect(container.querySelector('[data-testid="bio"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="albums"]')).toBeTruthy();
    expect(container.textContent).not.toContain("BigSpinner");
  });
});

// ─── Usage / Revealing nested content as it loads ──────────────────────────

describe("Suspense — Usage / Nested boundaries", () => {
  it("lets an inner Suspense boundary handle its own suspension", async () => {
    // Covers: Usage / Revealing nested content — Each Suspense boundary's
    // fallback is filled in as the next level of content becomes available.
    const { promise: albumsPromise, resolve: resolveAlbums } =
      createDeferred<string>();

    const Biography = cc(() => el("p", { "data-testid": "bio" }, "Bio text"));

    const Albums = cc(() => {
      const albums = use(albumsPromise);
      return el("ul", { "data-testid": "albums" }, albums);
    });

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("h2", {}, "BigSpinner"),
        },
        el(Biography as any, {}),
        el(
          Suspense as any,
          {
            fallback: el(
              "div",
              { "data-testid": "inner-fallback" },
              "AlbumsGlimmer",
            ),
          },
          el(Albums as any, {}),
        ),
      ),
    );

    mount(App, container);

    // Biography is sync, but Albums suspends.
    // The INNER boundary should show its own fallback.
    // The outer boundary should NOT show BigSpinner because the inner
    // boundary successfully renders a reactive block (not a thrown promise).
    expect(container.querySelector('[data-testid="bio"]')).toBeTruthy();
    expect(
      container.querySelector('[data-testid="inner-fallback"]'),
    ).toBeTruthy();
    expect(container.querySelector('[data-testid="albums"]')).toBeNull();

    resolveAlbums("Abbey Road");
    await tick();

    expect(container.querySelector('[data-testid="albums"]')).toBeTruthy();
    expect(
      container.querySelector('[data-testid="inner-fallback"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Abbey Road");
  });
});

// ─── Usage / Showing stale content while fresh content is loading ───────────

describe("Suspense — Usage / Showing stale content", () => {
  it("useDeferredValue can defer a query so stale results stay visible", async () => {
    // Covers: Usage / Showing stale content — The deferredQuery keeps its
    // previous value until the data has loaded.
    // NOTE: In Sinwan this pattern uses useDeferredValue + Suspense together.
    let setQuery: any;
    let deferredQuery: any;

    const App = cc(() => {
      const [query, sq] = useState("a");
      const d = useDeferredValue(query);
      setQuery = sq;
      deferredQuery = d;
      return el("div", {}, d);
    });

    mount(App, container);
    expect(container.textContent).toContain("a");

    setQuery("ab");
    // Deferred value still shows old query until microtask
    expect(container.textContent).toContain("a");
    expect(deferredQuery()).toBe("a");

    await tick();
    expect(deferredQuery()).toBe("ab");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("Suspense — Edge cases", () => {
  it("handles empty children gracefully", () => {
    const App = cc(() =>
      el(Suspense as any, {
        fallback: el("p", {}, "loading"),
        children: undefined,
      }),
    );

    mount(App, container);
    // No children = no suspension, fallback should not appear
    expect(container.textContent).not.toContain("loading");
  });

  it("handles multiple sequential thrown promises from the same component", async () => {
    // Covers: Reference / Caveats — React will always use the latest
    // provided value. Multiple rapid suspensions converge to the latest.
    const p1 = createDeferred<string>();
    const p2 = createDeferred<string>();
    let currentPromise = p1.promise;

    const SwitchingChild = cc(() => {
      const value = use(currentPromise);
      return el("div", { "data-testid": "switch" }, value);
    });

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("p", {}, "loading"),
        },
        el(SwitchingChild as any, {}),
      ),
    );

    mount(App, container);
    expect(container.textContent).toContain("loading");

    // Switch to a new promise before the first one resolves.
    // In Sinwan, the component won't auto-re-render, but when the
    // boundary retries (triggered by p1 resolving), the new render
    // will read the latest currentPromise (p2).
    currentPromise = p2.promise;
    p1.resolve("first");
    await tick();

    // The boundary retries because p1 resolved, but the component
    // now uses p2 which is still pending, so it re-suspends.
    expect(container.textContent).toContain("loading");

    p2.resolve("second");
    await tick();

    // Now p2 is resolved, so content appears.
    expect(container.textContent).toContain("second");
    expect(container.querySelector('[data-testid="switch"]')).toBeTruthy();
  });
});
