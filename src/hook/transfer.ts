/**
 * SinwanJS Hooks — chunked file transfer over a message channel.
 *
 * Shared by `useWebSocket` and `useWebRTC` (data channel): images, audio
 * notes or any `Blob` travel as one JSON `start` frame, binary chunks tagged
 * with the transfer id, and one JSON `end` frame. Both ends speak the same
 * protocol, so a file sent by one Sinwan client is rebuilt by another.
 *
 * Control frame (text): `{"$sinwan":"file","op":"start"|"end"|"abort",...}`.
 * Chunk frame (binary): `"SWF1"`, id length (1 byte), id (UTF-8), payload.
 */

import { signal, type Signal } from "../reactivity/index.ts";
import { createEventHook, type EventHookOn } from "./shared.ts";

export type TransferDirection = "send" | "receive";
export type TransferStatus = "transferring" | "done" | "failed" | "cancelled";

export interface FileTransfer {
  id: string;
  direction: TransferDirection;
  name: string;
  type: string;
  size: number;
  /** Bytes sent or received so far. */
  bytes: number;
  status: TransferStatus;
  /** The received file once `done`, or the file being sent. */
  blob: Blob | null;
  /** Why the transfer failed or was cancelled. */
  error: string | null;
}

export interface FileMeta {
  /** File name shown to the receiver; defaults to the `File` name or `"file"`. */
  name?: string;
  /** MIME type; defaults to the blob's type. */
  type?: string;
}

export type TransferFrame = string | ArrayBuffer;

/** Where frames go. `ready` resolves when the channel can take more data. */
export interface TransferChannel {
  send(frame: TransferFrame): void;
  ready(): Promise<void>;
}

export interface FileTransferOptions {
  /** Bytes per binary frame. Default 16 KiB (safe for every data channel). */
  chunkSize?: number;
  /** Largest file accepted from the other side. Default 50 MiB. */
  maxFileSize?: number;
  /** Most files received at once. Default 4. */
  maxIncoming?: number;
}

export interface FileTransfers {
  transfers: Signal<FileTransfer[]>;
  /** Sends a file; resolves with the finished (or failed) transfer. */
  send(blob: Blob, meta?: FileMeta): Promise<FileTransfer>;
  /** Handles an incoming frame; `true` when it belonged to the protocol. */
  accept(frame: unknown): boolean;
  /** Stops a transfer in either direction and tells the other side. */
  cancel(id: string): void;
  /** Fails every unfinished transfer (the channel closed). */
  failPending(reason: string): void;
  /** Removes finished, failed and cancelled transfers from `transfers`. */
  clear(): void;
  /** A received file is complete. */
  onFile: EventHookOn<FileTransfer>;
}

export const DEFAULT_CHUNK_SIZE = 16 * 1024;
export const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;
const DEFAULT_MAX_INCOMING = 4;
const MAGIC = [0x53, 0x57, 0x46, 0x31];
const CONTROL_KEY = "$sinwan";
const MAX_TEXT_FIELD = 255;

type ControlFrame =
  | { op: "start"; id: string; name: string; type: string; size: number }
  | { op: "end"; id: string }
  | { op: "abort"; id: string; reason: string };

/** A random id that also works outside secure contexts (no `randomUUID`). */
export function transferId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function encodeControl(frame: ControlFrame): string {
  return JSON.stringify({ [CONTROL_KEY]: "file", ...frame });
}

function isText(value: unknown, max = MAX_TEXT_FIELD): value is string {
  return typeof value === "string" && value.length <= max;
}

