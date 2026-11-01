import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { cc } from "../src/component/create.ts";
import { encodeControl } from "../src/hook/transfer.ts";
import { isRTCSignal, useWebRTC, webSocketSignaling, type SignalingChannel } from "../src/hook/use-web-rtc.ts";
import { mount } from "../src/renderer/mount.ts";
import {
  FakeDataChannel,
  FakeMediaDevices,
  FakePeerConnection,
  FakeStream,
  FakeTrack,
  asMediaDevices,
  asPeerConnection,
  asStream,
  resetFakes,
  settle,
  signalingPair,
  streamOf,
} from "./support/realtime-fakes.ts";

const PeerConnection = asPeerConnection(FakePeerConnection);

function pair(options: { dataChannels?: boolean; files?: false } = {}) {
  const wire = signalingPair();
  const devicesA = new FakeMediaDevices();
  const devicesB = new FakeMediaDevices();
  const a = useWebRTC({
    signaling: wire.a,
    RTCPeerConnection: PeerConnection,
    mediaDevices: asMediaDevices(devicesA),
    ...options,
  });
  const b = useWebRTC({
    signaling: wire.b,
    polite: true,
    RTCPeerConnection: PeerConnection,
    mediaDevices: asMediaDevices(devicesB),
    ...options,
  });
  return { a, b, wire, devicesA, devicesB };
}

async function connected(media: MediaStreamConstraints | null = { audio: true, video: true }) {
  const call = pair();
  call.b.onIncoming(() => void call.b.answer(media));
  await call.a.start(media);
  await settle();
  return call;
}

function fakePeer(rtc: ReturnType<typeof useWebRTC>): FakePeerConnection {
  const found = FakePeerConnection.instances.find((pc) => (rtc.peer.value as unknown) === pc);
  if (!found) throw new Error("no peer");
  return found;
}

beforeEach(() => resetFakes());

describe("isRTCSignal", () => {
  it("accepts well-formed signals only", () => {
    expect(isRTCSignal({ type: "bye" })).toBe(true);
    expect(isRTCSignal({ type: "bye", reason: "x" })).toBe(true);
    expect(isRTCSignal({ type: "description", description: { type: "offer", sdp: "v=0" } })).toBe(true);
    expect(isRTCSignal({ type: "description", description: { type: "rollback" } })).toBe(true);
    expect(isRTCSignal({ type: "candidate", candidate: null })).toBe(true);
    expect(isRTCSignal({ type: "candidate", candidate: { candidate: "c" } })).toBe(true);
    for (const value of [
      null,
      "bye",
      { type: "bye", reason: 1 },
      { type: "description", description: null },
      { type: "description", description: { type: "nope" } },
      { type: "description", description: { type: "offer", sdp: 1 } },
      { type: "candidate", candidate: { candidate: 1 } },
      { type: "candidate" },
      { type: "other" },
    ]) {
      expect(isRTCSignal(value)).toBe(false);
    }
  });
});

describe("webSocketSignaling", () => {
  function socketStub() {
    const sent: unknown[] = [];
    const handlers = new Set<(message: unknown) => void>();
    return {
      sent,
      emit: (message: unknown) => handlers.forEach((handler) => handler(message)),
      socket: {
        sendJson: (value: unknown) => {
          sent.push(value);
          return true;
        },
        onMessage: (handler: (message: unknown) => void) => {
          handlers.add(handler);
          return () => handlers.delete(handler);
        },
      },
    };
  }

  it("wraps signals in { type: 'rtc' } and reads them back from objects or JSON text", () => {
    const stub = socketStub();
    const channel = webSocketSignaling(stub.socket);
    channel.send({ type: "bye" });
    expect(stub.sent).toEqual([{ type: "rtc", signal: { type: "bye" } }]);
    const received: unknown[] = [];
    const stop = channel.onSignal((signal) => received.push(signal));
    stub.emit({ type: "rtc", signal: { type: "bye", reason: "a" } });
    stub.emit(JSON.stringify({ type: "rtc", signal: { type: "bye", reason: "b" } }));
    stub.emit("not json");
    stub.emit({ type: "chat", text: "hi" });
    stub.emit({ type: "rtc", signal: { type: "evil" } });
    stub.emit(null);
    stop();
    stub.emit({ type: "rtc", signal: { type: "bye" } });
    expect(received).toEqual([
      { type: "bye", reason: "a" },
      { type: "bye", reason: "b" },
    ]);
  });

  it("uses custom encode and decode (rooms, addressing)", () => {
    const stub = socketStub();
    const channel = webSocketSignaling(stub.socket, {
      encode: (signal) => ({ to: "peer-2", payload: signal }),
      decode: (message) => (message as { payload?: unknown }).payload,
    });
    channel.send({ type: "bye" });
    expect(stub.sent).toEqual([{ to: "peer-2", payload: { type: "bye" } }]);
    const received: unknown[] = [];
    channel.onSignal((signal) => received.push(signal));
    stub.emit({ payload: { type: "candidate", candidate: null } });
    expect(received).toEqual([{ type: "candidate", candidate: null }]);
  });
});

