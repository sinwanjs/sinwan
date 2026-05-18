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
import { cc, mount, signal } from "sinwan";

const Counter = cc(() => {
  const count = signal(0);

  return <button onClick={() => (count.value += 1)}>Count: {count}</button>;
});

mount(Counter, document.getElementById("app")!);
```

## Features

- Fine-grained reactivity: `signal`, `computed`, `effect`, `batch`, `nextTick`
- JSX runtime: `sinwan/jsx-runtime` and `sinwan/jsx-dev-runtime`
- Components: `cc`, lifecycle hooks, provide/inject, `<Show>`, `<For>`
- DOM renderer: reactive text, attributes, events, refs, namespaces, and cleanup
- Server rendering: `renderToString`, `streamPage`, hydratable strings and streams
- Hydration: reuse server-rendered DOM with `hydrate`

## SSR and Hydration

```tsx
// Server
import { renderToHydratableString } from "sinwan/react-server";

const html = await renderToHydratableString(App, { initial: 5 });
```

```tsx
// Client
import { hydrate } from "sinwan";

hydrate(App, document.getElementById("app")!, { initial: 5 });
```

## Documentation

- [Documentation v1](./docs/v1/README.md)
- [API reference](./docs/v1/15-api-reference.md)
- [Changelog](./docs/v1/CHANGELOG.md)
- [Troubleshooting](./docs/v1/17-troubleshooting.md)

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
