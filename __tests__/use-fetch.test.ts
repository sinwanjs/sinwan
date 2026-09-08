import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/scheduler.ts";
import { createFetch, useFetch } from "../src/hook/index.ts";
import {
  createSSRContext,
  withSSRContext,
  setSSRContext,
  type SSRContext,
} from "../src/event/ssr-context.ts";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

function textResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, init);
}

function asFetch(
  fn: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
) {
  return fn as unknown as typeof globalThis.fetch;
}

describe("useFetch", () => {
  it("exposes initial reactive state without immediate execution", () => {
    const fetcher = useFetch<string>("/api/message", {
      immediate: false,
      initialData: "idle",
    });

    expect(fetcher.isFinished.value).toBe(true);
    expect(fetcher.isFetching.value).toBe(false);
    expect(fetcher.canAbort.value).toBe(false);
    expect(fetcher.statusCode.value).toBeNull();
    expect(fetcher.response.value).toBeNull();
    expect(fetcher.error.value).toBeNull();
    expect(fetcher.data.value).toBe("idle");
  });

  it("fetches JSON data and updates response state", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push([String(input), init]);
      return jsonResponse({ ok: true });
    };

    const fetcher = useFetch<{ ok: boolean }>("/api/data", {
      fetch: asFetch(fetch),
      immediate: false,
    }).json<{ ok: boolean }>();

    let sawResponse = false;
    let sawFinally = false;
    fetcher.onFetchResponse(() => {
      sawResponse = true;
    });
    fetcher.onFetchFinally(() => {
      sawFinally = true;
    });

    const result = await fetcher.execute();

    expect(result).toBeInstanceOf(Response);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("/api/data");
    expect(fetcher.statusCode.value).toBe(200);
    expect(fetcher.response.value).toBeInstanceOf(Response);
    expect(fetcher.data.value).toEqual({ ok: true });
    expect(fetcher.error.value).toBeNull();
    expect(fetcher.isFinished.value).toBe(true);
    expect(fetcher.isFetching.value).toBe(false);
    expect(sawResponse).toBe(true);
    expect(sawFinally).toBe(true);
  });

  it("supports text responses and PromiseLike awaiting", async () => {
    const fetch = async () => textResponse("hello");
    const fetcher = useFetch<string>("/api/text", {
      fetch: asFetch(fetch),
      immediate: true,
    }).text();

    const resolved = await fetcher;

    expect(resolved.data.value).toBe("hello");
    expect(fetcher.data.value).toBe("hello");
    expect(fetcher.statusCode.value).toBe(200);
  });

  it("sends method payloads with inferred JSON content type", async () => {
    let request: RequestInit | undefined;
    const fetch = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      request = init;
      return jsonResponse({ created: true });
    };

    const fetcher = useFetch<{ created: boolean }>("/api/items", {
      fetch: asFetch(fetch),
      immediate: false,
    })
      .post({ name: "Sinwan" })
      .json<{ created: boolean }>();

    await fetcher.execute();

    expect(request?.method).toBe("POST");
    expect(request?.body).toBe(JSON.stringify({ name: "Sinwan" }));
    expect((request?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(fetcher.data.value).toEqual({ created: true });
  });

  it("handles failed responses and triggers error hooks", async () => {
    const fetch = async () =>
      textResponse("missing", { status: 404, statusText: "Not Found" });
    const fetcher = useFetch<string>("/api/missing", {
      fetch: asFetch(fetch),
      immediate: false,
      initialData: "fallback",
    }).text();

    let hookError: unknown;
    fetcher.onFetchError((error) => {
      hookError = error;
    });

    const result = await fetcher.execute();

    expect(result).toBeNull();
    expect(fetcher.statusCode.value).toBe(404);
    expect(fetcher.error.value).toBe("Not Found");
    expect(fetcher.data.value).toBe("fallback");
    expect(hookError).toBeInstanceOf(Error);
  });

  it("throws failed responses when throwOnFailed is true", async () => {
    const fetch = async () =>
      textResponse("bad", { status: 500, statusText: "Server Error" });
    const fetcher = useFetch<string>("/api/fail", {
      fetch: asFetch(fetch),
      immediate: false,
    }).text();

    await expect(fetcher.execute(true)).rejects.toThrow("Server Error");
    expect(fetcher.error.value).toBe("Server Error");
  });

  it("allows beforeFetch cancellation", async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return textResponse("should not run");
    };

    const fetcher = useFetch<string>("/api/cancel", {
      fetch: asFetch(fetch),
      immediate: false,
      beforeFetch: ({ cancel }) => cancel(),
    }).text();

    const result = await fetcher.execute();

    expect(result).toBeNull();
    expect(calls).toBe(0);
    expect(fetcher.isFinished.value).toBe(true);
  });

  it("allows afterFetch and onFetchError to transform state", async () => {
    const ok = useFetch<{ value: number }>("/api/ok", {
      fetch: asFetch(async () => jsonResponse({ value: 1 })),
      immediate: false,
      afterFetch: ({ data }) => ({
        data: { value: (data as { value: number }).value + 1 },
      }),
    }).json<{ value: number }>();

    await ok.execute();
    expect(ok.data.value).toEqual({ value: 2 });

    const failed = useFetch<string>("/api/error", {
      fetch: asFetch(async () =>
        textResponse("bad", { status: 400, statusText: "Bad Request" }),
      ),
      immediate: false,
      updateDataOnError: true,
      onFetchError: () => ({ error: "custom", data: "recovered" }),
    }).text();

    await failed.execute();
    expect(failed.error.value).toBe("custom");
    expect(failed.data.value).toBe("recovered");
  });

  it("refetches when reactive URL changes and refetch is enabled", async () => {
    const url = signal("/api/one");
    const calls: string[] = [];
    const fetch = async (input: string | URL | Request) => {
      calls.push(String(input));
      return jsonResponse({ url: String(input) });
    };

    const fetcher = useFetch<{ url: string }>(url, {
      fetch: asFetch(fetch),
      immediate: false,
      refetch: true,
    }).json<{ url: string }>();

    await fetcher.execute();
    url.value = "/api/two";
    await nextTick();
    await fetcher;

    expect(calls).toEqual(["/api/one", "/api/two"]);
    expect(fetcher.data.value).toEqual({ url: "/api/two" });
  });

  it("aborts in-flight requests when abort is called", async () => {
    let signalFromRequest: AbortSignal | undefined;
    const fetch = (_input: string | URL | Request, init?: RequestInit) => {
      signalFromRequest = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    };

    const fetcher = useFetch<string>("/api/slow", {
      fetch: asFetch(fetch),
      immediate: false,
    }).text();

    const pending = fetcher.execute();
    await Promise.resolve();

    expect(fetcher.canAbort.value).toBe(true);
    fetcher.abort("manual");
    await pending;

    expect(signalFromRequest?.aborted).toBe(true);
    expect(fetcher.aborted.value).toBe(true);
    expect(fetcher.error.value).toBe("Aborted");
    expect(fetcher.isFinished.value).toBe(true);
  });

  it("aborts requests after timeout", async () => {
    const fetch = (_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Timeout", "AbortError")),
        );
      });
    };

    const fetcher = useFetch<string>("/api/timeout", {
      fetch: asFetch(fetch),
      immediate: false,
      timeout: 1,
    }).text();

    await fetcher.execute();

    expect(fetcher.aborted.value).toBe(true);
    expect(fetcher.error.value).toBe("Timeout");
    expect(fetcher.isFinished.value).toBe(true);
  });

  it("allows unsubscribing from event hooks via the returned disposer", async () => {
    const fetch = asFetch(async () => textResponse("ok"));
    const fetcher = useFetch<string>("/api/unsub", {
      fetch,
      immediate: false,
    }).text();

    let responseCalls = 0;
    const dispose = fetcher.onFetchResponse(() => {
      responseCalls += 1;
    });

    await fetcher.execute();
    expect(responseCalls).toBe(1);

    // Unsubscribe, then re-execute — the handler must not fire again.
    dispose();
    await fetcher.execute();
    expect(responseCalls).toBe(1);
  });
});