describe("useWebRTC calls", () => {
  it("rings, answers, connects with media both ways, exchanges messages, and hangs up", async () => {
    const call = pair();
    const incoming: string[] = [];
    call.b.onIncoming(() => incoming.push(call.b.callState.value));
    expect(await call.a.start({ audio: true, video: true })).toBe(true);
    expect(call.a.callState.value).toBe("calling");
    await settle();
    expect(incoming).toEqual(["ringing"]);
    expect(await call.b.answer({ audio: true, video: true })).toBe(true);
    await settle();

    for (const side of [call.a, call.b]) {
      expect(side.callState.value).toBe("connected");
      expect(side.connectionState.value).toBe("connected");
      expect(side.remoteTracks.value.map((track) => track.kind).sort()).toEqual(["audio", "video"]);
      expect(side.remoteStream.value).not.toBeNull();
      expect(side.channelOpen.value).toBe(true);
    }
    expect(fakePeer(call.a).candidates.length).toBeGreaterThan(0);

    const gotA: unknown[] = [];
    const gotB: unknown[] = [];
    call.a.onMessage((message) => gotA.push(message));
    call.b.onMessage((message) => gotB.push(message));
    const bytes = new Uint8Array([1]).buffer;
    expect(call.a.send("hello")).toBe(true);
    expect(call.a.send(bytes)).toBe(true);
    expect(call.a.send(new Blob(["blob"]))).toBe(true);
    expect(call.b.sendJson({ ok: true })).toBe(true);
    await settle();
    expect(gotB.slice(0, 2)).toEqual(["hello", bytes]);
    expect(gotB[2]).toBeInstanceOf(Blob);
    expect(gotA).toEqual(['{"ok":true}']);
    expect(call.a.data.value).toBe('{"ok":true}');

    const hangUps: unknown[] = [];
    call.b.onRemoteHangUp((reason) => hangUps.push(reason));
    const localTracks = call.a.localStream.value?.getTracks() ?? [];
    call.a.hangUp("done");
    await settle();
    expect(call.a.callState.value).toBe("ended");
    expect(call.a.peer.value).toBeNull();
    expect(call.a.localStream.value).toBeNull();
    expect(localTracks.every((track) => (track as unknown as FakeTrack).stopped)).toBe(true);
    expect(call.b.callState.value).toBe("ended");
    expect(hangUps).toEqual(["done"]);
    expect(call.a.send("late")).toBe(false);

    // Hanging up again, or a late bye, changes nothing.
    call.a.hangUp();
    call.b.hangUp();
    expect(call.wire.logs[1].filter((signal) => (signal as { type: string }).type === "bye")).toHaveLength(0);
  });

  it("transfers files over the data channel both ways", async () => {
    const call = await connected(null);
    const files: string[] = [];
    call.b.onFile((file) => files.push(file.name));
    const sent = await call.a.sendFile(new Blob(["picture"], { type: "image/png" }), { name: "p.png" });
    await settle();
    expect(sent.status).toBe("done");
    expect(files).toEqual(["p.png"]);
    expect(call.b.transfers.value[0]).toMatchObject({ status: "done", type: "image/png" });
    call.b.clearTransfers();
    expect(call.b.transfers.value).toEqual([]);
    call.a.cancelTransfer("none");
  });

  it("waits for the file channel to drain, and fails when it closes or is not open", async () => {
    const call = await connected(null);
    const channel = fakePeer(call.a).channels.find((c) => c.label === "sinwan-files") as FakeDataChannel;
    channel.bufferedAmount = 10 * 1024 * 1024;
    const pending = call.a.sendFile(new Blob(["slow"]));
    await settle();
    expect(channel.sent).toHaveLength(1);
    channel.drain();
    expect((await pending).status).toBe("done");

    channel.bufferedAmount = 10 * 1024 * 1024;
    const stuck = call.a.sendFile(new Blob(["stuck"]));
    await settle();
    channel.close();
    expect(await stuck).toMatchObject({ status: "failed" });

    const notOpen = await call.a.sendFile(new Blob(["x"]));
    expect(notOpen).toMatchObject({ status: "failed", error: "The call is not connected" });

    // The channel goes away between two chunks of a bigger file.
    const fresh = await connected(null);
    const freshChannel = fakePeer(fresh.a).channels.find((c) => c.label === "sinwan-files") as FakeDataChannel;
    const big = fresh.a.sendFile(new Blob([new Uint8Array(40 * 1024)]));
    while (freshChannel.sent.length < 2) await Promise.resolve();
    freshChannel.readyState = "closed";
    expect(await big).toMatchObject({ status: "failed", error: "The call is not connected" });

    // A receive in flight fails when the file channel closes.
    const other = fakePeer(call.b).channels.find((c) => c.label === "sinwan-files") as FakeDataChannel;
    other.onmessage?.({ data: encodeControl({ op: "start", id: "in", name: "a", type: "", size: 5 }) });
    other.close();
    expect(call.b.transfers.value.find((t) => t.id === "in")).toMatchObject({ status: "failed" });
  });

  it("connects data-only calls, and a stream you pass in stays yours", async () => {
    const call = pair();
    const mine = streamOf("audio");
    call.b.onIncoming(() => void call.b.answer(asStream(mine)));
    expect(await call.a.start()).toBe(true);
    await settle();
    expect(call.a.callState.value).toBe("connected");
    expect(call.a.remoteTracks.value.map((t) => t.kind)).toEqual(["audio"]);
    call.b.hangUp();
    await settle();
    expect(mine.tracks[0]?.stopped).toBe(false);
  });

  it("connects when both call at once (glare), whichever side is still opening its media", async () => {
    const both = pair();
    await Promise.all([both.a.start({ audio: true }), both.b.start({ audio: true })]);
    await settle(40);
    expect(both.a.callState.value).toBe("connected");
    expect(both.b.callState.value).toBe("connected");

    // b's media is slow: a's offer arrives before b has a connection.
    const wire = signalingPair();
    let release: () => void = () => {};
    const slow = new (class extends FakeMediaDevices {
      override async getUserMedia(constraints: MediaStreamConstraints) {
        await new Promise<void>((resolve) => (release = resolve));
        return super.getUserMedia(constraints);
      }
    })();
    const a = useWebRTC({ signaling: wire.a, RTCPeerConnection: PeerConnection, mediaDevices: asMediaDevices(new FakeMediaDevices()) });
    const b = useWebRTC({ signaling: wire.b, polite: true, RTCPeerConnection: PeerConnection, mediaDevices: asMediaDevices(slow) });
    const bStarting = b.start({ audio: true });
    await a.start({ audio: true });
    await settle();
    expect(b.callState.value).toBe("calling");
    release();
    expect(await bStarting).toBe(true);
    await settle(40);
    expect(a.callState.value).toBe("connected");
    expect(b.callState.value).toBe("connected");
  });

  it("renegotiates after connecting (either side may offer)", async () => {
    const call = await connected({ audio: true });
    const before = call.wire.logs[1].length;
    fakePeer(call.b).forceNegotiation();
    await settle();
    expect(call.wire.logs[1].length).toBeGreaterThan(before);
    expect(call.a.callState.value).toBe("connected");
  });
});

