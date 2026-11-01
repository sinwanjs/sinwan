/**
 * SinwanJS Hooks — useMediaRecorder
 *
 * Records a stream (voice notes, video messages) into a `Blob`, with
 * pause/resume and a live duration. The blob can be sent with
 * `useWebSocket().sendFile` or `useWebRTC().sendFile`.
 */

import { signal, type Signal } from "../reactivity/index.ts";
import { createEventHook, tryOnUnmounted, type EventHookOn } from "./shared.ts";

export interface UseMediaRecorderOptions {
  /** A MIME type, or candidates in order of preference (the first supported one wins). */
  mimeType?: string | string[];
  audioBitsPerSecond?: number;
  videoBitsPerSecond?: number;
  /** Emit a chunk (`onData`) every this many ms instead of only at the end. */
  timeslice?: number;
  /** A different `MediaRecorder` constructor (tests, polyfills). */
  MediaRecorder?: typeof MediaRecorder;
}

export interface UseMediaRecorderReturn {
  state: Signal<RecordingState>;
  /** The last finished recording. */
  blob: Signal<Blob | null>;
  /** Recorded time in ms, excluding pauses; live while recording. */
  duration: Signal<number>;
  /** The MIME type in use (after picking from candidates). */
  mimeType: Signal<string>;
  error: Signal<unknown>;
  start(stream: MediaStream): boolean;
  /** Stops and resolves with the recording (`null` when not recording). */
  stop(): Promise<Blob | null>;
  pause(): void;
  resume(): void;
  /** A chunk is available (every `timeslice`, and the last one on stop). */
  onData: EventHookOn<Blob>;
  /** A recording finished. */
  onStop: EventHookOn<Blob>;
}

/** The first candidate the recorder supports, or `""` to let the browser choose. */
export function pickMimeType(
  candidates: string | string[] | undefined,
  isSupported: (type: string) => boolean,
): string {
  const list = typeof candidates === "string" ? [candidates] : (candidates ?? []);
  return list.find((type) => isSupported(type)) ?? "";
}

export function useMediaRecorder(options: UseMediaRecorderOptions = {}): UseMediaRecorderReturn {
  const Recorder = options.MediaRecorder ?? (typeof MediaRecorder === "undefined" ? undefined : MediaRecorder);
  const state = signal<RecordingState>("inactive");
  const blob = signal<Blob | null>(null);
  const duration = signal(0);
  const mimeType = signal("");
  const error = signal<unknown>(null);
  const dataEvent = createEventHook<Blob>();
  const stopEvent = createEventHook<Blob>();

  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let ticker: ReturnType<typeof setInterval> | undefined;
  let runningSince = 0;
  let elapsed = 0;
  let finished: ((value: Blob | null) => void) | null = null;

  const tick = () => {
    duration.value = elapsed + (state.value === "recording" ? Date.now() - runningSince : 0);
  };

  const start = (stream: MediaStream) => {
    if (!Recorder) {
      error.value = new Error("MediaRecorder is not available");
      return false;
    }
    if (recorder && recorder.state !== "inactive") return false;
    const type = pickMimeType(options.mimeType, (candidate) => Recorder.isTypeSupported(candidate));
    try {
      recorder = new Recorder(stream, {
        mimeType: type || undefined,
        audioBitsPerSecond: options.audioBitsPerSecond,
        videoBitsPerSecond: options.videoBitsPerSecond,
      });
    } catch (reason) {
      error.value = reason;
      return false;
    }
    const current = recorder;
    chunks = [];
    elapsed = 0;
    duration.value = 0;
    error.value = null;
    mimeType.value = current.mimeType || type;
    current.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      chunks.push(event.data);
      dataEvent.trigger(event.data);
    };
    current.onerror = (event) => {
      error.value = event;
    };
    current.onstop = () => {
      tick();
      clearInterval(ticker);
      state.value = "inactive";
      const result = new Blob(chunks, { type: mimeType.value });
      blob.value = result;
      stopEvent.trigger(result);
      finished?.(result);
      finished = null;
    };
    current.start(options.timeslice);
    state.value = "recording";
    runningSince = Date.now();
    ticker = setInterval(tick, 200);
    return true;
  };

  const stop = () => {
    const current = recorder;
    if (!current || current.state === "inactive") return Promise.resolve(null);
    return new Promise<Blob | null>((resolveStop) => {
      finished = resolveStop;
      current.stop();
    });
  };

  const pause = () => {
    if (recorder?.state !== "recording") return;
    recorder.pause();
    elapsed += Date.now() - runningSince;
    state.value = "paused";
    tick();
  };

  const resume = () => {
    if (recorder?.state !== "paused") return;
    recorder.resume();
    runningSince = Date.now();
    state.value = "recording";
  };

  tryOnUnmounted(() => {
    clearInterval(ticker);
    if (recorder && recorder.state !== "inactive") recorder.stop();
  });

  return {
    state,
    blob,
    duration,
    mimeType,
    error,
    start,
    stop,
    pause,
    resume,
    onData: dataEvent.on,
    onStop: stopEvent.on,
  };
}
