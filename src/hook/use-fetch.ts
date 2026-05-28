import {
  computed,
  effect,
  isSignal,
  resolve,
  signal,
  type Computed,
  type Signal,
} from "../reactivity/index.ts";
import { getSSRContext } from "../event/ssr-context.ts";
import { getSinwanData } from "../hydration/index.ts";

export type Fn = () => void;
export type Stoppable = { stop: Fn; start: Fn; isPending: Signal<boolean> };
export type MaybeReactive<T> = T | Signal<T> | Computed<T> | (() => T);
export type EventHookOn<T = unknown> = (fn: (param: T) => void) => Fn;

export interface UseFetchReturn<T> {
  isFinished: Computed<boolean>;
  statusCode: Signal<number | null>;
  response: Signal<Response | null>;
  error: Signal<any>;
  data: Signal<T | null>;
  isFetching: Computed<boolean>;
  canAbort: Computed<boolean>;
  aborted: Signal<boolean>;
  abort: (reason?: any) => void;
  execute: (throwOnFailed?: boolean) => Promise<any>;
  onFetchResponse: EventHookOn<Response>;
  onFetchError: EventHookOn<any>;
  onFetchFinally: EventHookOn<any>;
  get: () => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  post: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  put: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  delete: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  patch: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  head: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  options: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  json: <JSON = T>() => UseFetchReturn<JSON> &
    PromiseLike<UseFetchReturn<JSON>>;
  text: () => UseFetchReturn<string> & PromiseLike<UseFetchReturn<string>>;
  blob: () => UseFetchReturn<Blob> & PromiseLike<UseFetchReturn<Blob>>;
  arrayBuffer: () => UseFetchReturn<ArrayBuffer> &
    PromiseLike<UseFetchReturn<ArrayBuffer>>;
  formData: () => UseFetchReturn<FormData> &
    PromiseLike<UseFetchReturn<FormData>>;
}

type DataType = "text" | "json" | "blob" | "arrayBuffer" | "formData";
type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";
type Combination = "overwrite" | "chain";

const payloadMapping: Record<string, string> = {
  json: "application/json",
  text: "text/plain",
};

export interface BeforeFetchContext {
  url: string;
  options: RequestInit;
  cancel: Fn;
}

export interface AfterFetchContext<T = any> {
  response: Response;
  data: T | null;
  context: BeforeFetchContext;
  execute: (throwOnFailed?: boolean) => Promise<any>;
}

export interface OnFetchErrorContext<T = any, E = any> {
  error: E;
  data: T | null;
  response: Response | null;
  context: BeforeFetchContext;
  execute: (throwOnFailed?: boolean) => Promise<any>;
}

export interface UseFetchOptions {
  fetch?: typeof globalThis.fetch;
  immediate?: boolean;
  refetch?: MaybeReactive<boolean>;
  initialData?: any;
  timeout?: number;
  updateDataOnError?: boolean;
  beforeFetch?: (
    ctx: BeforeFetchContext,
  ) =>
    | Promise<Partial<BeforeFetchContext> | void>
    | Partial<BeforeFetchContext>
    | void;
  afterFetch?: (
    ctx: AfterFetchContext,
  ) => Promise<Partial<AfterFetchContext>> | Partial<AfterFetchContext>;
  onFetchError?: (
    ctx: OnFetchErrorContext,
  ) => Promise<Partial<OnFetchErrorContext>> | Partial<OnFetchErrorContext>;
}

export interface CreateFetchOptions {
  baseUrl?: MaybeReactive<string>;
  combination?: Combination;
  options?: UseFetchOptions;
  fetchOptions?: RequestInit;
}

function containsProp(obj: object, ...props: string[]) {
  return props.some((prop) => prop in obj);
}

function isFetchOptions(obj: object): obj is UseFetchOptions {
  return (
    obj &&
    containsProp(
      obj,
      "immediate",
      "refetch",
      "initialData",
      "timeout",
      "beforeFetch",
      "afterFetch",
      "onFetchError",
      "fetch",
      "updateDataOnError",
    )
  );
}

const reAbsolute = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i;

function isAbsoluteURL(url: string) {
  return reAbsolute.test(url);
}

function headersToObject(headers: HeadersInit | undefined) {
  if (typeof Headers !== "undefined" && headers instanceof Headers)
    return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}

function createEventHook<T = unknown>() {
  const fns = new Set<(param: T) => void>();
  return {
    on(fn: (param: T) => void) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    trigger(param: T) {
      for (const fn of fns) fn(param);
    },
  };
}

function useTimeoutFn(fn: Fn, interval: number): Stoppable {
  const isPending = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    isPending.value = false;
  };
  const start = () => {
    stop();
    isPending.value = true;
    timer = setTimeout(() => {
      isPending.value = false;
      fn();
    }, interval);
  };
  return { stop, start, isPending };
}