describe("createFetch", () => {
  it("joins base URLs, merges fetch options, and chains callbacks", async () => {
    const events: string[] = [];
    let request: RequestInit | undefined;
    const customFetch = createFetch({
      baseUrl: "https://example.com/api",
      fetchOptions: {
        headers: { "X-Base": "1" },
      },
      options: {
        fetch: asFetch(
          async (input: string | URL | Request, init?: RequestInit) => {
            request = init;
            return jsonResponse({ input: String(input) });
          },
        ),
        immediate: false,
        beforeFetch: (ctx) => {
          events.push(`base:${ctx.url}`);
          return ctx;
        },
      },
    });

    const fetcher = customFetch(
      "users",
      {
        headers: { "X-Request": "2" },
      },
      {
        beforeFetch: (ctx) => {
          events.push(`local:${ctx.url}`);
          return ctx;
        },
      },
    ).json<{ input: string }>();

    await fetcher.execute();

    expect(fetcher.data.value).toEqual({
      input: "https://example.com/api/users",
    });
    expect(events).toEqual([
      "base:https://example.com/api/users",
      "local:https://example.com/api/users",
    ]);
    expect((request?.headers as Record<string, string>)["X-Base"]).toBe("1");
    expect((request?.headers as Record<string, string>)["X-Request"]).toBe("2");
  });

  it("does not prefix absolute URLs", async () => {
    const calls: string[] = [];
    const customFetch = createFetch({
      baseUrl: "https://example.com/api",
      options: {
        fetch: asFetch(async (input: string | URL | Request) => {
          calls.push(String(input));
          return textResponse("ok");
        }),
        immediate: false,
      },
    });

    await customFetch("https://cdn.example.com/file").text().execute();

    expect(calls).toEqual(["https://cdn.example.com/file"]);
  });
});

