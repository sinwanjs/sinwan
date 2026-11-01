<div align="left">
  <table border="0" width="100%" align="center">
    <tr>
      <td width="150" align="left">
        <img src="https://avatars.githubusercontent.com/u/252437356?s=400&v=4" alt="Sinwan Logo" width="150" />
      </td>
      <td align="left">
        <h1>Sinwan</h1>
        <p>A fast reactive UI library for JSX, fine-grained reactivity, SSR, and hydration.</p>
        <p>
          <a href="https://github.com/sinwanjs/sinwan/stargazers"><img src="https://img.shields.io/github/stars/sinwanjs/sinwan.svg?color=ffce3b&label=stars&logo=github" alt="GitHub stars" /></a>
          <a href="https://www.npmjs.com/package/sinwan"><img src="https://img.shields.io/npm/dm/sinwan?color=42b883&label=downloads&logo=npm" alt="NPM Downloads" /></a>
          <a href="./LICENSE"><img src="https://img.shields.io/npm/l/sinwan?color=35495e&label=license" alt="License" /></a>
        </p>
      </td>
    </tr>
  </table>
</div>

<br clear="both" />

Sinwan gives you signals, component lifecycle hooks, a direct DOM renderer, and a React-shaped JSX runtime without a virtual DOM.

## Why Sinwan?

Sinwan combines the developer experience of React's JSX with the performance of fine-grained reactivity — no virtual DOM diffing, no reconciliation overhead. Signals drive surgical DOM updates directly.

- **No virtual DOM** — components return plain element trees; the renderer patches the DOM at the exact node that changed.
- **Fine-grained reactivity** — `signal`, `computed`, and `effect` track dependencies automatically. Only the effects that read a changed signal re-run.
- **React-compatible JSX** — use the same JSX syntax, component props, and TypeScript types you already know. `jsxImportSource: "sinwan"` and you're done.
- **SSR + hydration** — `renderToString` / `streamPage` on the server, `hydrate` on the client. Hydratable strings and streaming supported.
- **Single dependency** — only `csstype` at runtime. No React, no Solid, no Vue.

## Install

```sh
npm install sinwan
```

```sh
bun add sinwan
```

## JSX Setup

Use the automatic JSX runtime:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "sinwan",
  },
}
```

## Quick Start

```tsx
import { cc } from "sinwan/component";
import { signal } from "sinwan/reactivity";
import { mount } from "sinwan/renderer";

const Counter = cc(() => {
  const count = signal(0);

  return <button onClick={() => (count.value += 1)}>Count: {count}</button>;
});

mount(Counter, document.getElementById("app")!);
```

## Features

- Fine-grained reactivity: `signal`, `computed`, `effect`, `batch`, `nextTick`, `untrack`, `on`, `observable`
- JSX runtime: `sinwan/jsx-runtime` and `sinwan/jsx-dev-runtime`
- Components: `cc`, lifecycle hooks, provide/inject, `<Show>`, `<For>` ...
- DOM renderer: reactive text, attributes, events, refs, namespaces, and cleanup
- Server rendering: `renderToString`, `streamPage`, hydratable strings and streams
- Hydration: reuse server-rendered DOM with `hydrate`
- Hooks (`sinwan/hook`): `useFetch`; realtime `useWebSocket`, `useWebRTC` (calls, screen share, data-channel messages and files), `useUserMedia`, `useMediaRecorder`

## Loading fallbacks without flashes

`<Show>` and `<Suspense>` can wait before showing their fallback. Loads that finish within the delay go straight from nothing to the content; slower ones show the fallback until the content is ready.

```tsx
import { Show } from "sinwan/control-flow";
import { Suspense } from "sinwan/react";

// The skeleton appears only if the data takes longer than 300 ms.
<Show when={orders.data.value} fallback={<OrdersSkeleton />} fallbackDelay={300}>
  {(page) => <OrdersTable page={page} />}
</Show>

// Same for lazy components and other async children.
<Suspense fallback={<Spinner />} fallbackDelay={300}>
  <Reports />
</Suspense>
```

Each new falsy period (or suspension) waits again. Server rendering ignores the delay and renders as before; hydration adopts the server HTML.

## Realtime hooks

`sinwan/hook` covers WebSockets, WebRTC calls and media. Every hook returns signals, works outside components, and cleans up when the calling component unmounts.

```tsx
import { useWebSocket, useWebRTC, useUserMedia, useMediaRecorder, webSocketSignaling } from "sinwan/hook";
import { effect } from "sinwan/reactivity";

// WebSocket: status, last message, queued sends, reconnect, heartbeat, files.
const socket = useWebSocket("wss://example.com/ws", {
  autoReconnect: true, // 1 s, 2 s, 4 s… up to 30 s
  heartbeat: { message: "ping", responseMessage: "pong" },
  parse: (message) => JSON.parse(String(message)), // validate untrusted input here
});
socket.sendJson({ type: "hello" }); // queued until the socket opens
socket.onMessage((message) => console.log(message));
await socket.sendFile(imageFile); // chunked, with progress in socket.transfers
socket.onFile((file) => show(URL.createObjectURL(file.blob!)));

// WebRTC: 1:1 audio/video calls; signaling over the socket above.
const call = useWebRTC({
  signaling: webSocketSignaling(socket), // or your own { send, onSignal }
  polite: isCallee, // exactly one side of a call is polite
  configuration: { iceServers: [{ urls: "stun:stun.example.com" }] },
});
call.onIncoming(() => call.answer({ audio: true, video: true })); // callState: "ringing"
await call.start({ audio: true, video: true }); // or start() for data only
call.toggleAudio();
await call.shareScreen();
call.send("hi"); // data-channel message
await call.sendFile(photo); // peer to peer, chunked
call.hangUp();
// Show it: <video ref={(el) => effect(() => { if (el) el.srcObject = call.remoteStream.value; })} autoplay playsinline />

// Media: camera/microphone and voice notes.
const media = useUserMedia();
const recorder = useMediaRecorder({ mimeType: ["audio/webm;codecs=opus", "audio/mp4"] });
recorder.start((await media.start({ audio: true }))!);
const note = await recorder.stop(); // Blob, ready for sendFile
```

Files travel as one protocol on both channels (a start frame, binary chunks, an end frame), so a file sent by one Sinwan client is rebuilt by another. Receivers cap the file size (`files.maxFileSize`, default 50 MiB) and the number of files in flight (`files.maxIncoming`, default 4).

## SSR and Hydration

```tsx
// Server
import { renderToHydratableString } from "sinwan/react";

const html = await renderToHydratableString(App, { initial: 5 });
```

```tsx
// Client
import { hydrate } from "sinwan/hydration";

hydrate(App, document.getElementById("app")!, { initial: 5 });
```

## Documentation

- [Documentation v1](https://sinwanjs.com)

## Development

```sh
bun test
bun run typecheck
bun run build
```

## Author

Mohammed Ben Cheikh

## License

MIT - see [LICENSE](./LICENSE).
