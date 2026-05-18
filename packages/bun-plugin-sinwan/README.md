# bun-plugin-sinwan

A professional Bun plugin for Sinwan UI — enables seamless JSX transformation, template hoisting, and advanced tree-shaking for highly optimized builds.  
Integrates smoothly with Bun's build toolchain and Sinwan's fine-grained reactivity.

## Features

- Fast, zero-config JSX transform for Sinwan
- Template hoisting for maximum runtime performance
- Tree-shaking of unused imports/components
- Designed for Bun projects (TypeScript, ESM, JSX)
- Supports SSR and hydration-ready output

## Install

```sh
bun add bun-plugin-sinwan
```

## Usage

Add to your `bunfig.toml` or use via Bun's plugin system:

```toml
[plugins]
"bun-plugin-sinwan" = "*"
```

Or in your build script:

```ts
import { sinwan } from "bun-plugin-sinwan";

await Bun.build({
  entrypoints: ["src/index.tsx"],
  plugins: [sinwan()],
  outdir: "dist",
});
```

### JSX Configuration

The plugin automatically configures Bun to use the automatic JSX runtime with Sinwan as the import source by default:

```ts
import { sinwan } from "bun-plugin-sinwan";

await Bun.build({
  entrypoints: ["src/index.tsx"],
  plugins: [sinwan()],
  outdir: "dist",
});
```

If you need to override the default JSX configuration:

```ts
sinwan({
  jsx: {
    runtime: "classic",
    importSource: "react",
  },
});
```

## License

MIT © Mohammed Ben Cheikh