// ─── createFetch: combination & option-arg branches ──────────────────────

describe("createFetch — combination: overwrite", () => {
  it("uses only the last non-null callback (overwrite)", async () => {
    const events: string[] = [];
    const customFetch = createFetch({
      combination: "overwrite",
      options: {
        fetch: asFetch(async () => jsonResponse({ ok: true })),
        immediate: false,
        beforeFetch: (ctx) => {
          events.push("base");
          return ctx;
        },
      },
    });

    const fetcher = customFetch("/api/ow", {
      beforeFetch: (ctx) => {
        events.push("local");
        return ctx;
      },
    }).json<{ ok: boolean }>();

    await fetcher.execute();

    // Overwrite keeps only the last non-null beforeFetch (the local one).
    expect(events).toEqual(["local"]);
    expect(fetcher.data.value).toEqual({ ok: true });
  });

  it("falls back to ctx when no callback is present (overwrite)", async () => {
    const customFetch = createFetch({
      combination: "overwrite",
      options: {
        fetch: asFetch(async () => textResponse("ok")),
        immediate: false,
      },
    });

    const fetcher = customFetch("/api/ow-none").text();
    const res = await fetcher.execute();
    expect(res).toBeInstanceOf(Response);
    expect(fetcher.data.value).toBe("ok");
  });

  it("uses the last non-null onFetchError callback on error (overwrite)", async () => {
    const events: string[] = [];
    const customFetch = createFetch({
      combination: "overwrite",
      options: {
        fetch: asFetch(async () =>
          textResponse("bad", { status: 400, statusText: "Bad" }),
        ),
        immediate: false,
        onFetchError: () => {
          events.push("base-err");
          return { error: "base" };
        },
      },
    });

    const fetcher = customFetch("/api/ow-err", {
      onFetchError: () => {
        events.push("local-err");
        return { error: "local" };
      },
    }).text();

    await fetcher.execute();

    // Overwrite keeps only the last non-null onFetchError (local).
    expect(events).toEqual(["local-err"]);
    expect(fetcher.error.value).toBe("local");
  });
});

describe("createFetch — UseFetchOptions as first arg", () => {
  it("merges UseFetchOptions passed as args[0] and chains callbacks", async () => {
    const events: string[] = [];
    const customFetch = createFetch({
      options: {
        fetch: asFetch(async () => jsonResponse({ ok: true })),
        immediate: false,
        beforeFetch: (ctx) => {
          events.push("base");
          return ctx;
        },
      },
    });

    // args[0] is a UseFetchOptions (has beforeFetch) → isFetchOptions branch.
    const fetcher = customFetch("/api/opts-first", {
      immediate: false,
      beforeFetch: (ctx) => {
        events.push("local");
        return ctx;
      },
    }).json<{ ok: boolean }>();

    await fetcher.execute();

    // Chain runs both base and local beforeFetch in order.
    expect(events).toEqual(["base", "local"]);
    expect(fetcher.data.value).toEqual({ ok: true });
  });

  it("merges UseFetchOptions passed as args[1] over a RequestInit args[0]", async () => {
    const events: string[] = [];
    const customFetch = createFetch({
      options: {
        fetch: asFetch(async () => textResponse("ok")),
        immediate: false,
      },
    });

    // args[0] is a RequestInit (headers), args[1] is a UseFetchOptions.
    const fetcher = customFetch(
      "/api/opts-second",
      { headers: { "X-Req": "1" } },
      {
        immediate: false,
        beforeFetch: (ctx) => {
          events.push(`url:${ctx.url}`);
          return ctx;
        },
      },
    ).text();

    await fetcher.execute();
    expect(events).toEqual(["url:/api/opts-second"]);
    expect(fetcher.data.value).toBe("ok");
  });
});

// ─── Client hydration cache ──────────────────────────────────────────────

