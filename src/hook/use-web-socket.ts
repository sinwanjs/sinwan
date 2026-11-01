/**
 * SinwanJS Hooks — useWebSocket
 *
 * Reactive WebSocket client: connection status, last message, buffered
 * sends, auto-reconnect with backoff, heartbeat, a reactive URL, file
 * transfer, and cleanup when the calling component unmounts.
 */

import { computed, effect, resolve, signal, untrack, type Computed, type Signal } from "../reactivity/index.ts";
import { createEventHook, isClient, tryOnUnmounted, type EventHookOn, type Fn } from "./shared.ts";
import {
  createFileTransfers,
  type FileMeta,
  type FileTransfer,
  type FileTransferOptions,
} from "./transfer.ts";
import type { MaybeReactive } from "./use-fetch.ts";

export type WebSocketStatus = "CONNECTING" | "OPEN" | "CLOSING" | "CLOSED";
export type WebSocketMessage = string | Blob | BufferSource;

export interface WebSocketReconnectOptions {
  /** Attempts before giving up, or a predicate on the attempt number (1-based). Default: unlimited. */
  retries?: number | ((attempt: number) => boolean);
  /** Wait before attempt `attempt` (1-based), in ms. Default: 1 s doubling up to 30 s. */
  delay?: number | ((attempt: number) => number);
  /** Called once retries are exhausted. */
  onFailed?: Fn;
}

export interface WebSocketHeartbeatOptions {
  /** What to send. Default `"ping"`. */
  message?: WebSocketMessage | (() => WebSocketMessage);
  /** Every this many ms while open. Default 30 000. */
  interval?: number;
  /** Close (and reconnect) when nothing arrives within this many ms of a ping. Default 10 000. */
  pongTimeout?: number;
  /** A message equal to this is a pong: it is not delivered as data. */
  responseMessage?: string;
}

export interface UseWebSocketOptions<T> {
  protocols?: string | string[];
  /** Connect at once (in the browser). Default `true`. */
  immediate?: boolean;
  /** Close when the calling component unmounts. Default `true`. */
  autoClose?: boolean;
  /** Reconnect after an unexpected close. Default `false`. */
  autoReconnect?: boolean | WebSocketReconnectOptions;
  heartbeat?: boolean | WebSocketHeartbeatOptions;
  /** Binary message format. Default `"arraybuffer"`. */
  binaryType?: BinaryType;
  /** Turns each received message into `data` (validate untrusted input here). Default: the raw message. */
  parse?: (message: string | ArrayBuffer | Blob) => T;
  /** Messages sent while not open are queued and flushed on open, up to this many. Default 100; 0 disables. */
  bufferLimit?: number;
  /** File transfer settings, or `false` to treat every message as data. */
  files?: FileTransferOptions | false;
  /** A different `WebSocket` constructor (tests, polyfills). */
  WebSocket?: typeof WebSocket;
  onConnected?: (ws: WebSocket) => void;
  onDisconnected?: (ws: WebSocket, event: CloseEvent) => void;
  onError?: (ws: WebSocket, event: Event) => void;
  onMessage?: (ws: WebSocket, event: MessageEvent) => void;
}

export interface UseWebSocketReturn<T> {
  status: Signal<WebSocketStatus>;
  isOpen: Computed<boolean>;
  /** The last message (after `parse`). File frames never land here. */
  data: Signal<T | null>;
  /** The last socket error event, or what `parse` threw (cleared on a successful open). */
  error: Signal<unknown>;
  /** The underlying socket while one exists. */
  ws: Signal<WebSocket | null>;
  /** Reconnect attempts since the last successful open. */
  retries: Signal<number>;
  /** Sends at once when open, else queues it (unless `buffer` is false). `false` when dropped. */
  send(message: WebSocketMessage, buffer?: boolean): boolean;
  /** `send(JSON.stringify(value))`. */
  sendJson(value: unknown, buffer?: boolean): boolean;
  /** Connects (or reconnects) and re-enables auto-reconnect. */
  open(): void;
  /** Closes and stops reconnecting until `open()`. */
  close(code?: number, reason?: string): void;
  /** Sends a file in chunks (needs an open socket); progress in `transfers`. */
  sendFile(blob: Blob, meta?: FileMeta): Promise<FileTransfer>;
  transfers: Signal<FileTransfer[]>;
  cancelTransfer(id: string): void;
  clearTransfers(): void;
  onOpen: EventHookOn<Event>;
  onMessage: EventHookOn<T>;
  onClose: EventHookOn<CloseEvent>;
  onError: EventHookOn<Event>;
  /** A file from the other side is complete. */
  onFile: EventHookOn<FileTransfer>;
}

