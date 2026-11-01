import type { RTCSignal } from "../../src/hook/use-web-rtc.ts";

/**
 * Test doubles for the realtime hooks: WebSocket, media devices,
 * MediaRecorder and a small RTCPeerConnection simulator.
 *
 * The DOM types are large; each fake implements what the hooks use and is
 * handed over through one `as unknown as` adapter, like `asFetch` in
 * use-fetch.test.ts.
 */

// Captured at load with EventTarget, so they match even if a test swaps globalThis.Event.
const NativeEvent = globalThis.Event;

// ─── WebSocket ─────────────────────────────────────────────

export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static last(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error("no socket");
    return socket;
  }

  readyState = 0;
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  sent: unknown[] = [];
  closeCalls: [number | undefined, string | undefined][] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(
    readonly url: string | URL,
    readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  send(data: unknown) {
    if (this.readyState !== 1) throw new Error("not open");
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push([code, reason]);
    this.readyState = 2;
  }

  // Test controls
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  receive(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
  closed(code = 1006) {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close", { code }));
  }
}

export function asWebSocket(ctor: typeof FakeWebSocket): typeof WebSocket {
  return ctor as unknown as typeof WebSocket;
}

// ─── Media ─────────────────────────────────────────────────

let trackIds = 0;

export class FakeTrack extends EventTarget {
  readonly id = `track-${++trackIds}`;
  enabled = true;
  stopped = false;
  constructor(readonly kind: "audio" | "video") {
    super();
  }
  stop() {
    this.stopped = true;
  }
  end() {
    this.stopped = true;
    this.dispatchEvent(new NativeEvent("ended"));
  }
}

export class FakeStream {
  constructor(public tracks: FakeTrack[] = []) {}
  getTracks() {
    return [...this.tracks];
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
  addTrack(track: FakeTrack) {
    this.tracks.push(track);
  }
  removeTrack(track: FakeTrack) {
    this.tracks = this.tracks.filter((current) => current !== track);
  }
}

export function asStream(stream: FakeStream): MediaStream {
  return stream as unknown as MediaStream;
}

export function asTrack(track: FakeTrack): MediaStreamTrack {
  return track as unknown as MediaStreamTrack;
}

export function streamOf(...kinds: ("audio" | "video")[]): FakeStream {
  return new FakeStream(kinds.map((kind) => new FakeTrack(kind)));
}

export class FakeMediaDevices extends EventTarget {
  userMediaCalls: MediaStreamConstraints[] = [];
  displayCalls: unknown[] = [];
  /** Next getUserMedia rejects with this. */
  failUserMedia: unknown = null;
  failDisplayMedia: unknown = null;
  /** getUserMedia returns no tracks of the requested kinds. */
  emptyUserMedia = false;
  displayTracks: ("audio" | "video")[] = ["video"];
  deviceList: MediaDeviceInfo[] = [];
  removed: string[] = [];

  async getUserMedia(constraints: MediaStreamConstraints) {
    this.userMediaCalls.push(constraints);
    if (this.failUserMedia) {
      const reason = this.failUserMedia;
      this.failUserMedia = null;
      throw reason;
    }
    if (this.emptyUserMedia) return new FakeStream();
    const kinds: ("audio" | "video")[] = [];
    if (constraints.audio) kinds.push("audio");
    if (constraints.video) kinds.push("video");
    return streamOf(...kinds);
  }

  async getDisplayMedia(options: unknown) {
    this.displayCalls.push(options);
    if (this.failDisplayMedia) throw this.failDisplayMedia;
    return streamOf(...this.displayTracks);
  }

  async enumerateDevices() {
    return this.deviceList;
  }

  emit(type: string) {
    this.dispatchEvent(new NativeEvent(type));
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    this.removed.push(type);
    super.removeEventListener(type, listener);
  }
}

export function asMediaDevices(devices: FakeMediaDevices): MediaDevices {
  return devices as unknown as MediaDevices;
}

// ─── MediaRecorder ─────────────────────────────────────────

export class FakeMediaRecorder {
  static supported = new Set<string>(["audio/webm"]);
  static instances: FakeMediaRecorder[] = [];
  static throwOnCreate: unknown = null;
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.has(type);
  }

  state: RecordingState = "inactive";
  readonly mimeType: string;
  timeslice: number | undefined;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    readonly stream: unknown,
    readonly options: MediaRecorderOptions = {},
  ) {
    if (FakeMediaRecorder.throwOnCreate) throw FakeMediaRecorder.throwOnCreate;
    this.mimeType = options.mimeType ?? "";
    FakeMediaRecorder.instances.push(this);
  }
  start(timeslice?: number) {
    this.state = "recording";
    this.timeslice = timeslice;
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["end"]) });
    this.onstop?.();
  }
  emit(blob: Blob) {
    this.ondataavailable?.({ data: blob });
  }
}

