import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { cc } from "../src/component/create.ts";
import { defaultReconnectDelay, useWebSocket } from "../src/hook/use-web-socket.ts";
import { encodeChunk, encodeControl } from "../src/hook/transfer.ts";
import { signal } from "../src/reactivity/signal.ts";
import { mount } from "../src/renderer/mount.ts";
import { FakeWebSocket, asWebSocket, resetFakes, settle } from "./support/realtime-fakes.ts";

const Socket = asWebSocket(FakeWebSocket);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  resetFakes();
  Object.assign(globalThis, { window: globalThis });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("useWebSocket", () => {
  it("connects at once, reports status, delivers messages and calls every hook", async () => {
    const calls: string[] = [];
    const socket = useWebSocket("ws://test/chat", {
      WebSocket: Socket,
      protocols: ["v1"],
      onConnected: () => calls.push("connected"),
      onMessage: () => calls.push("message option"),
      onError: () => calls.push("error option"),
      onDisconnected: () => calls.push("disconnected"),
    });
    const fake = FakeWebSocket.last();
    expect(fake.url).toBe("ws://test/chat");
    expect(fake.protocols).toEqual(["v1"]);
    expect(fake.binaryType).toBe("arraybuffer");
    expect(socket.status.value).toBe("CONNECTING");
    expect(socket.ws.value).not.toBeNull();

    const messages: unknown[] = [];
    socket.onOpen(() => calls.push("open hook"));
    socket.onMessage((value) => messages.push(value));
    socket.onError(() => calls.push("error hook"));
    socket.onClose(() => calls.push("close hook"));

    fake.open();
    expect(socket.status.value).toBe("OPEN");
    expect(socket.isOpen.value).toBe(true);

    fake.receive("hi");
    const bytes = new Uint8Array([1, 2]).buffer;
    fake.receive(bytes);
    expect(socket.data.value).toBe(bytes);
    expect(messages).toEqual(["hi", bytes]);

    fake.fail();
    expect(socket.error.value).toBeInstanceOf(Event);

    fake.closed();
    expect(socket.status.value).toBe("CLOSED");
    expect(socket.ws.value).toBeNull();
    expect(calls).toEqual([
      "connected",
      "open hook",
      "message option",
      "message option",
      "error option",
      "error hook",
      "disconnected",
      "close hook",
    ]);
  });

  it("parses messages with the parse option", () => {
    const socket = useWebSocket<{ n: number }>("ws://test", {
      WebSocket: Socket,
      parse: (message) => JSON.parse(String(message)),
    });
    FakeWebSocket.last().open();
    FakeWebSocket.last().receive('{"n":1}');
    expect(socket.data.value).toEqual({ n: 1 });
  });

  it("queues sends until open (up to bufferLimit), sends at once when open, and sendJson stringifies", () => {
    const socket = useWebSocket("ws://test", { WebSocket: Socket, bufferLimit: 2 });
    expect(socket.send("one")).toBe(true);
    expect(socket.sendJson({ two: 2 })).toBe(true);
    expect(socket.send("three")).toBe(false);
    expect(socket.send("not buffered", false)).toBe(false);
    const fake = FakeWebSocket.last();
    fake.open();
    expect(fake.sent).toEqual(["one", '{"two":2}']);
    expect(socket.send("now")).toBe(true);
    expect(fake.sent.at(-1)).toBe("now");

    const noBuffer = useWebSocket("ws://test", { WebSocket: Socket, bufferLimit: 0 });
    expect(noBuffer.send("x")).toBe(false);
  });

  it("close() stops reconnecting until open(), and does nothing without a socket", async () => {
    const socket = useWebSocket("ws://test", { WebSocket: Socket, autoReconnect: { delay: 1 } });
    const fake = FakeWebSocket.last();
    fake.open();
    socket.close(4000, "bye");
    expect(socket.status.value).toBe("CLOSING");
    expect(fake.closeCalls).toEqual([[4000, "bye"]]);
    fake.closed(4000);
    await wait(10);
    expect(FakeWebSocket.instances).toHaveLength(1);
    // Already closing: no second close() on the socket.
    socket.close();
    socket.open();
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.last().readyState = 2;
    socket.close();
    expect(FakeWebSocket.last().closeCalls).toEqual([]);

    const idle = useWebSocket("ws://test", { WebSocket: Socket, immediate: false });
    idle.close();
    expect(idle.status.value).toBe("CLOSED");
  });

  it("reconnects after an unexpected close with backoff, counts retries and gives up", async () => {
    let failed = 0;
    const socket = useWebSocket("ws://test", {
      WebSocket: Socket,
      autoReconnect: { retries: 2, delay: 1, onFailed: () => (failed += 1) },
    });
    FakeWebSocket.last().closed();
    await wait(10);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(socket.retries.value).toBe(1);
    FakeWebSocket.last().closed();
    await wait(10);
    expect(socket.retries.value).toBe(2);
    FakeWebSocket.last().closed();
    await wait(10);
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(failed).toBe(1);

    // A successful open resets the count.
    socket.open();
    FakeWebSocket.last().open();
    expect(socket.retries.value).toBe(0);
  });

  it("supports predicate retries, delay functions and the default backoff", async () => {
    const delays: number[] = [];
    useWebSocket("ws://test", {
      WebSocket: Socket,
      autoReconnect: { retries: (attempt) => attempt < 2, delay: (attempt) => (delays.push(attempt), 1) },
    });
    FakeWebSocket.last().closed();
    await wait(10);
    FakeWebSocket.last().closed();
    await wait(10);
    expect(delays).toEqual([1]);
    expect(FakeWebSocket.instances).toHaveLength(2);

    useWebSocket("ws://test", { WebSocket: Socket, autoReconnect: true });
    const before = FakeWebSocket.instances.length;
    FakeWebSocket.last().closed();
    expect(FakeWebSocket.instances).toHaveLength(before);

    expect([1, 2, 3, 6, 10].map(defaultReconnectDelay)).toEqual([1000, 2000, 4000, 30000, 30000]);
    expect(defaultReconnectDelay(0)).toBe(1000);
  });

  it("reconnects to a new URL when the reactive URL changes, and ignores the old socket", async () => {
    const url = signal("ws://test/one");
    const socket = useWebSocket(url, { WebSocket: Socket });
    const first = FakeWebSocket.last();
    first.open();
    url.value = "ws://test/two";
    await settle();
    const second = FakeWebSocket.last();
    expect(second.url).toBe("ws://test/two");
    expect(first.closeCalls).toEqual([[undefined, undefined]]);

    // Events from the replaced socket change nothing.
    first.open();
    first.receive("stale");
    first.fail();
    first.closed();
    expect(socket.status.value).toBe("CONNECTING");
    expect(socket.data.value).toBeNull();
    expect(socket.error.value).toBeNull();

    // Explicitly closed: a URL change does not reconnect.
    socket.close();
    url.value = "ws://test/three";
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);

    // Never connected: a URL change does not connect either.
    const lazyUrl = signal("ws://lazy/one");
    useWebSocket(lazyUrl, { WebSocket: Socket, immediate: false });
    lazyUrl.value = "ws://lazy/two";
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("sends heartbeats, swallows pongs, and closes a socket that stops answering", async () => {
    const socket = useWebSocket("ws://test", {
      WebSocket: Socket,
      heartbeat: { message: () => "ping!", interval: 10, pongTimeout: 15, responseMessage: "pong" },
    });
    const fake = FakeWebSocket.last();
    fake.open();
    await wait(14);
    expect(fake.sent).toContain("ping!");
    fake.receive("pong");
    expect(socket.data.value).toBeNull();
    await wait(60);
    expect(fake.closeCalls.length).toBeGreaterThan(0);
    fake.closed();

    const defaults = useWebSocket("ws://test", { WebSocket: Socket, heartbeat: true });
    FakeWebSocket.last().open();
    defaults.close();
    expect(defaults.status.value).toBe("CLOSING");
  });

  it("does not connect during server rendering or without a WebSocket implementation", () => {
    Reflect.deleteProperty(globalThis, "window");
    const ssr = useWebSocket("ws://test", { WebSocket: Socket });
    expect(ssr.status.value).toBe("CLOSED");
    expect(FakeWebSocket.instances).toHaveLength(0);

    Object.assign(globalThis, { window: globalThis });
    const original = globalThis.WebSocket;
    Reflect.deleteProperty(globalThis, "WebSocket");
    try {
      const none = useWebSocket("ws://test");
      expect(none.status.value).toBe("CLOSED");
    } finally {
      Object.assign(globalThis, { WebSocket: original });
    }
    // The global WebSocket is the default constructor.
    const real = useWebSocket("ws://127.0.0.1:9/never", { immediate: false });
    expect(real.ws.value).toBeNull();
  });

  it("transfers files over the socket and keeps file frames out of data", async () => {
    const socket = useWebSocket("ws://test", { WebSocket: Socket, files: { chunkSize: 2 } });
    const fake = FakeWebSocket.last();
    fake.open();
    const sent = await socket.sendFile(new Blob(["abc"]), { name: "a.txt", type: "text/plain" });
    expect(sent.status).toBe("done");
    expect(fake.sent.filter((frame) => frame instanceof ArrayBuffer)).toHaveLength(2);

    const files: unknown[] = [];
    socket.onFile((file) => files.push(file.name));
    fake.receive(encodeControl({ op: "start", id: "in", name: "b.txt", type: "text/plain", size: 1 }));
    fake.receive(encodeChunk("in", new Uint8Array([65])));
    fake.receive(encodeControl({ op: "end", id: "in" }));
    expect(files).toEqual(["b.txt"]);
    expect(socket.data.value).toBeNull();
    expect(socket.transfers.value.map((t) => t.status)).toEqual(["done", "done"]);
    socket.clearTransfers();
    expect(socket.transfers.value).toEqual([]);

    // Blob frames (binaryType "blob") are read in order, chunks recognised, other blobs delivered as received.
    const order: unknown[] = [];
    socket.onMessage((value) => order.push(value));
    fake.receive(encodeControl({ op: "start", id: "blob", name: "c.txt", type: "", size: 1 }));
    fake.receive(new Blob([encodeChunk("blob", new Uint8Array([66]))]));
    const plain = new Blob(["raw"]);
    fake.receive(plain);
    fake.receive("after");
    fake.receive(encodeControl({ op: "end", id: "blob" }));
    await settle();
    expect(order).toEqual([plain, "after"]);
    expect(files).toEqual(["b.txt", "c.txt"]);

    socket.cancelTransfer("none");
  });

  it("waits for the send buffer to drain, and fails transfers when the socket is not open or closes", async () => {
    const socket = useWebSocket("ws://test", { WebSocket: Socket });
    const notOpen = await socket.sendFile(new Blob(["x"]));
    expect(notOpen).toMatchObject({ status: "failed", error: "WebSocket is not open" });

    const fake = FakeWebSocket.last();
    fake.open();
    fake.bufferedAmount = 2 * 1024 * 1024;
    const pending = socket.sendFile(new Blob(["slow"]));
    await wait(30);
    expect(fake.sent.filter((frame) => frame instanceof ArrayBuffer)).toHaveLength(0);
    fake.bufferedAmount = 0;
    expect((await pending).status).toBe("done");

    fake.bufferedAmount = 2 * 1024 * 1024;
    const stuck = socket.sendFile(new Blob(["stuck"]));
    await wait(5);
    fake.readyState = 3;
    expect(await stuck).toMatchObject({ status: "failed" });

    // A transfer in flight fails when the socket closes.
    const receiving = useWebSocket("ws://test", { WebSocket: Socket });
    const other = FakeWebSocket.last();
    other.open();
    other.receive(encodeControl({ op: "start", id: "in", name: "a", type: "", size: 10 }));
    other.closed();
    expect(receiving.transfers.value[0]).toMatchObject({ status: "failed", error: "Connection closed" });
  });

  it("with files: false every message is data and sendFile rejects", async () => {
    const socket = useWebSocket("ws://test", { WebSocket: Socket, files: false, binaryType: "blob" });
    const fake = FakeWebSocket.last();
    expect(fake.binaryType).toBe("blob");
    fake.open();
    const frame = encodeControl({ op: "end", id: "x" });
    fake.receive(frame);
    const blob = new Blob(["b"]);
    fake.receive(blob);
    expect(socket.data.value).toBe(blob);
    await expect(socket.sendFile(new Blob(["x"]))).rejects.toThrow("File transfer is disabled");
    expect(socket.transfers.value).toEqual([]);
    socket.cancelTransfer("x");
    socket.clearTransfers();
    let fired = false;
    socket.onFile(() => (fired = true));
    expect(fired).toBe(false);
  });

  it("skips a message parse rejects, keeps the error, and keeps delivering (queued or not)", async () => {
    const socket = useWebSocket<string>("ws://test", {
      WebSocket: Socket,
      binaryType: "blob",
      parse: (message) => {
        if (message === "bad") throw new Error("bad message");
        return String(message);
      },
    });
    const fake = FakeWebSocket.last();
    fake.open();
    fake.receive("bad");
    expect(socket.error.value).toEqual(new Error("bad message"));
    fake.receive(new Blob(["first"]));
    fake.receive("bad");
    fake.receive("good");
    await settle();
    expect(socket.data.value).toBe("good");

    // A Blob that cannot be read keeps the error too, and later messages still arrive.
    const unreadable = new Blob(["x"]);
    Object.defineProperty(unreadable, "arrayBuffer", { value: () => Promise.reject(new Error("unreadable")) });
    fake.receive(unreadable);
    fake.receive("later");
    await settle();
    expect(socket.error.value).toEqual(new Error("unreadable"));
    expect(socket.data.value).toBe("later");
  });

  it("closes when its component unmounts, unless autoClose is false", () => {
    const win = new Window({ url: "http://localhost" });
    const doc = win.document as unknown as Document;
    Object.assign(globalThis, { document: doc, window: win });
    const container = doc.createElement("div");
    const Chat = cc(() => {
      useWebSocket("ws://test/a", { WebSocket: Socket });
      useWebSocket("ws://test/b", { WebSocket: Socket, autoClose: false });
      return null;
    });
    const app = mount(Chat, container as unknown as Element);
    const [a, b] = FakeWebSocket.instances;
    a?.open();
    b?.open();
    app.unmount();
    expect(a?.closeCalls).toEqual([[1000, undefined]]);
    expect(b?.closeCalls).toEqual([]);
    Reflect.deleteProperty(globalThis, "document");
  });
});