describe("useWebRTC ringing and refusals", () => {
  it("keeps the newest offer while ringing, rejects, and ignores answers without a call", async () => {
    const call = pair();
    const hangUps: unknown[] = [];
    call.a.onRemoteHangUp((reason) => hangUps.push(reason));
    await call.a.start({ audio: true });
    await settle();
    expect(call.b.callState.value).toBe("ringing");
    fakePeer(call.a).forceNegotiation();
    await settle();
    call.b.reject();
    await settle();
    expect(call.b.callState.value).toBe("ended");
    expect(call.a.callState.value).toBe("ended");
    expect(hangUps).toEqual(["Declined"]);
    call.b.reject();
    expect(await call.b.answer()).toBe(false);

    // A stray answer or candidate with no call is ignored or kept.
    const lone = pair();
    lone.wire.a.send({ type: "description", description: { type: "answer", sdp: "fake:none" } });
    lone.wire.a.send({ type: "candidate", candidate: { candidate: "early" } });
    lone.wire.a.send({ type: "bye" });
    await settle();
    expect(lone.b.callState.value).toBe("idle");
  });

  it("does not start twice, and starts again after a call ended or failed", async () => {
    const call = await connected({ audio: true });
    expect(await call.a.start()).toBe(false);
    fakePeer(call.a).setConnectionState("failed");
    expect(call.a.callState.value).toBe("failed");
    expect(await call.a.start({ audio: true })).toBe(true);
    expect(FakePeerConnection.instances.filter((pc) => pc.closed)).toHaveLength(1);
  });

  it("reports missing WebRTC, missing devices and refused media", async () => {
    const original = Reflect.get(globalThis, "RTCPeerConnection");
    Reflect.deleteProperty(globalThis, "RTCPeerConnection");
    const originalDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    try {
      const wire = signalingPair();
      const none = useWebRTC({ signaling: wire.a });
      expect(await none.start()).toBe(false);
      expect(none.error.value).toEqual(new Error("WebRTC is not available"));
      expect(none.callState.value).toBe("idle");
      expect(await none.start({ audio: true })).toBe(false);
      expect(none.error.value).toEqual(new Error("Media devices are not available"));

      // Ringing, then answering without WebRTC fails but keeps ringing.
      wire.b.send({ type: "description", description: { type: "offer", sdp: "fake:x" } });
      await settle();
      expect(none.callState.value).toBe("ringing");
      expect(await none.answer()).toBe(false);
      expect(none.callState.value).toBe("ringing");
    } finally {
      if (original !== undefined) Reflect.set(globalThis, "RTCPeerConnection", original);
      if (originalDevices) Object.defineProperty(navigator, "mediaDevices", originalDevices);
      else Reflect.deleteProperty(navigator, "mediaDevices");
    }

    const call = pair();
    call.devicesA.failUserMedia = new DOMException("denied", "NotAllowedError");
    expect(await call.a.start({ video: true })).toBe(false);
    expect(call.a.callState.value).toBe("idle");
    await call.a.start({ audio: true });
    await settle();
    call.devicesB.failUserMedia = new DOMException("denied", "NotAllowedError");
    expect(await call.b.answer({ audio: true })).toBe(false);
    expect(call.b.callState.value).toBe("ringing");
  });

  it("fails cleanly when the offer cannot be applied, and keeps negotiation errors", async () => {
    const call = pair();
    await call.a.start({ audio: true });
    await settle();
    FakePeerConnection.failRemoteDescription = new Error("bad offer");
    expect(await call.b.answer()).toBe(false);
    expect(call.b.callState.value).toBe("failed");
    expect(call.b.error.value).toEqual(new Error("bad offer"));

    const other = pair();
    FakePeerConnection.failLocalDescription = new Error("no offer");
    await other.a.start({ audio: true });
    await settle();
    expect(other.a.error.value).toEqual(new Error("no offer"));
  });
});