/** The control frame in `text`, or `null` for any other message. */
export function decodeControl(text: string): ControlFrame | null {
  if (!text.startsWith(`{"${CONTROL_KEY}"`)) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record: Record<string, unknown> = { ...value };
  if (record[CONTROL_KEY] !== "file" || !isText(record.id, 64)) return null;
  const id = record.id;
  if (record.op === "start") {
    const { name, type, size } = record;
    if (!isText(name) || !isText(type)) return null;
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) return null;
    return { op: "start", id, name, type, size };
  }
  if (record.op === "end") return { op: "end", id };
  if (record.op === "abort") return { op: "abort", id, reason: isText(record.reason) ? record.reason : "Cancelled" };
  return null;
}

export function encodeChunk(id: string, payload: Uint8Array): ArrayBuffer {
  const idBytes = new TextEncoder().encode(id);
  const out = new Uint8Array(5 + idBytes.length + payload.length);
  out.set(MAGIC, 0);
  out[4] = idBytes.length;
  out.set(idBytes, 5);
  out.set(payload, 5 + idBytes.length);
  return out.buffer;
}

/** The chunk in `frame`, or `null` when it is not a protocol chunk. */
export function decodeChunk(frame: ArrayBuffer): { id: string; payload: Uint8Array } | null {
  const bytes = new Uint8Array(frame);
  if (bytes.length < 5 || MAGIC.some((byte, index) => bytes[index] !== byte)) return null;
  const idLength = bytes[4] ?? 0;
  if (bytes.length < 5 + idLength) return null;
  const id = new TextDecoder().decode(bytes.subarray(5, 5 + idLength));
  return { id, payload: bytes.subarray(5 + idLength) };
}

interface Outgoing {
  cancelled: string | null;
}

interface Incoming {
  chunks: Uint8Array[];
  /** Exact bytes received; `FileTransfer.bytes` is only updated per percent. */
  received: number;
}

