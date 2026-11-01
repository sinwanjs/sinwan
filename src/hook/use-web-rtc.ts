/**
 * SinwanJS Hooks — useWebRTC
 *
 * One-to-one calls (audio, video, screen share) and peer-to-peer messages and
 * files over an `RTCPeerConnection`. Signaling goes through any
 * `SignalingChannel`; `webSocketSignaling` plugs in `useWebSocket`.
 *
 * Negotiation follows the "perfect negotiation" pattern: either side may
 * start or renegotiate; when both offer at once, the `polite` side yields.
 * Exactly one side of a call must be polite (for example the callee).
 */

import { signal, type Signal } from "../reactivity/index.ts";
import { createEventHook, tryOnUnmounted, type EventHookOn, type Fn } from "./shared.ts";
import {
  createFileTransfers,
  type FileMeta,
  type FileTransfer,
  type FileTransferOptions,
  type FileTransfers,
} from "./transfer.ts";
import type { UseWebSocketReturn } from "./use-web-socket.ts";
import { stopStream } from "./use-user-media.ts";

export type RTCSignal =
  | { type: "description"; description: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit | null }
  | { type: "bye"; reason?: string };

/** How the two peers exchange `RTCSignal`s (a WebSocket, a room server, …). */
export interface SignalingChannel {
  send(signal: RTCSignal): void;
  /** Subscribes to incoming signals; returns the unsubscribe function. */
  onSignal(handler: (signal: RTCSignal) => void): Fn;
}

export type CallState =
  | "idle"
  | "ringing"
  | "calling"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "failed";

export type DataChannelMessage = string | ArrayBuffer | Blob;

export interface UseWebRTCOptions {
  signaling: SignalingChannel;
  /** Yield when both sides offer at once. Exactly one side must be polite. Default `false`. */
  polite?: boolean;
  /** ICE servers and policies. Add STUN/TURN servers to connect across networks. */
  configuration?: RTCConfiguration;
  /** Open the message and file data channels. Default `true`. */
  dataChannels?: boolean;
  /** File transfer settings (over the data channel), or `false`. */
  files?: FileTransferOptions | false;
  /** Hang up when the calling component unmounts. Default `true`. */
  autoClose?: boolean;
  /** A different `RTCPeerConnection` constructor (tests, polyfills). */
  RTCPeerConnection?: typeof RTCPeerConnection;
  /** A different `navigator.mediaDevices` (tests). */
  mediaDevices?: MediaDevices;
}

export interface UseWebRTCReturn {
  callState: Signal<CallState>;
  connectionState: Signal<RTCPeerConnectionState>;
  /** The peer connection while a call exists. */
  peer: Signal<RTCPeerConnection | null>;
  localStream: Signal<MediaStream | null>;
  /** The remote media; its tracks change live (see `remoteTracks`). */
  remoteStream: Signal<MediaStream | null>;
  remoteTracks: Signal<MediaStreamTrack[]>;
  audioEnabled: Signal<boolean>;
  videoEnabled: Signal<boolean>;
  isScreenSharing: Signal<boolean>;
  /** The message channel is open. */
  channelOpen: Signal<boolean>;
  /** The last data-channel message. */
  data: Signal<string | ArrayBuffer | null>;
  error: Signal<unknown>;
  /**
   * Starts a call: opens the local media (constraints, or a stream you own),
   * then offers. With no media, connects data channels only (chat, files).
   * `false` when the media could not be opened or a call is already running.
   */
  start(media?: MediaStreamConstraints | MediaStream | null): Promise<boolean>;
  /** Answers a ringing call, with optional local media. */
  answer(media?: MediaStreamConstraints | MediaStream | null): Promise<boolean>;
  /** Declines a ringing call. */
  reject(reason?: string): void;
  /** Ends the call on both sides and releases the camera and microphone. */
  hangUp(reason?: string): void;
  setAudioEnabled(enabled: boolean): void;
  setVideoEnabled(enabled: boolean): void;
  toggleAudio(): void;
  toggleVideo(): void;
  /** Sends the screen instead of the camera; `false` when refused. */
  shareScreen(options?: DisplayMediaStreamOptions): Promise<boolean>;
  stopScreenShare(): Promise<void>;
  /** Switches the microphone or camera to `deviceId` during a call. */
  switchDevice(kind: "audio" | "video", deviceId: string): Promise<boolean>;
  /** Sends on the message channel; `false` when it is not open. */
  send(message: DataChannelMessage): boolean;
  sendJson(value: unknown): boolean;
  sendFile(blob: Blob, meta?: FileMeta): Promise<FileTransfer>;
  transfers: Signal<FileTransfer[]>;
  cancelTransfer(id: string): void;
  clearTransfers(): void;
  /** An offer arrived while idle: the call is ringing. */
  onIncoming: EventHookOn<void>;
  onMessage: EventHookOn<string | ArrayBuffer>;
  onFile: EventHookOn<FileTransfer>;
  /** The other side hung up (with its reason, if any). */
  onRemoteHangUp: EventHookOn<string | undefined>;
}

