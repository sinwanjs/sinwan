/**
 * SinwanJS Hooks — useUserMedia
 *
 * Microphone and camera access: the stream, the device list (kept current on
 * `devicechange`), and stopping every track when the component unmounts.
 */

import { computed, signal, type Computed, type Signal } from "../reactivity/index.ts";
import { tryOnUnmounted } from "./shared.ts";

export interface UseUserMediaOptions {
  /** Default `{ audio: true, video: true }`. */
  constraints?: MediaStreamConstraints;
  /** Ask for the stream at once. Default `false`: browsers prompt, so start on a user action. */
  immediate?: boolean;
  /** Stop the tracks when the calling component unmounts. Default `true`. */
  autoStop?: boolean;
  /** A different `navigator.mediaDevices` (tests). */
  mediaDevices?: MediaDevices;
}

export interface UseUserMediaReturn {
  stream: Signal<MediaStream | null>;
  isActive: Computed<boolean>;
  /** Why the last `start` failed (`NotAllowedError` when the user refused). */
  error: Signal<unknown>;
  devices: Signal<MediaDeviceInfo[]>;
  /** Opens the devices (stopping any previous stream); `null` on failure. */
  start(constraints?: MediaStreamConstraints): Promise<MediaStream | null>;
  stop(): void;
  /** Re-reads the device list (labels appear once permission is granted). */
  refreshDevices(): Promise<MediaDeviceInfo[]>;
}

/** Stops every track of `stream`, releasing the camera and microphone. */
export function stopStream(stream: MediaStream | null | undefined): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

function browserMediaDevices(): MediaDevices | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
}

export function useUserMedia(options: UseUserMediaOptions = {}): UseUserMediaReturn {
  const devicesApi = options.mediaDevices ?? browserMediaDevices();
  const stream = signal<MediaStream | null>(null);
  const isActive = computed(() => stream.value !== null);
  const error = signal<unknown>(null);
  const devices = signal<MediaDeviceInfo[]>([]);

  const stop = () => {
    stopStream(stream.value);
    stream.value = null;
  };

  const refreshDevices = async () => {
    if (!devicesApi) return [];
    devices.value = await devicesApi.enumerateDevices();
    return devices.value;
  };

  const start = async (constraints = options.constraints ?? { audio: true, video: true }) => {
    if (!devicesApi) {
      error.value = new Error("Media devices are not available");
      return null;
    }
    stop();
    try {
      const next = await devicesApi.getUserMedia(constraints);
      stream.value = next;
      error.value = null;
      await refreshDevices();
      return next;
    } catch (reason) {
      error.value = reason;
      return null;
    }
  };

  const onDeviceChange = () => void refreshDevices();
  devicesApi?.addEventListener("devicechange", onDeviceChange);

  if (options.immediate) void start();
  tryOnUnmounted(() => {
    devicesApi?.removeEventListener("devicechange", onDeviceChange);
    if (options.autoStop ?? true) stop();
  });

  return { stream, isActive, error, devices, start, stop, refreshDevices };
}