function combineCallbacks<T = any>(
  combination: Combination,
  ...callbacks: (
    | ((ctx: T) => void | Partial<T> | Promise<void | Partial<T>>)
    | undefined
  )[]
) {
  if (combination === "overwrite") {
    return async (ctx: T) => {
      let callback;
      for (let i = callbacks.length - 1; i >= 0; i--) {
        if (callbacks[i] != null) {
          callback = callbacks[i];
          break;
        }
      }
      if (callback) return { ...ctx, ...(await callback(ctx)) };
      return ctx;
    };
  }
  return async (ctx: T) => {
    for (const callback of callbacks) {
      if (callback) ctx = { ...ctx, ...(await callback(ctx)) };
    }
    return ctx;
  };
}

export function createFetch(config: CreateFetchOptions = {}) {
  const _combination = config.combination || ("chain" as Combination);
  const _options = config.options || {};
  const _fetchOptions = config.fetchOptions || {};

  function useFactoryFetch(url: MaybeReactive<string>, ...args: any[]) {
    const computedUrl = computed(() => {
      const baseUrl = resolve(config.baseUrl);
      const targetUrl = resolve(url);
      return baseUrl && !isAbsoluteURL(targetUrl)
        ? joinPaths(baseUrl, targetUrl)
        : targetUrl;
    });

    let options = _options;
    let fetchOptions = _fetchOptions;

    if (args.length > 0) {
      if (isFetchOptions(args[0])) {
        options = {
          ...options,
          ...args[0],
          beforeFetch: combineCallbacks(
            _combination,
            _options.beforeFetch,
            args[0].beforeFetch,
          ),
          afterFetch: combineCallbacks(
            _combination,
            _options.afterFetch,
            args[0].afterFetch,
          ),
          onFetchError: combineCallbacks(
            _combination,
            _options.onFetchError,
            args[0].onFetchError,
          ),
        };
      } else {
        fetchOptions = {
          ...fetchOptions,
          ...args[0],
          headers: {
            ...(headersToObject(fetchOptions.headers) || {}),
            ...(headersToObject(args[0].headers) || {}),
          },
        };
      }
    }

    if (args.length > 1 && isFetchOptions(args[1])) {
      options = {
        ...options,
        ...args[1],
        beforeFetch: combineCallbacks(
          _combination,
          _options.beforeFetch,
          args[1].beforeFetch,
        ),
        afterFetch: combineCallbacks(
          _combination,
          _options.afterFetch,
          args[1].afterFetch,
        ),
        onFetchError: combineCallbacks(
          _combination,
          _options.onFetchError,
          args[1].onFetchError,
        ),
      };
    }

    return useFetch(computedUrl, fetchOptions, options);
  }

  return useFactoryFetch as typeof useFetch;
}

export function useFetch<T>(
  url: MaybeReactive<string>,
): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
export function useFetch<T>(
  url: MaybeReactive<string>,
  useFetchOptions: UseFetchOptions,
): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
export function useFetch<T>(
  url: MaybeReactive<string>,
  options: RequestInit,
  useFetchOptions?: UseFetchOptions,
): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;