describe("useWebRTC negotiation details", () => {
  it("queues early candidates, skips the end-of-candidates marker, and reports candidate errors", async () => {
    const call = pair();
    await call.a.start({ audio: true });
    await settle();
    call.wire.a.send({ type: "candidate", candidate: { candidate: "while-ringing" } });
    await settle();
    await call.b.answer();
    await settle();
    expect(fakePeer(call.b).candidates.map((c) => c.candidate)).toContain("while-ringing");

    FakePeerConnection.failCandidates = new Error("bad candidate");
    call.wire.a.send({ type: "candidate", candidate: { candidate: "x" } });
    await settle();
    expect(call.b.error.value).toEqual(new Error("bad candidate"));
    FakePeerConnection.failCandidates = null;
  });

  it("the impolite side ignores a colliding offer and its candidates' errors", async () => {
    const call = pair();
    await call.a.start({ audio: true });
    // a has a local offer out; an offer from b now collides and a (impolite) ignores it.
    call.wire.b.send({ type: "description", description: { type: "offer", sdp: "fake:ghost" } });
    await settle(2);
    FakePeerConnection.failCandidates = new Error("ignored");
    call.wire.b.send({ type: "candidate", candidate: { candidate: "for-ignored-offer" } });
    await settle();
    FakePeerConnection.failCandidates = null;
    expect(call.a.error.value).toBeNull();
  });

  it("maps connection states and restarts ICE once", async () => {
    const call = await connected({ audio: true });
    const pc = fakePeer(call.a);
    pc.setConnectionState("disconnected");
    expect(call.a.callState.value).toBe("reconnecting");
    pc.setIceState("failed");
    expect(pc.restarted).toBe(1);
    pc.setIceState("failed");
    expect(pc.restarted).toBe(1);
    pc.setConnectionState("connected");
    expect(call.a.callState.value).toBe("connected");
    pc.setIceState("failed");
    expect(pc.restarted).toBe(2);
    pc.setIceState("checking");
    pc.setConnectionState("connecting");
    expect(call.a.callState.value).toBe("reconnecting");
  });

  it("keeps signaling errors instead of throwing", async () => {
    const broken: SignalingChannel = {
      send: () => {
        throw new Error("offline");
      },
      onSignal: () => () => {},
    };
    const rtc = useWebRTC({ signaling: broken, RTCPeerConnection: PeerConnection });
    await rtc.start();
    await settle();
    expect(rtc.error.value).toEqual(new Error("offline"));
  });

  it("tracks remote tracks ending, and keeps the stream when a track comes without one", async () => {
    const call = await connected({ audio: true, video: true });
    const pc = fakePeer(call.a);
    const stream = call.a.remoteStream.value;
    const extra = new FakeTrack("video");
    pc.ontrack?.({ track: extra, streams: [] });
    expect(call.a.remoteStream.value).toBe(stream);
    expect(call.a.remoteTracks.value).toHaveLength(3);
    extra.end();
    expect(call.a.remoteTracks.value).toHaveLength(2);
  });
});