const READY_STATE: Record<number, WebSocketStatus> = { 0: "CONNECTING", 1: "OPEN", 2: "CLOSING", 3: "CLOSED" };
const BACKPRESSURE_LIMIT = 1024 * 1024;

function reconnectOptions(value: UseWebSocketOptions<unknown>["autoReconnect"]): WebSocketReconnectOptions | null {
  if (!value) return null;
  return value === true ? {} : value;
}

interface HeartbeatSettings {
  message: WebSocketMessage | (() => WebSocketMessage);
  interval: number;
  pongTimeout: number;
  responseMessage?: string;
}

function heartbeatOptions(value: UseWebSocketOptions<unknown>["heartbeat"]): HeartbeatSettings | null {
  if (!value) return null;
  const options = value === true ? {} : value;
  return {
    message: options.message ?? "ping",
    interval: options.interval ?? 30_000,
    pongTimeout: options.pongTimeout ?? 10_000,
    responseMessage: options.responseMessage,
  };
}

/** 1 s, 2 s, 4 s… up to 30 s. */
export function defaultReconnectDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
}

export function useWebSocket<T = string | ArrayBuffer | Blob>(
  url: MaybeReactive<string | URL>,
  options: UseWebSocketOptions<T> = {},
): UseWebSocketReturn<T> {
  const Socket = options.WebSocket ?? (typeof WebSocket === "undefined" ? undefined : WebSocket);
  const bufferLimit = options.bufferLimit ?? 100;
  const reconnect = reconnectOptions(options.autoReconnect);
  const heartbeat = heartbeatOptions(options.heartbeat);
  const parse = options.parse ?? ((message: string | ArrayBuffer | Blob) => message as T);

  const status = signal<WebSocketStatus>("CLOSED");
  const isOpen = computed(() => status.value === "OPEN");
  const data = signal<T | null>(null);
  const error = signal<unknown>(null);
  const ws = signal<WebSocket | null>(null);
  const retries = signal(0);
  const openEvent = createEventHook<Event>();
  const messageEvent = createEventHook<T>();
  const closeEvent = createEventHook<CloseEvent>();
  const errorEvent = createEventHook<Event>();

  const queue: WebSocketMessage[] = [];
  let explicitlyClosed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  // Blob messages are read asynchronously; later messages wait so order is kept.
  let inbound: Promise<void> | null = null;

  const files =
    options.files === false
      ? null
      : createFileTransfers(
          {
            send: (frame) => {
              const socket = ws.value;
              if (!socket || socket.readyState !== 1) throw new Error("WebSocket is not open");
              socket.send(frame);
            },
            // Waits while the socket's send buffer is full, so big files do not pile up in memory.
            ready: () =>
              new Promise<void>((resolveReady, rejectReady) => {
                const check = () => {
                  const socket = ws.value;
                  if (!socket || socket.readyState !== 1) rejectReady(new Error("WebSocket is not open"));
                  else if (socket.bufferedAmount < BACKPRESSURE_LIMIT) resolveReady();
                  else setTimeout(check, 20);
                };
                check();
              }),
          },
          options.files,
        );

  const stopHeartbeat = () => {
    clearInterval(heartbeatTimer);
    clearTimeout(pongTimer);
    heartbeatTimer = undefined;
    pongTimer = undefined;
  };

  const startHeartbeat = () => {
    if (!heartbeat) return;
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      const message = typeof heartbeat.message === "function" ? heartbeat.message() : heartbeat.message;
      send(message, false);
      if (pongTimer !== undefined) return;
      pongTimer = setTimeout(() => {
        // No answer: the connection is dead even if the socket says open.
        ws.value?.close();
      }, heartbeat.pongTimeout);
    }, heartbeat.interval);
  };

  /** `frame` is what the file protocol inspects (a Blob's bytes); the app gets `message` as received. */
  const deliver = (message: string | ArrayBuffer | Blob, frame: unknown = message) => {
    if (files && files.accept(frame)) return;
    if (heartbeat?.responseMessage !== undefined && message === heartbeat.responseMessage) return;
    let value: T;
    try {
      value = parse(message);
    } catch (reason) {
      // A message `parse` rejects is skipped; the error is kept for the app.
      error.value = reason;
      return;
    }
    data.value = value;
    messageEvent.trigger(value);
  };

  const receive = (message: string | ArrayBuffer | Blob) => {
    clearTimeout(pongTimer);
    pongTimer = undefined;
    if (inbound === null && !(message instanceof Blob && files)) {
      deliver(message);
      return;
    }
    const previous = inbound ?? Promise.resolve();
    const current = previous
      .then(async () => {
        // Read Blobs as bytes, so file chunks are recognised whatever binaryType is.
        deliver(message, message instanceof Blob ? await message.arrayBuffer() : message);
      })
      .catch((reason: unknown) => {
        // Keep the queue going; the error is kept for the app.
        error.value = reason;
      })
      .finally(() => {
        if (inbound === current) inbound = null;
      });
    inbound = current;
  };

  const flush = () => {
    const socket = ws.value;
    while (socket && socket.readyState === 1 && queue.length > 0) {
      const next = queue.shift();
      if (next !== undefined) socket.send(next);
    }
  };

  const scheduleReconnect = () => {
    if (!reconnect || explicitlyClosed) return;
    const attempt = retries.value + 1;
    const allowed =
      reconnect.retries === undefined
        ? true
        : typeof reconnect.retries === "function"
          ? reconnect.retries(attempt)
          : attempt <= reconnect.retries;
    if (!allowed) {
      reconnect.onFailed?.();
      return;
    }
    retries.value = attempt;
    const wait = typeof reconnect.delay === "function" ? reconnect.delay(attempt) : (reconnect.delay ?? defaultReconnectDelay(attempt));
    reconnectTimer = setTimeout(connect, wait);
  };

  const teardown = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    stopHeartbeat();
    const socket = ws.value;
    ws.value = null;
    if (socket && socket.readyState < 2) socket.close();
  };

  function connect(): void {
    if (!Socket || !isClient()) return;
    teardown();
    const socket = new Socket(resolve(url), options.protocols);
    socket.binaryType = options.binaryType ?? "arraybuffer";
    ws.value = socket;
    status.value = "CONNECTING";

    socket.onopen = (event) => {
      if (ws.value !== socket) return;
      status.value = "OPEN";
      error.value = null;
      retries.value = 0;
      options.onConnected?.(socket);
      openEvent.trigger(event);
      flush();
      startHeartbeat();
    };
    socket.onmessage = (event: MessageEvent) => {
      if (ws.value !== socket) return;
      options.onMessage?.(socket, event);
      receive(event.data);
    };
    socket.onerror = (event) => {
      if (ws.value !== socket) return;
      error.value = event;
      options.onError?.(socket, event);
      errorEvent.trigger(event);
    };
    socket.onclose = (event) => {
      if (ws.value !== socket) return;
      ws.value = null;
      status.value = "CLOSED";
      stopHeartbeat();
      files?.failPending("Connection closed");
      options.onDisconnected?.(socket, event);
      closeEvent.trigger(event);
      scheduleReconnect();
    };
  }

  function send(message: WebSocketMessage, buffer = true): boolean {
    const socket = ws.value;
    if (socket && socket.readyState === 1) {
      flush();
      socket.send(message);
      return true;
    }
    if (!buffer || queue.length >= bufferLimit) return false;
    queue.push(message);
    return true;
  }

  const open = () => {
    explicitlyClosed = false;
    retries.value = 0;
    connect();
  };

  const close = (code = 1000, reason?: string) => {
    explicitlyClosed = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    stopHeartbeat();
    const socket = ws.value;
    if (!socket) return;
    if (socket.readyState < 2) {
      status.value = "CLOSING";
      socket.close(code, reason);
    }
  };

  // A new URL means a new connection, when one is wanted.
  let urlTracked = false;
  effect(() => {
    resolve(url);
    if (!urlTracked) {
      urlTracked = true;
      return;
    }
    // Only the URL is tracked: `connect()` reads and writes `ws`, which must not re-run this.
    untrack(() => {
      if (!explicitlyClosed && ws.value !== null) connect();
    });
  });

  if (options.immediate ?? true) open();
  if (options.autoClose ?? true) tryOnUnmounted(() => close());

  return {
    status,
    isOpen,
    data,
    error,
    ws,
    retries,
    send,
    sendJson: (value, buffer) => send(JSON.stringify(value), buffer),
    open,
    close,
    sendFile: (blob, meta) => {
      if (!files) return Promise.reject(new Error("File transfer is disabled (files: false)"));
      return files.send(blob, meta);
    },
    transfers: files?.transfers ?? signal<FileTransfer[]>([]),
    cancelTransfer: (id) => files?.cancel(id),
    clearTransfers: () => files?.clear(),
    onOpen: openEvent.on,
    onMessage: messageEvent.on,
    onClose: closeEvent.on,
    onError: errorEvent.on,
    onFile: files?.onFile ?? createEventHook<FileTransfer>().on,
  };
}