export function asMediaRecorder(ctor: typeof FakeMediaRecorder): typeof MediaRecorder {
  return ctor as unknown as typeof MediaRecorder;
}

// ─── RTCPeerConnection simulator ───────────────────────────

const registry = new Map<string, FakePeerConnection>();
let peerIds = 0;

export class FakeDataChannel extends EventTarget {
  readyState: RTCDataChannelState = "connecting";
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  sent: unknown[] = [];
  remote: FakeDataChannel | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(
    readonly label: string,
    readonly id: number,
  ) {
    super();
  }
  send(data: unknown) {
    if (this.readyState !== "open") throw new Error("channel not open");
    this.sent.push(data);
    const remote = this.remote;
    queueMicrotask(() => remote?.onmessage?.({ data: data instanceof Blob ? data : data }));
  }
  open() {
    if (this.readyState !== "connecting") return;
    this.readyState = "open";
    this.onopen?.();
  }
  close() {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.onclose?.();
    this.dispatchEvent(new NativeEvent("close"));
  }
  drain() {
    this.bufferedAmount = 0;
    this.dispatchEvent(new NativeEvent("bufferedamountlow"));
  }
}

export class FakeSender {
  constructor(public track: FakeTrack | null) {}
  async replaceTrack(track: FakeTrack | null) {
    this.track = track;
  }
}

interface FakeDescription {
  type: RTCSdpType;
  sdp: string;
  toJSON(): RTCSessionDescriptionInit;
}

function description(type: RTCSdpType, sdp: string): FakeDescription {
  return { type, sdp, toJSON: () => ({ type, sdp }) };
}