export function useFetch<T>(
  url: MaybeReactive<string>,
  ...args: any[]
): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>> {
  const supportsAbort = typeof AbortController === "function";

  let fetchOptions: RequestInit = {};
  let options: UseFetchOptions = {
    immediate: true,
    refetch: false,
    timeout: 0,
    updateDataOnError: false,
  };

  const config = {
    method: "GET" as HttpMethod,
    type: "text" as DataType,
    payload: undefined as unknown,
    payloadType: undefined as string | undefined,
  };

  if (args.length > 0) {
    if (isFetchOptions(args[0])) options = { ...options, ...args[0] };
    else fetchOptions = args[0];
  }

  if (args.length > 1 && isFetchOptions(args[1]))
    options = { ...options, ...args[1] };

  function getClientFetchCache(): Map<string, any> | undefined {
    if (typeof window === "undefined") return undefined;
    const sinwanData = getSinwanData();
    if (!sinwanData?.fetchData) return undefined;
    return new Map(Object.entries(sinwanData.fetchData));
  }

  function consumeClientCachedData(key: string): any {
    const cache = getClientFetchCache();
    if (!cache) return undefined;
    const value = cache.get(key);
    if (value !== undefined) {
      cache.delete(key);
      const script = document.getElementById("__SINWAN_DATA__");
      if (script) {
        try {
          const sinwanData = JSON.parse(script.textContent || "{}");
          if (sinwanData.fetchData && key in sinwanData.fetchData) {
            delete sinwanData.fetchData[key];
            script.textContent = JSON.stringify(sinwanData);
          }
        } catch {
          /* ignore */
        }
      }
    }
    return value;
  }

  const fetchFn = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const responseEvent = createEventHook<Response>();
  const errorEvent = createEventHook<any>();
  const finallyEvent = createEventHook<any>();
  const isLoading = signal(false);
  const isFinished = computed(() => !isLoading.value);
  const isFetching = computed(() => isLoading.value);
  const aborted = signal(false);
  const statusCode = signal<number | null>(null);
  const response = signal<Response | null>(null);
  const error = signal<any>(null);
  const data = signal<T | null>(options.initialData ?? null);
  const canAbort = computed(() => supportsAbort && isFetching.value);

  let controller: AbortController | undefined;
  let timer: Stoppable | undefined;

  const abort = (reason?: any) => {
    if (supportsAbort) {
      controller?.abort(reason);
      controller = new AbortController();
      controller.signal.onabort = () => (aborted.value = true);
      fetchOptions = {
        ...fetchOptions,
        signal: controller.signal,
      };
    }
  };

  if (options.timeout) timer = useTimeoutFn(abort, options.timeout);

  let executeCounter = 0;

  let hasConsumedCache = false;

  function getCacheKey(resolvedUrl: string): string {
    return `${config.method}:${resolvedUrl}`;
  }

  function applyCached(cached: any): null {
    hasConsumedCache = true;
    data.value = cached.data ?? null;
    statusCode.value = cached.statusCode ?? null;
    error.value = cached.error ?? null;
    isLoading.value = false;
    return null;
  }

  const execute = async (throwOnFailed = false) => {
    let resolvedUrl = resolve(url);
    const ssrCtx = getSSRContext();
    if (ssrCtx?.baseUrl && !isAbsoluteURL(resolvedUrl)) {
      resolvedUrl = joinPaths(ssrCtx.baseUrl, resolvedUrl);
    }
    const cacheKey = getCacheKey(resolve(url));

    if (!hasConsumedCache) {
      // Client hydration cache
      if (typeof window !== "undefined") {
        const cached = consumeClientCachedData(cacheKey);
        if (cached) return applyCached(cached);
      }
      // SSR cache
      const ssrCtx = getSSRContext();
      if (ssrCtx?.fetchCache?.has(cacheKey)) {
        return applyCached(ssrCtx.fetchCache.get(cacheKey));
      }
    }

    abort();
    isLoading.value = true;
    error.value = null;
    statusCode.value = null;
    aborted.value = false;

    executeCounter += 1;
    const currentExecuteCounter = executeCounter;
    const defaultFetchOptions: RequestInit = {
      method: config.method,
      headers: {},
    };

    const payload = resolve(config.payload as any);
    if (payload) {
      const headers = headersToObject(defaultFetchOptions.headers) as Record<
        string,
        string
      >;
      const proto = Object.getPrototypeOf(payload);
      if (
        !config.payloadType &&
        payload &&
        (proto === Object.prototype || Array.isArray(payload)) &&
        !(payload instanceof FormData)
      )
        config.payloadType = "json";
      if (config.payloadType)
        headers["Content-Type"] =
          payloadMapping[config.payloadType] ?? config.payloadType;
      defaultFetchOptions.body =
        config.payloadType === "json"
          ? JSON.stringify(payload)
          : (payload as BodyInit);
    }

    let isCanceled = false;
    const context: BeforeFetchContext = {
      url: resolvedUrl,
      options: {
        ...defaultFetchOptions,
        ...fetchOptions,
      },
      cancel: () => {
        isCanceled = true;
      },
    };

    if (options.beforeFetch)
      Object.assign(context, await options.beforeFetch(context));

    if (isCanceled || !fetchFn) {
      isLoading.value = false;
      return Promise.resolve(null);
    }

    let responseData: any = null;

    if (timer) timer.start();

    return fetchFn(context.url, {
      ...defaultFetchOptions,
      ...context.options,
      headers: {
        ...headersToObject(defaultFetchOptions.headers),
        ...headersToObject(context.options?.headers),
      },
    })
      .then(async (fetchResponse) => {
        response.value = fetchResponse;
        statusCode.value = fetchResponse.status;
        responseData = await fetchResponse.clone()[config.type]();
        if (!fetchResponse.ok) {
          data.value = options.initialData ?? null;
          throw new Error(fetchResponse.statusText);
        }
        if (options.afterFetch) {
          ({ data: responseData } = await options.afterFetch({
            data: responseData,
            response: fetchResponse,
            context,
            execute,
          }));
        }
        data.value = responseData;
        responseEvent.trigger(fetchResponse);

        // Cache for SSR hydration
        const ssrCtx = getSSRContext();
        if (ssrCtx?.fetchCache) {
          ssrCtx.fetchCache.set(cacheKey, {
            data: responseData,
            statusCode: fetchResponse.status,
            error: null,
          });
        }

        return fetchResponse;
      })
      .catch(async (fetchError) => {
        let errorData = fetchError.message || fetchError.name;
        if (options.onFetchError) {
          ({ error: errorData, data: responseData } =
            await options.onFetchError({
              data: responseData,
              error: fetchError,
              response: response.value,
              context,
              execute,
            }));
        }
        error.value = errorData;
        if (options.updateDataOnError) data.value = responseData;
        errorEvent.trigger(fetchError);

        // Cache error for SSR
        const ssrCtx = getSSRContext();
        if (ssrCtx?.fetchCache) {
          ssrCtx.fetchCache.set(cacheKey, {
            data: options.updateDataOnError ? responseData : null,
            statusCode: response.value?.status ?? null,
            error: errorData,
          });
        }

        if (throwOnFailed) throw fetchError;
        return null;
      })
      .finally(() => {
        if (currentExecuteCounter === executeCounter) isLoading.value = false;
        if (timer) timer.stop();
        finallyEvent.trigger(null);
      });
  };

  const refetch = () => resolve(options.refetch);
  let hasTrackedRefetchDeps = false;
  effect(() => {
    const shouldRefetch = refetch();
    resolve(url);
    if (!hasTrackedRefetchDeps) {
      hasTrackedRefetchDeps = true;
      return;
    }
    if (shouldRefetch) execute();
  });

  const shell: UseFetchReturn<T> = {
    isFinished,
    isFetching,
    statusCode,
    response,
    error,
    data,
    canAbort,
    aborted,
    abort,
    execute,
    onFetchResponse: responseEvent.on,
    onFetchError: errorEvent.on,
    onFetchFinally: finallyEvent.on,
    get: setMethod("GET"),
    put: setMethod("PUT"),
    post: setMethod("POST"),
    delete: setMethod("DELETE"),
    patch: setMethod("PATCH"),
    head: setMethod("HEAD"),
    options: setMethod("OPTIONS"),
    json: setType("json"),
    text: setType("text"),
    blob: setType("blob"),
    arrayBuffer: setType("arrayBuffer"),
    formData: setType("formData"),
  };

  function setMethod(method: HttpMethod) {
    return (payload?: unknown, payloadType?: string) => {
      if (!isFetching.value) {
        config.method = method;
        config.payload = payload;
        config.payloadType = payloadType;
        if (isSignal(config.payload)) {
          let hasTrackedPayloadDeps = false;
          effect(() => {
            const shouldRefetch = refetch();
            resolve(config.payload as any);
            if (!hasTrackedPayloadDeps) {
              hasTrackedPayloadDeps = true;
              return;
            }
            if (shouldRefetch) execute();
          });
        }
      }
      return promiseShell(shell);
    };
  }

  function waitUntilFinished() {
    return new Promise<UseFetchReturn<T>>((resolvePromise) => {
      if (isFinished.value) {
        resolvePromise(shell);
        return;
      }
      const dispose = effect(() => {
        if (isFinished.value) {
          dispose();
          resolvePromise(shell);
        }
      });
    });
  }

  function setType(type: DataType) {
    return (() => {
      config.type = type;
      return promiseShell(shell as any);
    }) as any;
  }

  function promiseShell<R>(target: UseFetchReturn<R>) {
    return {
      ...target,
      then(onFulfilled: any, onRejected: any) {
        return waitUntilFinished().then(onFulfilled, onRejected);
      },
    } as UseFetchReturn<R> & PromiseLike<UseFetchReturn<R>>;
  }

  if (options.immediate) {
    if (typeof window === "undefined") {
      // On server, execute and register promise for two-pass SSR rendering
      const promise = execute();
      const ssrCtx = getSSRContext();
      if (ssrCtx?.pendingFetches) {
        ssrCtx.pendingFetches.add(promise);
      }
    } else {
      // Check hydration cache synchronously so async components that
      // await useFetch resolve with data already populated.
      const resolvedUrl = resolve(url);
      const cacheKey = getCacheKey(resolvedUrl);
      const cached = consumeClientCachedData(cacheKey);
      if (cached) {
        applyCached(cached);
      } else {
        Promise.resolve().then(() => execute());
      }
    }
  }

  return promiseShell(shell);
}

function joinPaths(start: string, end: string): string {
  if (!start.endsWith("/") && !end.startsWith("/")) return `${start}/${end}`;
  if (start.endsWith("/") && end.startsWith("/"))
    return `${start.slice(0, -1)}${end}`;
  return `${start}${end}`;
}
