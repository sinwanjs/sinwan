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

## Optimized images with `<Img>` (Bun)

`<Img>` from `sinwan/image` renders an `<img>` whose files are optimized by Bun's native `Bun.Image`. It needs the Bun runtime: `bun-plugin-sinwan` 1.1, or Vite started on Bun with `vite-plugin-sinwan` 1.1, both on `sinwan-compiler` 1.3.

```tsx
import { Img } from "sinwan/image";
import shop from "./assets/shop.jpg";

// Optimized at build time (and in the dev server): hashed WebP files, srcset, blur preview.
<Img src="./assets/hero.jpg" alt="Our shop" width={1200} height={800} priority placeholder="blur" />
<Img src={shop} alt="" sizes="(min-width: 1024px) 50vw, 100vw" quality={60} />
<Img src="/photos/team.jpg" alt="The team" width={400} fit="contain" format="avif" />

// Optimized on demand (the src is only known at runtime).
<Img src={product.photoUrl} alt={product.name} width={160} height={160} />
```

**Static sources** are a string literal or an imported image file (JPEG, PNG, WebP, AVIF, HEIC):

- `./x.jpg` is relative to the file, `/x.jpg` is in `public/`, and `@/x.jpg` goes through your aliases.
- Their optimization props must be literals; the compiler reports anything else with its file and line.
- Optimized files are cached in `.sinwan/images/`, so an unchanged image is never processed twice. Bun's bundler emits them with content hashes, so they can be cached forever.

**Runtime sources** (any other string) get a `srcset` that points at the on-demand handler. Add it to your Bun server:

```ts
import { createImageHandler } from "sinwan-compiler/image";

Bun.serve({
  routes: {
    "/_sinwan/image": createImageHandler({
      remotePatterns: [{ protocol: "https", hostname: "cdn.example.com" }],
    }),
  },
});
```

Use `configureImages({ path, deviceSizes, imageSizes, quality })` when the route or sizes differ, or pass a `loader` to use another optimizer.

| Prop | Default | Notes |
| --- | --- | --- |
| `alt` | required | `""` for decorative images. |
| `width`, `height` | from the image | CSS pixels. A runtime source needs `width` (or `fill`). |
| `quality` | `75` | 1–100. |
| `format` | `"auto"` | `auto` is WebP at build and follows `Accept` on demand. Also `webp`, `avif` (needs an OS AV1 encoder), `jpeg`, `png`. |
| `fit` | `"cover"` | `cover`, `contain`, `fill`, `inside`, `outside`. Bun.Image does not crop pixels; `cover` is cropped by `object-fit`. |
| `sizes` | none | Switches to width descriptors (`640w`, …). The image then gets `max-width:100%;height:auto`. |
| `densities` | `[1, 2]` | `x` descriptors when `sizes` is not set. |
| `placeholder` | `"empty"` | `"blur"` paints a ~1.7 KB preview until the image loads. Runtime sources pass `blurDataURL`. |
| `aspectRatio` | none | `1.5`, `"3/2"`, `"3:2"`. |
| `priority` | `false` | Eager, `fetchpriority="high"`, preloaded. Use it for the image at the top of the page. |
| `loading`, `decoding` | `"lazy"`, `"async"` | |
| `fill` | `false` | Fills the positioned parent. |
| `unoptimized` | `false` | Renders `src` as given (SVG, GIF). |
| `loader` | handler | `({ src, width, quality, format }) => url`. |

Type image imports once (for example in `src/env.d.ts`): `declare module "*.jpg" { const src: string; export default src; }`.

With Vite, start it on Bun (`bunx --bun vite`, `bunx --bun vite build`): `vite-plugin-sinwan` 1.1 then runs the same pipeline. Vite on Node fails with an error that says so.

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