export class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  /** The next setRemoteDescription rejects with this. */
  static failRemoteDescription: unknown = null;
  /** addIceCandidate rejects with this. */
  static failCandidates: unknown = null;
  /** The next setLocalDescription rejects with this. */
  static failLocalDescription: unknown = null;

  readonly fakeId = `pc-${++peerIds}`;
  signalingState: RTCSignalingState = "stable";
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  localDescription: FakeDescription | null = null;
  remoteDescription: FakeDescription | null = null;
  candidates: RTCIceCandidateInit[] = [];
  senders: FakeSender[] = [];
  channels: FakeDataChannel[] = [];
  remote: FakePeerConnection | null = null;
  restarted = 0;
  closed = false;
  onicecandidate: ((event: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  ontrack: ((event: { track: FakeTrack; streams: FakeStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  private negotiationQueued = false;
  private negotiationNeeded = false;
  private streamsBySender = new Map<FakeSender, FakeStream>();
  private delivered = new Set<FakeTrack>();

  constructor(readonly configuration?: RTCConfiguration) {
    FakePeerConnection.instances.push(this);
    registry.set(this.fakeId, this);
  }

  /** Like browsers: what is added while answering rides on the answer; otherwise renegotiate. */
  private needNegotiation() {
    if (this.signalingState === "have-remote-offer") return;
    this.negotiationNeeded = true;
    this.queueNegotiation();
  }

  private queueNegotiation() {
    if (this.negotiationQueued || !this.negotiationNeeded || this.closed) return;
    this.negotiationQueued = true;
    queueMicrotask(() => {
      this.negotiationQueued = false;
      if (this.signalingState !== "stable" || !this.negotiationNeeded || this.closed) return;
      this.negotiationNeeded = false;
      this.onnegotiationneeded?.();
    });
  }

  createDataChannel(label: string, init: RTCDataChannelInit = {}) {
    const channel = new FakeDataChannel(label, init.id ?? this.channels.length);
    this.channels.push(channel);
    this.needNegotiation();
    return channel;
  }

  addTrack(track: FakeTrack, stream: FakeStream) {
    const sender = new FakeSender(track);
    this.senders.push(sender);
    this.streamsBySender.set(sender, stream);
    this.needNegotiation();
    return sender;
  }

  removeTrack(sender: FakeSender) {
    this.senders = this.senders.filter((current) => current !== sender);
    this.needNegotiation();
  }

  getSenders() {
    return [...this.senders];
  }

  async setLocalDescription(init?: RTCSessionDescriptionInit) {
    if (FakePeerConnection.failLocalDescription) {
      const reason = FakePeerConnection.failLocalDescription;
      FakePeerConnection.failLocalDescription = null;
      throw reason;
    }
    const type = init?.type ?? (this.signalingState === "have-remote-offer" ? "answer" : "offer");
    this.localDescription = description(type, `fake:${this.fakeId}`);
    if (type === "offer") {
      this.signalingState = "have-local-offer";
    } else {
      this.signalingState = "stable";
      this.connect();
    }
    queueMicrotask(() => {
      this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `candidate:${this.fakeId}`, sdpMid: "0" }) } });
      this.onicecandidate?.({ candidate: null });
    });
  }

  async setRemoteDescription(init: RTCSessionDescriptionInit) {
    if (FakePeerConnection.failRemoteDescription) {
      const reason = FakePeerConnection.failRemoteDescription;
      FakePeerConnection.failRemoteDescription = null;
      throw reason;
    }
    const sdp = init.sdp ?? "";
    this.remote = registry.get(sdp.replace("fake:", "")) ?? null;
    this.remoteDescription = description(init.type ?? "offer", sdp);
    if (init.type === "offer") {
      // A polite peer's own offer is rolled back implicitly.
      this.signalingState = "have-remote-offer";
    } else {
      this.signalingState = "stable";
      this.connect();
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (FakePeerConnection.failCandidates) throw FakePeerConnection.failCandidates;
    this.candidates.push(candidate);
  }

  restartIce() {
    this.restarted += 1;
  }

  close() {
    this.closed = true;
    this.signalingState = "closed";
    this.connectionState = "closed";
    for (const channel of this.channels) channel.close();
  }

  /** An exchange completed and both sides know each other: pair channels, deliver new tracks, connect. */
  private connect() {
    this.queueNegotiation();
    const remote = this.remote;
    if (!remote || remote.remote !== this || this.closed || remote.closed) return;
    for (const side of [this, remote]) {
      const other = side === this ? remote : this;
      for (const channel of side.channels) {
        const match = other.channels.find((candidate) => candidate.id === channel.id);
        if (match) {
          channel.remote = match;
          channel.open();
        }
      }
      for (const sender of other.senders) {
        const stream = other.streamsBySender.get(sender);
        if (!sender.track || !stream || side.delivered.has(sender.track)) continue;
        side.delivered.add(sender.track);
        side.ontrack?.({ track: sender.track, streams: [stream] });
      }
      side.setConnectionState("connected");
    }
  }

  setConnectionState(state: RTCPeerConnectionState) {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  setIceState(state: RTCIceConnectionState) {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.();
  }

  /** Fires negotiationneeded now (renegotiation tests). */
  forceNegotiation() {
    this.needNegotiation();
  }
}

export function asPeerConnection(ctor: typeof FakePeerConnection): typeof RTCPeerConnection {
  return ctor as unknown as typeof RTCPeerConnection;
}

/** Two signaling channels wired to each other, delivering asynchronously. */
export function signalingPair() {
  type Handler = (signal: RTCSignal) => void;
  const handlers: [Set<Handler>, Set<Handler>] = [new Set(), new Set()];
  const logs: [unknown[], unknown[]] = [[], []];
  const side = (index: 0 | 1) => ({
    send(signal: RTCSignal) {
      logs[index].push(signal);
      const targets = handlers[index === 0 ? 1 : 0];
      queueMicrotask(() => {
        for (const handler of targets) handler(JSON.parse(JSON.stringify(signal)));
      });
    },
    onSignal(handler: Handler) {
      handlers[index].add(handler);
      return () => {
        handlers[index].delete(handler);
      };
    },
  });
  return { a: side(0), b: side(1), logs };
}

/** Lets queued microtasks and short timers settle. */
export async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

export function resetFakes() {
  FakeWebSocket.instances = [];
  FakePeerConnection.instances = [];
  FakePeerConnection.failCandidates = null;
  FakePeerConnection.failRemoteDescription = null;
  FakePeerConnection.failLocalDescription = null;
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.throwOnCreate = null;
  FakeMediaRecorder.supported = new Set(["audio/webm"]);
  registry.clear();
}
