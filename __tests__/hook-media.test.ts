import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { cc } from "../src/component/create.ts";
import { pickMimeType, useMediaRecorder } from "../src/hook/use-media-recorder.ts";
import { stopStream, useUserMedia } from "../src/hook/use-user-media.ts";
import { mount } from "../src/renderer/mount.ts";
import {
  FakeMediaDevices,
  FakeMediaRecorder,
  asMediaDevices,
  asMediaRecorder,
  asStream,
  resetFakes,
  settle,
  streamOf,
} from "./support/realtime-fakes.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withComponent(setup: () => void) {
  const win = new Window({ url: "http://localhost" });
  const doc = win.document as unknown as Document;
  Object.assign(globalThis, { document: doc, window: win });
  const app = mount(
    cc(() => {
      setup();
      return null;
    }),
    doc.createElement("div") as unknown as Element,
  );
  return () => {
    app.unmount();
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
  };
}

beforeEach(() => resetFakes());

describe("useUserMedia", () => {
  it("opens the devices on start, lists devices, and stops tracks", async () => {
    const devices = new FakeMediaDevices();
    devices.deviceList = [{ kind: "videoinput", deviceId: "cam", label: "Camera", groupId: "g" } as MediaDeviceInfo];
    const media = useUserMedia({ mediaDevices: asMediaDevices(devices) });
    expect(media.isActive.value).toBe(false);
    const stream = await media.start();
    expect(devices.userMediaCalls).toEqual([{ audio: true, video: true }]);
    expect(media.isActive.value).toBe(true);
    expect(media.stream.value).toBe(stream);
    expect(media.devices.value.map((d) => d.deviceId)).toEqual(["cam"]);

    // Starting again stops the previous tracks first.
    const tracks = stream?.getTracks() ?? [];
    await media.start({ audio: true });
    expect(tracks.every((track) => (track as unknown as { stopped: boolean }).stopped)).toBe(true);
    expect(devices.userMediaCalls.at(-1)).toEqual({ audio: true });

    media.stop();
    expect(media.stream.value).toBeNull();
  });

  it("keeps the error when the user refuses, and when there are no media devices", async () => {
    const devices = new FakeMediaDevices();
    devices.failUserMedia = new DOMException("Permission denied", "NotAllowedError");
    const media = useUserMedia({ mediaDevices: asMediaDevices(devices), constraints: { audio: true } });
    expect(await media.start()).toBeNull();
    expect((media.error.value as DOMException).name).toBe("NotAllowedError");

    const original = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    try {
      const none = useUserMedia();
      expect(await none.start()).toBeNull();
      expect(none.error.value).toEqual(new Error("Media devices are not available"));
      expect(await none.refreshDevices()).toEqual([]);
    } finally {
      if (original) Object.defineProperty(navigator, "mediaDevices", original);
      else Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("refreshes devices on devicechange, starts immediately when asked, and cleans up on unmount", async () => {
    const devices = new FakeMediaDevices();
    let media: ReturnType<typeof useUserMedia> | undefined;
    let kept: ReturnType<typeof useUserMedia> | undefined;
    const unmount = withComponent(() => {
      media = useUserMedia({ mediaDevices: asMediaDevices(devices), immediate: true });
      kept = useUserMedia({ mediaDevices: asMediaDevices(devices), autoStop: false });
    });
    await settle();
    expect(media?.isActive.value).toBe(true);
    devices.deviceList = [{ kind: "audioinput", deviceId: "mic", label: "", groupId: "g" } as MediaDeviceInfo];
    devices.emit("devicechange");
    await settle();
    expect(media?.devices.value.map((d) => d.deviceId)).toEqual(["mic"]);

    await kept?.start({ video: true });
    const stream = media?.stream.value;
    unmount();
    expect(media?.stream.value).toBeNull();
    expect(stream?.getTracks().every((track) => (track as unknown as { stopped: boolean }).stopped)).toBe(true);
    expect(kept?.stream.value).not.toBeNull();
    expect(devices.removed).toEqual(["devicechange", "devicechange"]);
  });

  it("stopStream tolerates no stream", () => {
    stopStream(null);
    stopStream(undefined);
    const stream = streamOf("audio");
    stopStream(asStream(stream));
    expect(stream.tracks[0]?.stopped).toBe(true);
  });
});

describe("useMediaRecorder", () => {
  const Recorder = asMediaRecorder(FakeMediaRecorder);

  it("picks the first supported MIME type", () => {
    const supported = (type: string) => type === "audio/ogg";
    expect(pickMimeType(["audio/webm", "audio/ogg"], supported)).toBe("audio/ogg");
    expect(pickMimeType("audio/ogg", supported)).toBe("audio/ogg");
    expect(pickMimeType(undefined, supported)).toBe("");
    expect(pickMimeType(["video/mp4"], supported)).toBe("");
  });

  it("records, pauses and resumes, tracks duration and resolves the recording", async () => {
    const recorder = useMediaRecorder({ MediaRecorder: Recorder, mimeType: ["audio/ogg", "audio/webm"], timeslice: 100 });
    const chunks: Blob[] = [];
    const stops: Blob[] = [];
    recorder.onData((chunk) => chunks.push(chunk));
    recorder.onStop((blob) => stops.push(blob));
    expect(recorder.start(asStream(streamOf("audio")))).toBe(true);
    expect(recorder.start(asStream(streamOf("audio")))).toBe(false);
    const fake = FakeMediaRecorder.instances[0];
    expect(fake?.options.mimeType).toBe("audio/webm");
    expect(fake?.timeslice).toBe(100);
    expect(recorder.state.value).toBe("recording");
    expect(recorder.mimeType.value).toBe("audio/webm");

    fake?.emit(new Blob(["part"]));
    fake?.emit(new Blob([]));
    await wait(30);
    recorder.pause();
    expect(recorder.state.value).toBe("paused");
    const pausedAt = recorder.duration.value;
    expect(pausedAt).toBeGreaterThanOrEqual(25);
    await wait(30);
    recorder.pause();
    recorder.resume();
    recorder.resume();
    expect(recorder.state.value).toBe("recording");
    await wait(220);
    expect(recorder.duration.value).toBeGreaterThan(pausedAt);

    const result = await recorder.stop();
    expect(await result?.text()).toBe("partend");
    expect(result?.type).toBe("audio/webm");
    expect(recorder.blob.value).toBe(result);
    expect(recorder.state.value).toBe("inactive");
    expect(chunks).toHaveLength(2);
    expect(stops).toEqual([result as Blob]);
    expect(await recorder.stop()).toBeNull();
  });

  it("reports when recording is impossible or the recorder fails", async () => {
    const original = Reflect.get(globalThis, "MediaRecorder");
    Reflect.deleteProperty(globalThis, "MediaRecorder");
    try {
      const none = useMediaRecorder();
      expect(none.start(asStream(streamOf("audio")))).toBe(false);
      expect(none.error.value).toEqual(new Error("MediaRecorder is not available"));
      none.pause();
      none.resume();
    } finally {
      if (original !== undefined) Reflect.set(globalThis, "MediaRecorder", original);
    }

    FakeMediaRecorder.throwOnCreate = new DOMException("Unsupported", "NotSupportedError");
    const refused = useMediaRecorder({ MediaRecorder: Recorder });
    expect(refused.start(asStream(streamOf("audio")))).toBe(false);
    expect((refused.error.value as DOMException).name).toBe("NotSupportedError");
    FakeMediaRecorder.throwOnCreate = null;

    const recorder = useMediaRecorder({ MediaRecorder: Recorder });
    recorder.start(asStream(streamOf("audio")));
    const fake = FakeMediaRecorder.instances.at(-1);
    fake?.onerror?.(new Event("error"));
    expect(recorder.error.value).toBeInstanceOf(Event);
    expect(recorder.mimeType.value).toBe("");
    // A finished recorder can start again.
    await recorder.stop();
    expect(recorder.start(asStream(streamOf("audio")))).toBe(true);
    await recorder.stop();
  });

  it("stops recording when its component unmounts", () => {
    let recorder: ReturnType<typeof useMediaRecorder> | undefined;
    let idle: ReturnType<typeof useMediaRecorder> | undefined;
    const unmount = withComponent(() => {
      recorder = useMediaRecorder({ MediaRecorder: Recorder });
      idle = useMediaRecorder({ MediaRecorder: Recorder });
    });
    recorder?.start(asStream(streamOf("audio")));
    unmount();
    expect(FakeMediaRecorder.instances[0]?.state).toBe("inactive");
    expect(idle?.state.value).toBe("inactive");
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});
