/**
 * Comprehensive tests for `cacheSignal`.
 *
 * Tests are organised to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  cacheSignal,
  setRequestAbortSignal,
} from "../../../../src/integrations/react/cache-signal.ts";

describe("cacheSignal — Reference", () => {
  it("returns null on the client", () => {
    const sig = cacheSignal();
    expect(sig).toBeNull();
  });

  it("returns null outside of rendering on the server", () => {
    // Simulate server environment
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    // @ts-expect-error
    globalThis.window = undefined;
    // @ts-expect-error
    globalThis.document = undefined;

    try {
      // Ensure no request signal is set
      setRequestAbortSignal(null);
      const sig = cacheSignal();
      expect(sig).toBeNull();
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      setRequestAbortSignal(null);
    }
  });

  it("returns an AbortSignal when called during server rendering", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    // @ts-expect-error
    globalThis.window = undefined;
    // @ts-expect-error
    globalThis.document = undefined;

    try {
      const controller = new AbortController();
      setRequestAbortSignal(controller.signal);
      const sig = cacheSignal();
      expect(sig).toBe(controller.signal);
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      setRequestAbortSignal(null);
    }
  });
});

describe("cacheSignal — Usage / Cancel in-flight requests", () => {
  it("provides a signal that can be passed to fetch on the server", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    // @ts-expect-error
    globalThis.window = undefined;
    // @ts-expect-error
    globalThis.document = undefined;

    try {
      const controller = new AbortController();
      setRequestAbortSignal(controller.signal);
      const signal = cacheSignal();
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);

      controller.abort();
      expect(signal?.aborted).toBe(true);
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      setRequestAbortSignal(null);
    }
  });

  it("returns null on client so callers must guard before using", () => {
    const signal = cacheSignal();
    expect(signal).toBeNull();
  });
});

describe("cacheSignal — Caveats", () => {
  it("always returns null on the client (current React behaviour)", () => {
    const sig1 = cacheSignal();
    const sig2 = cacheSignal();
    expect(sig1).toBeNull();
    expect(sig2).toBeNull();
  });

  it("returns null on server when no render is active", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    // @ts-expect-error
    globalThis.window = undefined;
    // @ts-expect-error
    globalThis.document = undefined;

    try {
      setRequestAbortSignal(null);
      const sig = cacheSignal();
      expect(sig).toBeNull();
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      setRequestAbortSignal(null);
    }
  });
});

describe("cacheSignal — Edge cases", () => {
  it("reflects the latest signal when setRequestAbortSignal is updated", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    // @ts-expect-error
    globalThis.window = undefined;
    // @ts-expect-error
    globalThis.document = undefined;

    try {
      const ctrl1 = new AbortController();
      const ctrl2 = new AbortController();

      setRequestAbortSignal(ctrl1.signal);
      expect(cacheSignal()).toBe(ctrl1.signal);

      setRequestAbortSignal(ctrl2.signal);
      expect(cacheSignal()).toBe(ctrl2.signal);
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      setRequestAbortSignal(null);
    }
  });

  it("reflects null after setRequestAbortSignal(null)", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    // @ts-expect-error
    globalThis.window = undefined;
    // @ts-expect-error
    globalThis.document = undefined;

    try {
      const controller = new AbortController();
      setRequestAbortSignal(controller.signal);
      expect(cacheSignal()).toBe(controller.signal);

      setRequestAbortSignal(null);
      expect(cacheSignal()).toBeNull();
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      setRequestAbortSignal(null);
    }
  });
});