const SDP_TYPES = new Set(["offer", "answer", "pranswer", "rollback"]);
const FILE_BUFFER_THRESHOLD = 256 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Whether an untrusted value is a well-formed `RTCSignal`. */
export function isRTCSignal(value: unknown): value is RTCSignal {
  if (!isObject(value)) return false;
  if (value.type === "bye") return value.reason === undefined || typeof value.reason === "string";
  if (value.type === "description") {
    const description = value.description;
    return (
      isObject(description) &&
      typeof description.type === "string" &&
      SDP_TYPES.has(description.type) &&
      (description.sdp === undefined || typeof description.sdp === "string")
    );
  }
  if (value.type === "candidate") {
    return value.candidate === null || (isObject(value.candidate) && typeof value.candidate.candidate === "string");
  }
  return false;
}

export interface WebSocketSignalingOptions {
  /** Wraps a signal into your message (add `to`, `room`, …). Default `{ type: "rtc", signal }`. */
  encode?: (signal: RTCSignal) => unknown;
  /** Takes the signal out of an incoming message, or `null`. Default: reads `{ type: "rtc", signal }`. */
  decode?: (message: unknown) => unknown;
}

/** Uses a `useWebSocket` connection (JSON messages) as the signaling channel. */
export function webSocketSignaling(
  socket: Pick<UseWebSocketReturn<unknown>, "sendJson" | "onMessage">,
  options: WebSocketSignalingOptions = {},
): SignalingChannel {
  const encode = options.encode ?? ((signal: RTCSignal) => ({ type: "rtc", signal }));
  const decode =
    options.decode ?? ((message: unknown) => (isObject(message) && message.type === "rtc" ? message.signal : null));
  return {
    send: (signal) => {
      socket.sendJson(encode(signal));
    },
    onSignal: (handler) =>
      socket.onMessage((message) => {
        let value = message;
        if (typeof value === "string") {
          try {
            value = JSON.parse(value);
          } catch {
            return;
          }
        }
        const signal = decode(value);
        if (isRTCSignal(signal)) handler(signal);
      }),
  };
}

function isStream(media: MediaStreamConstraints | MediaStream): media is MediaStream {
  return "getTracks" in media;
}

function browserMediaDevices(): MediaDevices | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
}