/** File sending and receiving over one channel, with reactive progress. */
export function createFileTransfers(channel: TransferChannel, options: FileTransferOptions = {}): FileTransfers {
  const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_CHUNK_SIZE);
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const maxIncoming = options.maxIncoming ?? DEFAULT_MAX_INCOMING;
  const transfers = signal<FileTransfer[]>([]);
  const fileEvent = createEventHook<FileTransfer>();
  const outgoing = new Map<string, Outgoing>();
  const incoming = new Map<string, Incoming>();

  const find = (id: string) => transfers.value.find((transfer) => transfer.id === id);

  const update = (id: string, patch: Partial<FileTransfer>): FileTransfer | undefined => {
    let next: FileTransfer | undefined;
    transfers.value = transfers.value.map((transfer) => {
      if (transfer.id !== id) return transfer;
      next = { ...transfer, ...patch };
      return next;
    });
    return next;
  };

  /** Progress updates at most once per percent, so large files do not flood the UI. */
  const reportProgress = (transfer: FileTransfer, bytes: number) => {
    const step = Math.max(1, Math.floor(transfer.size / 100));
    if (bytes === transfer.size || Math.floor(bytes / step) !== Math.floor(transfer.bytes / step)) {
      update(transfer.id, { bytes });
    }
  };

  const abortIncoming = (id: string, reason: string, tell: boolean) => {
    incoming.delete(id);
    if (find(id)) update(id, { status: reason === "Cancelled" ? "cancelled" : "failed", error: reason });
    if (tell) channel.send(encodeControl({ op: "abort", id, reason }));
  };

  const send = async (blob: Blob, meta: FileMeta = {}): Promise<FileTransfer> => {
    const id = transferId();
    const name = (meta.name ?? (blob instanceof File ? blob.name : "file")).slice(0, MAX_TEXT_FIELD);
    const type = (meta.type ?? blob.type).slice(0, MAX_TEXT_FIELD);
    const state: Outgoing = { cancelled: null };
    outgoing.set(id, state);
    const transfer: FileTransfer = {
      id,
      direction: "send",
      name,
      type,
      size: blob.size,
      bytes: 0,
      status: "transferring",
      blob,
      error: null,
    };
    transfers.value = [...transfers.value, transfer];
    try {
      channel.send(encodeControl({ op: "start", id, name, type, size: blob.size }));
      let sent = 0;
      while (sent < blob.size) {
        await channel.ready();
        if (state.cancelled !== null) break;
        const payload = new Uint8Array(await blob.slice(sent, sent + chunkSize).arrayBuffer());
        channel.send(encodeChunk(id, payload));
        sent += payload.length;
        const current = find(id);
        if (current) reportProgress(current, sent);
      }
      if (state.cancelled === null) channel.send(encodeControl({ op: "end", id }));
    } catch (error) {
      state.cancelled ??= error instanceof Error ? error.message : String(error);
    } finally {
      outgoing.delete(id);
    }
    const reason = state.cancelled;
    const finished =
      reason === null
        ? update(id, { status: "done", bytes: blob.size })
        : update(id, { status: reason === "Cancelled" ? "cancelled" : "failed", error: reason });
    return finished ?? transfer;
  };

  const acceptControl = (control: ControlFrame) => {
    if (control.op === "start") {
      if (find(control.id)) return;
      if (control.size > maxFileSize) {
        channel.send(encodeControl({ op: "abort", id: control.id, reason: "File too large" }));
        return;
      }
      if (incoming.size >= maxIncoming) {
        channel.send(encodeControl({ op: "abort", id: control.id, reason: "Too many transfers" }));
        return;
      }
      incoming.set(control.id, { chunks: [], received: 0 });
      transfers.value = [
        ...transfers.value,
        {
          id: control.id,
          direction: "receive",
          name: control.name,
          type: control.type,
          size: control.size,
          bytes: 0,
          status: "transferring",
          blob: null,
          error: null,
        },
      ];
      return;
    }
    if (control.op === "abort") {
      const sending = outgoing.get(control.id);
      if (sending) sending.cancelled = control.reason;
      else if (incoming.has(control.id)) abortIncoming(control.id, control.reason, false);
      return;
    }
    const state = incoming.get(control.id);
    const transfer = find(control.id);
    if (!state || !transfer) return;
    incoming.delete(control.id);
    if (state.received !== transfer.size) {
      update(control.id, { status: "failed", error: "Incomplete file" });
      return;
    }
    const blob = new Blob(state.chunks.map((chunk) => chunk.slice()), { type: transfer.type });
    const done = update(control.id, { status: "done", blob, bytes: transfer.size });
    if (done) fileEvent.trigger(done);
  };

  const acceptChunk = (chunk: { id: string; payload: Uint8Array }) => {
    const state = incoming.get(chunk.id);
    const transfer = find(chunk.id);
    if (!state || !transfer) return;
    const bytes = state.received + chunk.payload.length;
    if (bytes > transfer.size) {
      abortIncoming(chunk.id, "File larger than announced", true);
      return;
    }
    state.chunks.push(chunk.payload.slice());
    state.received = bytes;
    reportProgress(transfer, bytes);
  };

  return {
    transfers,
    send,
    accept(frame) {
      if (typeof frame === "string") {
        const control = decodeControl(frame);
        if (!control) return false;
        acceptControl(control);
        return true;
      }
      if (frame instanceof ArrayBuffer) {
        const chunk = decodeChunk(frame);
        if (!chunk) return false;
        acceptChunk(chunk);
        return true;
      }
      return false;
    },
    cancel(id) {
      const sending = outgoing.get(id);
      if (sending) {
        sending.cancelled = "Cancelled";
        channel.send(encodeControl({ op: "abort", id, reason: "Cancelled" }));
      } else if (incoming.has(id)) {
        abortIncoming(id, "Cancelled", true);
      }
    },
    failPending(reason) {
      for (const state of outgoing.values()) state.cancelled ??= reason;
      for (const id of [...incoming.keys()]) abortIncoming(id, reason, false);
    },
    clear() {
      transfers.value = transfers.value.filter((transfer) => transfer.status === "transferring");
    },
    onFile: fileEvent.on,
  };
}
