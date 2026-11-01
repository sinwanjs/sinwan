import { describe, expect, it } from "bun:test";

import {
  createFileTransfers,
  decodeChunk,
  decodeControl,
  encodeChunk,
  encodeControl,
  transferId,
  type TransferChannel,
  type TransferFrame,
} from "../src/hook/transfer.ts";

/** Two transfer managers whose channels deliver to each other in order. */
function linked(options: { a?: Parameters<typeof createFileTransfers>[1]; b?: Parameters<typeof createFileTransfers>[1] } = {}) {
  const wire: { a: TransferFrame[]; b: TransferFrame[] } = { a: [], b: [] };
  let b: ReturnType<typeof createFileTransfers> | undefined;
  let a: ReturnType<typeof createFileTransfers> | undefined;
  const channel = (from: "a" | "b"): TransferChannel => ({
    send: (frame) => {
      wire[from].push(frame);
      const target = from === "a" ? b : a;
      queueMicrotask(() => target?.accept(frame));
    },
    ready: () => Promise.resolve(),
  });
  a = createFileTransfers(channel("a"), options.a);
  b = createFileTransfers(channel("b"), options.b);
  return { a, b, wire };
}

const tick = async () => {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
};

describe("frame encoding", () => {
  it("round-trips chunks and control frames", () => {
    const frame = encodeChunk("abc", new Uint8Array([1, 2, 3]));
    const chunk = decodeChunk(frame);
    expect(chunk?.id).toBe("abc");
    expect([...(chunk?.payload ?? [])]).toEqual([1, 2, 3]);
    expect(decodeControl(encodeControl({ op: "start", id: "x", name: "a.png", type: "image/png", size: 3 }))).toEqual({
      op: "start",
      id: "x",
      name: "a.png",
      type: "image/png",
      size: 3,
    });
    expect(decodeControl(encodeControl({ op: "end", id: "x" }))).toEqual({ op: "end", id: "x" });
    expect(decodeControl(encodeControl({ op: "abort", id: "x", reason: "Nope" }))).toEqual({
      op: "abort",
      id: "x",
      reason: "Nope",
    });
  });

  it("rejects anything that is not a well-formed frame", () => {
    expect(decodeChunk(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
    expect(decodeChunk(new Uint8Array([0x53, 0x57, 0x46, 0x31, 9, 1]).buffer)).toBeNull();
    for (const text of [
      "hello",
      '{"$sinwan": broken',
      '{"$sinwan":"other","id":"x","op":"end"}',
      '{"$sinwan":"file","op":"end"}',
      '{"$sinwan":"file","id":"x","op":"jump"}',
      '{"$sinwan":"file","id":"x","op":"start","name":1,"type":"","size":1}',
      '{"$sinwan":"file","id":"x","op":"start","name":"a","type":"","size":-1}',
      '{"$sinwan":"file","id":"x","op":"start","name":"a","type":"","size":1.5}',
      '{"$sinwan":null}',
    ]) {
      expect(decodeControl(text)).toBeNull();
    }
    expect(decodeControl('{"$sinwan":"file","id":"x","op":"abort","reason":7}')).toEqual({
      op: "abort",
      id: "x",
      reason: "Cancelled",
    });
  });

  it("makes 32-character hex ids", () => {
    expect(transferId()).toMatch(/^[0-9a-f]{32}$/);
    expect(transferId()).not.toBe(transferId());
  });
});

describe("createFileTransfers", () => {
  it("sends a file in chunks that the other side rebuilds, with progress on both sides", async () => {
    const { a, b } = linked({ a: { chunkSize: 4 } });
    const files: unknown[] = [];
    b.onFile((file) => files.push(file));
    const source = new File(["hello world!"], "note.txt", { type: "text/plain" });
    const sent = await a.send(source);
    await tick();
    expect(sent).toMatchObject({ direction: "send", status: "done", bytes: 12, name: "note.txt" });
    // Bun's File adds the charset to text types.
    expect(sent.type).toStartWith("text/plain");
    const [received] = b.transfers.value;
    expect(received).toMatchObject({ direction: "receive", status: "done", bytes: 12, size: 12, name: "note.txt" });
    expect(await received?.blob?.text()).toBe("hello world!");
    expect(received?.blob?.type).toBe(sent.type);
    expect(files).toHaveLength(1);
  });

  it("names plain blobs and respects meta overrides; an empty file needs no chunks", async () => {
    const { a, b } = linked();
    await a.send(new Blob([], { type: "application/x-empty" }));
    await a.send(new Blob(["x"]), { name: "renamed.bin", type: "application/octet-stream" });
    await tick();
    expect(b.transfers.value.map((t) => [t.name, t.type, t.status, t.size])).toEqual([
      ["file", "application/x-empty", "done", 0],
      ["renamed.bin", "application/octet-stream", "done", 1],
    ]);
  });

  it("refuses files over maxFileSize and more than maxIncoming at once, and tells the sender", async () => {
    const { a, b, wire } = linked({ b: { maxFileSize: 5, maxIncoming: 1 } });
    const tooBig = await a.send(new Blob(["0123456789"]));
    await tick();
    expect(tooBig.status).toBe("failed");
    expect(tooBig.error).toBe("File too large");
    expect(b.transfers.value).toEqual([]);
    expect(wire.b.some((frame) => typeof frame === "string" && frame.includes("File too large"))).toBe(true);

    // One transfer still in flight on b: the second start is refused.
    b.accept(encodeControl({ op: "start", id: "one", name: "a", type: "", size: 2 }));
    b.accept(encodeControl({ op: "start", id: "one", name: "a", type: "", size: 2 }));
    b.accept(encodeControl({ op: "start", id: "two", name: "b", type: "", size: 2 }));
    expect(wire.b.some((frame) => typeof frame === "string" && frame.includes("Too many transfers"))).toBe(true);
    expect(b.transfers.value.map((t) => t.id)).toEqual(["one"]);
  });

  it("fails an incoming file that is longer than announced or ends short, and ignores unknown ids", async () => {
    const { b, wire } = linked();
    b.accept(encodeControl({ op: "start", id: "long", name: "a", type: "", size: 2 }));
    expect(b.accept(encodeChunk("long", new Uint8Array([1, 2, 3])))).toBe(true);
    expect(b.transfers.value[0]).toMatchObject({ status: "failed", error: "File larger than announced" });
    expect(wire.b.some((frame) => typeof frame === "string" && frame.includes("larger than announced"))).toBe(true);

    b.accept(encodeControl({ op: "start", id: "short", name: "a", type: "", size: 4 }));
    b.accept(encodeChunk("short", new Uint8Array([1])));
    b.accept(encodeControl({ op: "end", id: "short" }));
    expect(b.transfers.value[1]).toMatchObject({ status: "failed", error: "Incomplete file" });

    expect(b.accept(encodeChunk("nobody", new Uint8Array([1])))).toBe(true);
    expect(b.accept(encodeControl({ op: "end", id: "nobody" }))).toBe(true);
    expect(b.accept(encodeControl({ op: "abort", id: "nobody", reason: "x" }))).toBe(true);
    expect(b.accept("plain text")).toBe(false);
    expect(b.accept(new Uint8Array([9, 9, 9]).buffer)).toBe(false);
    expect(b.accept(42)).toBe(false);
  });

  it("cancels in either direction, and the other side sees it", async () => {
    let release: () => void = () => {};
    const frames: TransferFrame[] = [];
    const sender = createFileTransfers(
      {
        send: (frame) => frames.push(frame),
        ready: () => new Promise<void>((resolve) => (release = resolve)),
      },
      { chunkSize: 1 },
    );
    const pending = sender.send(new Blob(["abc"]));
    await tick();
    const id = sender.transfers.value[0]?.id ?? "";
    sender.cancel(id);
    release();
    const result = await pending;
    expect(result).toMatchObject({ status: "cancelled", error: "Cancelled" });
    expect(frames.some((frame) => typeof frame === "string" && frame.includes('"op":"abort"'))).toBe(true);
    expect(frames.some((frame) => typeof frame === "string" && frame.includes('"op":"end"'))).toBe(false);

    const { b, wire } = linked();
    b.accept(encodeControl({ op: "start", id: "in", name: "a", type: "", size: 5 }));
    b.cancel("in");
    expect(b.transfers.value[0]).toMatchObject({ status: "cancelled" });
    expect(wire.b.some((frame) => typeof frame === "string" && frame.includes('"op":"abort"'))).toBe(true);
    b.cancel("unknown");

    // The peer aborts what we receive.
    b.accept(encodeControl({ op: "start", id: "in2", name: "a", type: "", size: 5 }));
    b.accept(encodeControl({ op: "abort", id: "in2", reason: "Sender gave up" }));
    expect(b.transfers.value[1]).toMatchObject({ status: "failed", error: "Sender gave up" });
  });

  it("stops sending when the receiver aborts mid-way", async () => {
    let release: () => void = () => {};
    const sender = createFileTransfers({ send: () => {}, ready: () => new Promise<void>((r) => (release = r)) }, { chunkSize: 1 });
    const pending = sender.send(new Blob(["abc"]));
    await tick();
    const id = sender.transfers.value[0]?.id ?? "";
    sender.accept(encodeControl({ op: "abort", id, reason: "File too large" }));
    release();
    expect(await pending).toMatchObject({ status: "failed", error: "File too large" });
  });

  it("fails a send whose channel throws, and failPending fails everything in flight", async () => {
    const broken = createFileTransfers({
      send: () => {
        throw new Error("socket closed");
      },
      ready: () => Promise.resolve(),
    });
    expect(await broken.send(new Blob(["x"]))).toMatchObject({ status: "failed", error: "socket closed" });
    const odd = createFileTransfers({
      send: () => {
        throw "boom";
      },
      ready: () => Promise.resolve(),
    });
    expect(await odd.send(new Blob(["x"]))).toMatchObject({ status: "failed", error: "boom" });

    let release: () => void = () => {};
    const t = createFileTransfers({ send: () => {}, ready: () => new Promise<void>((r) => (release = r)) }, { chunkSize: 1 });
    const pending = t.send(new Blob(["ab"]));
    t.accept(encodeControl({ op: "start", id: "in", name: "a", type: "", size: 3 }));
    await tick();
    t.failPending("Connection closed");
    release();
    expect(await pending).toMatchObject({ status: "failed", error: "Connection closed" });
    expect(t.transfers.value.find((x) => x.id === "in")).toMatchObject({ status: "failed", error: "Connection closed" });

    t.clear();
    expect(t.transfers.value).toEqual([]);
  });

  it("reports progress about once per percent, not once per chunk", async () => {
    const seen: number[] = [];
    const receiver = createFileTransfers({ send: () => {}, ready: () => Promise.resolve() });
    receiver.accept(encodeControl({ op: "start", id: "p", name: "a", type: "", size: 1000 }));
    for (let i = 0; i < 1000; i += 1) {
      receiver.accept(encodeChunk("p", new Uint8Array([1])));
      seen.push(receiver.transfers.value[0]?.bytes ?? 0);
    }
    expect(new Set(seen).size).toBeLessThanOrEqual(101);
    expect(seen.at(-1)).toBe(1000);
    receiver.accept(encodeControl({ op: "end", id: "p" }));
    expect(receiver.transfers.value[0]?.status).toBe("done");
  });
});
