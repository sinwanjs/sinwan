<div align="left">
  <table border="0">
    <tr>
      <td>
        <img src="https://avatars.githubusercontent.com/u/252437356?s=400&v=4" alt="Sinwan Logo" width="150" />
      </td>
      <td align="left">
        <h1>Sinwan</h1>
        <p>A fast reactive UI library for JSX, fine-grained reactivity, SSR, and hydration.</p>
        <p>
          <a href="https://github.com/sinwanjs/sinwan-ui/stargazers"><img src="https://img.shields.io/github/stars/sinwanjs/sinwan-ui?style=flat-square&color=ffce3b" alt="GitHub stars" /></a>
          <a href="https://www.npmjs.com/package/sinwan"><img src="https://img.shields.io/npm/dt/sinwan?style=flat-square&color=42b883" alt="NPM Downloads" /></a>
          <a href="./LICENSE"><img src="https://img.shields.io/npm/l/sinwan?style=flat-square&color=35495e" alt="License" /></a>
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
    "jsxImportSource": "sinwan"
  }
}
```

## Quick Start

```tsx
import { createComponent, mount, signal } from "sinwan";

const Counter = createComponent(() => {
  const count = signal(0);

  return (
    <button onClick={() => (count.value += 1)}>
      Count: {count}
    </button>
  );
});

mount(Counter, document.getElementById("app")!);
```

## Features

- Fine-grained reactivity: `signal`, `computed`, `effect`, `batch`, `nextTick`
- JSX runtime: `sinwan/jsx-runtime` and `sinwan/jsx-dev-runtime`
- Components: `createComponent`, lifecycle hooks, provide/inject, `<Show>`, `<For>`
- DOM renderer: reactive text, attributes, events, refs, namespaces, and cleanup
- Server rendering: `renderToString`, `streamPage`, hydratable strings and streams
- Hydration: reuse server-rendered DOM with `hydrate`

## SSR and Hydration

```tsx
// Server
import { renderToHydratableString } from "sinwan/server";

const html = await renderToHydratableString(App, { initial: 5 });
```

```tsx
// Client
import { hydrate } from "sinwan";

hydrate(App, document.getElementById("app")!, { initial: 5 });
```

<div align="center">
  <h2>Sinwan Pro</h2>

  <p>Take your Sinwan applications to the next level with <b>Sinwan Pro</b>. Designed for enterprise-grade performance and developer productivity.</p>

  <p>
    🚀 <b>Premium Components</b> • 🛠️ <b>Enterprise Support</b> • ⚡ <b>Advanced SSR Patterns</b> • 🎨 <b>Custom Theming</b>
  </p>

  <a href="https://sinwanjs.com/pro">
    <img src="https://img.shields.io/badge/Learn%20more%20about%20Sinwan%20Pro-000000?style=for-the-badge&logo=pro&logoColor=white" alt="Learn more about Sinwan Pro" />
  </a>
</div>

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