describe("useWebRTC media controls", () => {
  it("mutes and turns the camera off", async () => {
    const call = await connected({ audio: true, video: true });
    const stream = call.a.localStream.value as unknown as FakeStream;
    call.a.toggleAudio();
    call.a.toggleVideo();
    expect(call.a.audioEnabled.value).toBe(false);
    expect(call.a.videoEnabled.value).toBe(false);
    expect(stream.tracks.map((t) => t.enabled)).toEqual([false, false]);
    call.a.setAudioEnabled(true);
    call.a.setVideoEnabled(true);
    expect(stream.tracks.map((t) => t.enabled)).toEqual([true, true]);

    const idle = pair();
    idle.a.toggleAudio();
    idle.a.toggleVideo();
    expect(idle.a.audioEnabled.value).toBe(false);
  });

  it("shares the screen in place of the camera, and restores it when sharing stops", async () => {
    const call = await connected({ audio: true, video: true });
    const pc = fakePeer(call.a);
    const camera = pc.senders.find((s) => s.track?.kind === "video")?.track;
    expect(await call.a.shareScreen()).toBe(true);
    expect(call.a.isScreenSharing.value).toBe(true);
    expect(call.devicesA.displayCalls).toEqual([{ video: true }]);
    const sender = pc.senders.find((s) => s.track?.kind === "video");
    expect(sender?.track).not.toBe(camera);
    expect(await call.a.shareScreen()).toBe(false);
    call.a.setVideoEnabled(false);
    expect(camera?.enabled).toBe(false);
    call.a.setVideoEnabled(true);

    // The browser's "Stop sharing" ends the track.
    (sender?.track as FakeTrack).end();
    await settle();
    expect(call.a.isScreenSharing.value).toBe(false);
    expect(sender?.track).toBe(camera);
    await call.a.stopScreenShare();
  });

  it("adds the screen to an audio-only call and removes it afterwards; refusals are reported", async () => {
    const call = await connected({ audio: true });
    const pc = fakePeer(call.a);
    expect(await call.a.shareScreen({ video: true, audio: false })).toBe(true);
    expect(pc.senders.filter((s) => s.track?.kind === "video")).toHaveLength(1);
    await call.a.stopScreenShare();
    expect(pc.senders.filter((s) => s.track?.kind === "video")).toHaveLength(0);

    call.devicesA.failDisplayMedia = new DOMException("denied", "NotAllowedError");
    expect(await call.a.shareScreen()).toBe(false);
    expect((call.a.error.value as DOMException).name).toBe("NotAllowedError");
    call.devicesA.failDisplayMedia = null;
    call.devicesA.displayTracks = ["audio"];
    expect(await call.a.shareScreen()).toBe(false);

    const idle = pair();
    expect(await idle.a.shareScreen()).toBe(false);
  });

  it("switches microphone or camera during a call", async () => {
    const call = await connected({ audio: true, video: true });
    const pc = fakePeer(call.a);
    const stream = call.a.localStream.value as unknown as FakeStream;
    const oldMic = stream.getAudioTracks()[0];
    expect(await call.a.switchDevice("audio", "mic-2")).toBe(true);
    expect(call.devicesA.userMediaCalls.at(-1)).toEqual({ audio: { deviceId: { exact: "mic-2" } } });
    expect(oldMic?.stopped).toBe(true);
    const newMic = stream.getAudioTracks()[0];
    expect(pc.senders.some((s) => s.track === newMic)).toBe(true);

    // While sharing, a new camera waits for the share to end.
    await call.a.shareScreen();
    expect(await call.a.switchDevice("video", "cam-2")).toBe(true);
    await call.a.stopScreenShare();
    expect(pc.senders.find((s) => s.track?.kind === "video")?.track).toBe(stream.getVideoTracks()[0]);

    call.devicesA.failUserMedia = new Error("busy");
    expect(await call.a.switchDevice("audio", "x")).toBe(false);
    call.devicesA.emptyUserMedia = true;
    expect(await call.a.switchDevice("video", "x")).toBe(false);

    const idle = pair();
    expect(await idle.a.switchDevice("audio", "x")).toBe(false);
  });

  it("does not stop the old track of a stream you own when switching", async () => {
    const call = pair();
    const mine = streamOf("audio");
    call.b.onIncoming(() => void call.b.answer());
    await call.a.start(asStream(mine));
    await settle();
    const old = mine.tracks[0];
    expect(await call.a.switchDevice("audio", "mic-2")).toBe(true);
    expect(old?.stopped).toBe(false);
    // A stream without a track of that kind just gains one.
    expect(await call.a.switchDevice("video", "cam")).toBe(true);
    expect(mine.getVideoTracks()).toHaveLength(1);
  });
});