export function useWebRTC(options: UseWebRTCOptions): UseWebRTCReturn {
  const PeerConnection =
    options.RTCPeerConnection ?? (typeof RTCPeerConnection === "undefined" ? undefined : RTCPeerConnection);
  const devices = options.mediaDevices ?? browserMediaDevices();
  const polite = options.polite ?? false;
  const useChannels = options.dataChannels ?? true;
  const { signaling } = options;

  const callState = signal<CallState>("idle");
  const connectionState = signal<RTCPeerConnectionState>("new");
  const peer = signal<RTCPeerConnection | null>(null);
  const localStream = signal<MediaStream | null>(null);
  const remoteStream = signal<MediaStream | null>(null);
  const remoteTracks = signal<MediaStreamTrack[]>([]);
  const audioEnabled = signal(true);
  const videoEnabled = signal(true);
  const isScreenSharing = signal(false);
  const channelOpen = signal(false);
  const data = signal<string | ArrayBuffer | null>(null);
  const error = signal<unknown>(null);
  const incomingEvent = createEventHook<void>();
  const messageEvent = createEventHook<string | ArrayBuffer>();
  const hangUpEvent = createEventHook<string | undefined>();

  let pc: RTCPeerConnection | null = null;
  let messages: RTCDataChannel | null = null;
  let filesChannel: RTCDataChannel | null = null;
  let makingOffer = false;
  let ignoreOffer = false;
  let settingRemoteAnswer = false;
  let iceRestarted = false;
  let pendingOffer: RTCSessionDescriptionInit | null = null;
  let pendingCandidates: RTCIceCandidateInit[] = [];
  let ownsLocalStream = false;
  let screenStream: MediaStream | null = null;
  let cameraTrack: MediaStreamTrack | null = null;
  let signals: Promise<void> = Promise.resolve();

  const files: FileTransfers | null =
    options.files === false || !useChannels
      ? null
      : createFileTransfers(
          {
            send: (frame) => {
              const channel = filesChannel;
              if (!channel || channel.readyState !== "open") throw new Error("The call is not connected");
              if (typeof frame === "string") channel.send(frame);
              else channel.send(frame);
            },
            ready: () =>
              new Promise<void>((resolveReady, rejectReady) => {
                const channel = filesChannel;
                // A closed channel is reported by `send`; here only the buffer level matters.
                if (!channel || channel.bufferedAmount <= FILE_BUFFER_THRESHOLD) {
                  resolveReady();
                  return;
                }
                channel.addEventListener("bufferedamountlow", () => resolveReady(), { once: true });
                channel.addEventListener("close", () => rejectReady(new Error("The call is not connected")), {
                  once: true,
                });
              }),
          },
          options.files,
        );

  const sendSignal = (value: RTCSignal) => {
    try {
      signaling.send(value);
    } catch (reason) {
      error.value = reason;
    }
  };

  const sendDescription = (connection: RTCPeerConnection) => {
    const description = connection.localDescription;
    if (description) sendSignal({ type: "description", description: description.toJSON() });
  };

  const updateCallState = (connection: RTCPeerConnection) => {
    const state = connection.connectionState;
    connectionState.value = state;
    if (state === "connected") {
      iceRestarted = false;
      callState.value = "connected";
    } else if (state === "disconnected") {
      callState.value = "reconnecting";
    } else if (state === "failed") {
      callState.value = "failed";
    }
  };

  const openChannels = (connection: RTCPeerConnection) => {
    if (!useChannels) return;
    // Pre-agreed ids: both sides create the same channels, no one has to go first.
    const messageChannel = connection.createDataChannel("sinwan-messages", { negotiated: true, id: 0 });
    messageChannel.binaryType = "arraybuffer";
    messageChannel.onopen = () => {
      if (messages === messageChannel) channelOpen.value = true;
    };
    messageChannel.onclose = () => {
      if (messages === messageChannel) channelOpen.value = false;
    };
    messageChannel.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      data.value = event.data;
      messageEvent.trigger(event.data);
    };
    messages = messageChannel;

    const fileChannel = connection.createDataChannel("sinwan-files", { negotiated: true, id: 1 });
    fileChannel.binaryType = "arraybuffer";
    fileChannel.bufferedAmountLowThreshold = FILE_BUFFER_THRESHOLD;
    fileChannel.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      files?.accept(event.data);
    };
    fileChannel.onclose = () => files?.failPending("Connection closed");
    filesChannel = fileChannel;
  };

  const createPeer = (): RTCPeerConnection | null => {
    if (!PeerConnection) {
      error.value = new Error("WebRTC is not available");
      return null;
    }
    const connection = new PeerConnection(options.configuration);
    pc = connection;
    peer.value = connection;
    connectionState.value = connection.connectionState;
    iceRestarted = false;

    connection.onicecandidate = ({ candidate }) => {
      sendSignal({ type: "candidate", candidate: candidate ? candidate.toJSON() : null });
    };
    connection.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        await connection.setLocalDescription();
        sendDescription(connection);
      } catch (reason) {
        error.value = reason;
      } finally {
        makingOffer = false;
      }
    };
    connection.ontrack = ({ track, streams }) => {
      remoteStream.value = streams[0] ?? remoteStream.value;
      remoteTracks.value = [...remoteTracks.value.filter((current) => current.id !== track.id), track];
      track.addEventListener("ended", () => {
        remoteTracks.value = remoteTracks.value.filter((current) => current !== track);
      });
    };
    connection.onconnectionstatechange = () => updateCallState(connection);
    connection.oniceconnectionstatechange = () => {
      // One ICE restart (new candidates over the same call) before giving up.
      if (connection.iceConnectionState === "failed" && !iceRestarted) {
        iceRestarted = true;
        callState.value = "reconnecting";
        connection.restartIce();
      }
    };
    return connection;
  };

  const addLocalTracks = (connection: RTCPeerConnection) => {
    const stream = localStream.value;
    if (!stream) return;
    for (const track of stream.getTracks()) connection.addTrack(track, stream);
  };

  const attachMedia = async (media: MediaStreamConstraints | MediaStream | null | undefined) => {
    if (media == null) return true;
    if (isStream(media)) {
      localStream.value = media;
      ownsLocalStream = false;
    } else {
      if (!devices) {
        error.value = new Error("Media devices are not available");
        return false;
      }
      try {
        localStream.value = await devices.getUserMedia(media);
        ownsLocalStream = true;
      } catch (reason) {
        error.value = reason;
        return false;
      }
    }
    const stream = localStream.value;
    audioEnabled.value = stream.getAudioTracks().some((track) => track.enabled);
    videoEnabled.value = stream.getVideoTracks().some((track) => track.enabled);
    return true;
  };

  const flushCandidates = async (connection: RTCPeerConnection) => {
    const queued = pendingCandidates;
    pendingCandidates = [];
    for (const candidate of queued) await connection.addIceCandidate(candidate);
  };

  const release = () => {
    files?.failPending("Call ended");
    messages?.close();
    filesChannel?.close();
    messages = null;
    filesChannel = null;
    channelOpen.value = false;
    pc?.close();
    pc = null;
    peer.value = null;
    connectionState.value = "closed";
    if (ownsLocalStream) stopStream(localStream.value);
    stopStream(screenStream);
    screenStream = null;
    cameraTrack = null;
    isScreenSharing.value = false;
    localStream.value = null;
    remoteStream.value = null;
    remoteTracks.value = [];
    pendingOffer = null;
    pendingCandidates = [];
    makingOffer = false;
    ignoreOffer = false;
    settingRemoteAnswer = false;
  };

  const handleDescription = async (description: RTCSessionDescriptionInit) => {
    const connection = pc;
    if (!connection) {
      // An offer while nobody is calling: ring, and keep it for `answer()`.
      if (description.type !== "offer") return;
      // Ringing (a newer offer replaces the old one), or our own `start()` is
      // still opening the media: keep it; `start()` answers it (no collision,
      // we have not offered yet).
      if (callState.value === "ringing" || callState.value === "calling") {
        pendingOffer = description;
        return;
      }
      // Idle, ended or failed (without a connection, those are the only other states).
      pendingOffer = description;
      pendingCandidates = [];
      callState.value = "ringing";
      incomingEvent.trigger();
      return;
    }
    const readyForOffer = !makingOffer && (connection.signalingState === "stable" || settingRemoteAnswer);
    const collision = description.type === "offer" && !readyForOffer;
    ignoreOffer = !polite && collision;
    if (ignoreOffer) return;
    settingRemoteAnswer = description.type === "answer";
    await connection.setRemoteDescription(description);
    settingRemoteAnswer = false;
    await flushCandidates(connection);
    if (description.type === "offer") {
      await connection.setLocalDescription();
      sendDescription(connection);
    }
  };

  const handleCandidate = async (candidate: RTCIceCandidateInit | null) => {
    if (candidate === null) return;
    const connection = pc;
    if (!connection || !connection.remoteDescription) {
      pendingCandidates.push(candidate);
      return;
    }
    try {
      await connection.addIceCandidate(candidate);
    } catch (reason) {
      // Candidates of an offer we chose to ignore are expected to fail.
      if (!ignoreOffer) throw reason;
    }
  };

  const handleSignal = async (value: RTCSignal) => {
    if (value.type === "bye") {
      if (callState.value === "idle" || callState.value === "ended") return;
      release();
      callState.value = "ended";
      hangUpEvent.trigger(value.reason);
      return;
    }
    if (value.type === "description") await handleDescription(value.description);
    else await handleCandidate(value.candidate);
  };

  // One signal at a time, in arrival order.
  const stopSignaling = signaling.onSignal((value) => {
    signals = signals
      .then(() => handleSignal(value))
      .catch((reason: unknown) => {
        error.value = reason;
      });
  });

  const canStart = () => callState.value === "idle" || callState.value === "ended" || callState.value === "failed";

  const start = async (media?: MediaStreamConstraints | MediaStream | null) => {
    if (!canStart()) return false;
    if (pc) release();
    error.value = null;
    callState.value = "calling";
    if (!(await attachMedia(media))) {
      callState.value = "idle";
      return false;
    }
    const connection = createPeer();
    if (!connection) {
      release();
      callState.value = "idle";
      return false;
    }
    // The other side called at the same moment, before our connection existed.
    if (pendingOffer) return acceptOffer(connection);
    openChannels(connection);
    addLocalTracks(connection);
    return true;
  };

  /** Answers `pendingOffer` on `connection`. The offer goes first, so answering never starts a competing offer. */
  const acceptOffer = async (connection: RTCPeerConnection) => {
    const offer = pendingOffer;
    pendingOffer = null;
    callState.value = "connecting";
    try {
      if (offer) await connection.setRemoteDescription(offer);
      await flushCandidates(connection);
      openChannels(connection);
      addLocalTracks(connection);
      await connection.setLocalDescription();
      sendDescription(connection);
      return true;
    } catch (reason) {
      error.value = reason;
      release();
      callState.value = "failed";
      return false;
    }
  };

  const answer = async (media?: MediaStreamConstraints | MediaStream | null) => {
    if (callState.value !== "ringing" || !pendingOffer) return false;
    error.value = null;
    if (!(await attachMedia(media))) return false;
    const connection = createPeer();
    if (!connection) return false;
    return acceptOffer(connection);
  };

  const hangUp = (reason?: string) => {
    if (callState.value === "idle" || callState.value === "ended") return;
    sendSignal(reason === undefined ? { type: "bye" } : { type: "bye", reason });
    release();
    callState.value = "ended";
  };

  const reject = (reason = "Declined") => {
    if (callState.value === "ringing") hangUp(reason);
  };

  const setAudioEnabled = (enabled: boolean) => {
    for (const track of localStream.value?.getAudioTracks() ?? []) track.enabled = enabled;
    audioEnabled.value = enabled;
  };

  const setVideoEnabled = (enabled: boolean) => {
    for (const track of localStream.value?.getVideoTracks() ?? []) track.enabled = enabled;
    if (cameraTrack) cameraTrack.enabled = enabled;
    videoEnabled.value = enabled;
  };

  const videoSender = (connection: RTCPeerConnection) =>
    connection.getSenders().find((sender) => sender.track?.kind === "video");

  const stopScreenShare = async () => {
    const connection = pc;
    const screen = screenStream;
    if (!screen) return;
    screenStream = null;
    isScreenSharing.value = false;
    const screenTrack = screen.getVideoTracks()[0];
    const sender = connection?.getSenders().find((current) => current.track === screenTrack);
    if (connection && sender) {
      if (cameraTrack) await sender.replaceTrack(cameraTrack);
      else connection.removeTrack(sender);
    }
    cameraTrack = null;
    stopStream(screen);
  };

  const shareScreen = async (displayOptions: DisplayMediaStreamOptions = { video: true }) => {
    const connection = pc;
    if (!connection || !devices || screenStream) return false;
    let screen: MediaStream;
    try {
      screen = await devices.getDisplayMedia(displayOptions);
    } catch (reason) {
      error.value = reason;
      return false;
    }
    const track = screen.getVideoTracks()[0];
    if (!track) {
      stopStream(screen);
      return false;
    }
    const sender = videoSender(connection);
    if (sender) {
      cameraTrack = sender.track;
      await sender.replaceTrack(track);
    } else {
      connection.addTrack(track, screen);
    }
    screenStream = screen;
    isScreenSharing.value = true;
    // The browser's own "Stop sharing" button ends the track.
    track.addEventListener("ended", () => void stopScreenShare());
    return true;
  };

  const switchDevice = async (kind: "audio" | "video", deviceId: string) => {
    const stream = localStream.value;
    if (!devices || !stream) return false;
    let fresh: MediaStream;
    try {
      fresh = await devices.getUserMedia({ [kind]: { deviceId: { exact: deviceId } } });
    } catch (reason) {
      error.value = reason;
      return false;
    }
    const track = (kind === "audio" ? fresh.getAudioTracks() : fresh.getVideoTracks())[0];
    if (!track) {
      stopStream(fresh);
      return false;
    }
    const old = (kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks())[0];
    track.enabled = kind === "audio" ? audioEnabled.value : videoEnabled.value;
    const sender = pc?.getSenders().find((current) => current.track === old);
    if (kind === "video" && isScreenSharing.value) cameraTrack = track;
    else if (sender) await sender.replaceTrack(track);
    if (old) {
      stream.removeTrack(old);
      if (ownsLocalStream) old.stop();
    }
    stream.addTrack(track);
    return true;
  };

  const send = (message: DataChannelMessage) => {
    const channel = messages;
    if (!channel || channel.readyState !== "open") return false;
    if (typeof message === "string") channel.send(message);
    else if (message instanceof Blob) channel.send(message);
    else channel.send(message);
    return true;
  };

  if (options.autoClose ?? true) {
    tryOnUnmounted(() => {
      hangUp();
      stopSignaling();
    });
  }

  return {
    callState,
    connectionState,
    peer,
    localStream,
    remoteStream,
    remoteTracks,
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    channelOpen,
    data,
    error,
    start,
    answer,
    reject,
    hangUp,
    setAudioEnabled,
    setVideoEnabled,
    toggleAudio: () => setAudioEnabled(!audioEnabled.value),
    toggleVideo: () => setVideoEnabled(!videoEnabled.value),
    shareScreen,
    stopScreenShare,
    switchDevice,
    send,
    sendJson: (value) => send(JSON.stringify(value)),
    sendFile: (blob, meta) => {
      if (!files) return Promise.reject(new Error("File transfer is disabled"));
      return files.send(blob, meta);
    },
    transfers: files?.transfers ?? signal<FileTransfer[]>([]),
    cancelTransfer: (id) => files?.cancel(id),
    clearTransfers: () => files?.clear(),
    onIncoming: incomingEvent.on,
    onMessage: messageEvent.on,
    onFile: files?.onFile ?? createEventHook<FileTransfer>().on,
    onRemoteHangUp: hangUpEvent.on,
  };
}
