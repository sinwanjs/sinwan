# Sinwan

A small reactive UI library for JSX, fine-grained reactivity, SSR, and hydration.

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