describe("useFetch — client hydration cache", () => {
  let win: InstanceType<typeof Window>;
  let doc: Document;

  beforeEach(() => {
    win = new Window({ url: "http://localhost" });
    doc = win.document as unknown as Document;
    (globalThis as any).window = win;
    (globalThis as any).document = doc;
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  function injectSinwanData(fetchData: Record<string, unknown>) {
    const script = doc.createElement("script");
    script.id = "__SINWAN_DATA__";
    script.type = "application/json";
    script.textContent = JSON.stringify({ fetchData });
    doc.head.appendChild(script);
    return script;
  }

  it("consumes cached data synchronously on immediate client mount", async () => {
    let fetchCalls = 0;
    const fetch = asFetch(async () => {
      fetchCalls += 1;
      return textResponse("should-not-run");
    });

    injectSinwanData({
      "GET:/api/cached": { data: "cached-value", statusCode: 200, error: null },
    });

    const fetcher = useFetch<string>("/api/cached", {
      fetch,
      immediate: true,
    }).text();

    // Synchronous consumption: data is already populated, fetch never runs.
    expect(fetcher.data.value).toBe("cached-value");
    expect(fetcher.statusCode.value).toBe(200);
    expect(fetcher.isFinished.value).toBe(true);
    expect(fetchCalls).toBe(0);
  });

  it("removes the consumed entry from the __SINWAN_DATA__ script", async () => {
    const script = injectSinwanData({
      "GET:/api/once": { data: "v", statusCode: 200, error: null },
    });

    const fetch = asFetch(async () => textResponse("x"));
    useFetch<string>("/api/once", { fetch, immediate: true }).text();

    const remaining = JSON.parse(script.textContent || "{}");
    expect(remaining.fetchData).toEqual({});
  });

  it("falls back to execute when no cache is present on immediate client mount", async () => {
    let fetchCalls = 0;
    const fetch = asFetch(async () => {
      fetchCalls += 1;
      return textResponse("live");
    });

    const fetcher = useFetch<string>("/api/no-cache", {
      fetch,
      immediate: true,
    }).text();

    await fetcher;
    expect(fetchCalls).toBe(1);
    expect(fetcher.data.value).toBe("live");
  });
});

// ─── SSR context: baseUrl, fetchCache, pendingFetches ────────────────────

describe("useFetch — SSR context", () => {
  let prevSSR: SSRContext | null;
  let ctx: SSRContext;

  beforeEach(() => {
    // Ensure server environment (no window) for SSR tests.
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    ctx = createSSRContext();
    prevSSR = setSSRContext(ctx);
  });

  afterEach(() => {
    setSSRContext(prevSSR);
  });

  it("joins relative URLs with ssrContext.baseUrl", async () => {
    ctx.baseUrl = "https://api.example.com";
    const calls: string[] = [];
    const fetch = asFetch(async (input: string | URL | Request) => {
      calls.push(String(input));
      return jsonResponse({ ok: true });
    });

    const fetcher = useFetch<{ ok: boolean }>("users", {
      fetch,
      immediate: false,
    }).json<{ ok: boolean }>();

    await fetcher.execute();
    expect(calls).toEqual(["https://api.example.com/users"]);
  });

  it("does not join absolute URLs with ssrContext.baseUrl", async () => {
    ctx.baseUrl = "https://api.example.com";
    const calls: string[] = [];
    const fetch = asFetch(async (input: string | URL | Request) => {
      calls.push(String(input));
      return textResponse("ok");
    });

    await useFetch<string>("https://other.example.com/x", {
      fetch,
      immediate: false,
    })
      .text()
      .execute();
    expect(calls).toEqual(["https://other.example.com/x"]);
  });

  it("returns cached data from ssrContext.fetchCache without fetching", async () => {
    let fetchCalls = 0;
    const fetch = asFetch(async () => {
      fetchCalls += 1;
      return textResponse("should-not-run");
    });

    ctx.fetchCache.set("GET:/api/ssr-cached", {
      data: "ssr-cached",
      statusCode: 201,
      error: null,
    });

    const fetcher = useFetch<string>("/api/ssr-cached", {
      fetch,
      immediate: false,
    }).text();

    const res = await fetcher.execute();
    expect(res).toBeNull();
    expect(fetcher.data.value).toBe("ssr-cached");
    expect(fetcher.statusCode.value).toBe(201);
    expect(fetchCalls).toBe(0);
  });

  it("stores successful responses in ssrContext.fetchCache", async () => {
    const fetch = asFetch(async () => jsonResponse({ value: 42 }));

    const fetcher = useFetch<{ value: number }>("/api/ssr-ok", {
      fetch,
      immediate: false,
    }).json<{ value: number }>();

    await fetcher.execute();

    const entry = ctx.fetchCache.get("GET:/api/ssr-ok");
    expect(entry).toEqual({
      data: { value: 42 },
      statusCode: 200,
      error: null,
    });
  });

  it("stores errors in ssrContext.fetchCache", async () => {
    const fetch = asFetch(async () =>
      textResponse("bad", { status: 400, statusText: "Bad Request" }),
    );

    const fetcher = useFetch<string>("/api/ssr-err", {
      fetch,
      immediate: false,
      updateDataOnError: true,
      onFetchError: () => ({ error: "custom-err", data: "recovered" }),
    }).text();

    await fetcher.execute();

    const entry = ctx.fetchCache.get("GET:/api/ssr-err");
    expect(entry).toEqual({
      data: "recovered",
      statusCode: 400,
      error: "custom-err",
    });
  });

  it("registers pending fetch promises on immediate server execution", async () => {
    const fetch = asFetch(async () => textResponse("ok"));

    const fetcher = useFetch<string>("/api/ssr-immediate", {
      fetch,
      immediate: true,
    }).text();

    // The immediate server path adds the execute() promise to pendingFetches.
    expect(ctx.pendingFetches.size).toBe(1);
    await fetcher;
    // After settling, the promise remains in the set (caller clears the set).
    expect(ctx.pendingFetches.size).toBe(1);
    ctx.pendingFetches.clear();
  });
});

// ─── Signal payload with refetch ─────────────────────────────────────────

describe("useFetch — signal payload with refetch", () => {
  it("refetches when a signal payload changes and refetch is enabled", async () => {
    const calls: Array<{ body: unknown }> = [];
    const payload = signal({ name: "a" });
    const fetch = asFetch(
      async (_input: string | URL | Request, init?: RequestInit) => {
        calls.push({ body: init?.body });
        return jsonResponse({ ok: true });
      },
    );

    const fetcher = useFetch<{ ok: boolean }>("/api/signal-payload", {
      fetch,
      immediate: false,
      refetch: true,
    })
      .post(payload)
      .json<{ ok: boolean }>();

    await fetcher.execute();
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toBe(JSON.stringify({ name: "a" }));

    payload.value = { name: "b" };
    await nextTick();
    await fetcher;

    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[calls.length - 1].body).toBe(JSON.stringify({ name: "b" }));
  });
});

// ─── PromiseLike: await when already finished ────────────────────────────

describe("useFetch — PromiseLike", () => {
  it("resolves immediately when already finished (no execute)", async () => {
    const fetch = asFetch(async () => textResponse("never"));
    const fetcher = useFetch<string>("/api/idle", {
      fetch,
      immediate: false,
    }).text();

    // isFinished is true because isLoading is false; await resolves at once
    // with the inner shell (data untouched, fetch never called).
    const resolved = await fetcher;
    expect(resolved.data.value).toBeNull();
    expect(fetcher.data.value).toBeNull();
    expect(fetcher.isFinished.value).toBe(true);
  });
});

// ─── joinPaths edge cases (via createFetch baseUrl) ──────────────────────

describe("createFetch — joinPaths edge cases", () => {
  it("joins when base ends with '/' and path starts with '/'", async () => {
    const calls: string[] = [];
    const customFetch = createFetch({
      baseUrl: "https://example.com/api/",
      options: {
        fetch: asFetch(async (input: string | URL | Request) => {
          calls.push(String(input));
          return textResponse("ok");
        }),
        immediate: false,
      },
    });

    await customFetch("/users").text().execute();
    expect(calls).toEqual(["https://example.com/api/users"]);
  });

  it("joins when base ends with '/' and path does not start with '/'", async () => {
    const calls: string[] = [];
    const customFetch = createFetch({
      baseUrl: "https://example.com/api/",
      options: {
        fetch: asFetch(async (input: string | URL | Request) => {
          calls.push(String(input));
          return textResponse("ok");
        }),
        immediate: false,
      },
    });

    await customFetch("users").text().execute();
    expect(calls).toEqual(["https://example.com/api/users"]);
  });

  it("joins when base does not end with '/' and path starts with '/'", async () => {
    const calls: string[] = [];
    const customFetch = createFetch({
      baseUrl: "https://example.com/api",
      options: {
        fetch: asFetch(async (input: string | URL | Request) => {
          calls.push(String(input));
          return textResponse("ok");
        }),
        immediate: false,
      },
    });

    await customFetch("/users").text().execute();
    expect(calls).toEqual(["https://example.com/api/users"]);
  });
});
