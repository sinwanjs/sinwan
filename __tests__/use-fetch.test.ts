import { describe, expect, it } from "bun:test";
import { signal } from "../src/reactivity/index.ts";
import { nextTick } from "../src/reactivity/scheduler.ts";
import { createFetch, useFetch } from "../src/hook/index.ts";

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