describe("useWebRTC options and lifecycle", () => {
  it("can run without data channels or without files", async () => {
    const plain = pair({ dataChannels: false });
    plain.b.onIncoming(() => void plain.b.answer({ audio: true }));
    await plain.a.start({ audio: true });
    await settle();
    expect(plain.a.callState.value).toBe("connected");
    expect(plain.a.channelOpen.value).toBe(false);
    expect(plain.a.send("x")).toBe(false);
    await expect(plain.a.sendFile(new Blob(["x"]))).rejects.toThrow("File transfer is disabled");
    expect(plain.a.transfers.value).toEqual([]);
    plain.a.cancelTransfer("x");
    plain.a.clearTransfers();
    plain.a.onFile(() => {});

    const noFiles = await (async () => {
      const call = pair({ files: false });
      call.b.onIncoming(() => void call.b.answer());
      await call.a.start();
      await settle();
      return call;
    })();
    expect(noFiles.a.send("still chats")).toBe(true);
    await expect(noFiles.a.sendFile(new Blob(["x"]))).rejects.toThrow("File transfer is disabled");
  });

  it("hangs up and stops listening when its component unmounts, unless autoClose is false", async () => {
    const win = new Window({ url: "http://localhost" });
    const doc = win.document as unknown as Document;
    Object.assign(globalThis, { document: doc, window: win });
    const wire = signalingPair();
    let rtc: ReturnType<typeof useWebRTC> | undefined;
    let kept: ReturnType<typeof useWebRTC> | undefined;
    const app = mount(
      cc(() => {
        rtc = useWebRTC({ signaling: wire.a, RTCPeerConnection: PeerConnection });
        kept = useWebRTC({ signaling: signalingPair().a, RTCPeerConnection: PeerConnection, autoClose: false });
        return null;
      }),
      doc.createElement("div") as unknown as Element,
    );
    await rtc?.start();
    await kept?.start();
    app.unmount();
    expect(rtc?.callState.value).toBe("ended");
    expect(kept?.callState.value).toBe("calling");
    expect(wire.logs[0].at(-1)).toEqual({ type: "bye" });
    // No longer listening: an offer does not ring.
    wire.b.send({ type: "description", description: { type: "offer", sdp: "fake:x" } });
    await settle();
    expect(rtc?.callState.value).toBe("ended");
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
  });
});

afterEach(() => {
  FakePeerConnection.failCandidates = null;
});
