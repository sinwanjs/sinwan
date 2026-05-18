# vite-plugin-sinwan

Official Vite plugin for the Sinwan UI framework. Provides JSX compilation
and an optional aggressive tree-shaking pass that prunes unused Sinwan
exports from the production bundle.

## Installation

```bash
bun add -d vite-plugin-sinwan
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { sinwan } from "vite-plugin-sinwan";

export default defineConfig({
  plugins: [
    sinwan({
      treeShake: { verbose: true },
    }),
  ],
});
```

## `sinwan(options?)`

Single plugin that handles both JSX compilation and tree-shaking.

### Options

| Option      | Type                         | Default | Description                                   |
| ----------- | ---------------------------- | ------- | --------------------------------------------- |
| `hoist`     | `boolean`                    | `true`  | Enable template hoisting in the JSX transform |
| `treeShake` | `boolean \| TreeShakeConfig` | `false` | Enable aggressive post-bundle tree-shaking    |

When `treeShake` is `true`, the plugin uses default settings. Pass an
object for fine-grained control:

```ts
sinwan({
  hoist: true,
  treeShake: {
    verbose: true,
    forceKeep: ["_$createTemplate"], // runtime internal accessed by compiled code
  },
});
```

### Tree-shake configuration

| Option               | Type                 | Default                                   | Description                          |
| -------------------- | -------------------- | ----------------------------------------- | ------------------------------------ |
| `include`            | `string \| string[]` | `**/*.{js,jsx,ts,tsx}`                    | Files to scan for Sinwan usage       |
| `exclude`            | `string \| string[]` | `node_modules/**`, `dist/**`, `**/*.d.ts` | Files to skip                        |
| `verbose`            | `boolean`            | `true`                                    | Print a summary after bundling       |
| `forceKeep`          | `string[]`           | `undefined`                               | Extra export names to preserve       |
| `sinwanChunkPattern` | `RegExp \| string`   | `/sinwan/`                                | Pattern used to locate Sinwan chunks |

### Simple usage patterns

```ts
// JSX transform only (backward compatible)
sinwan();

// JSX + tree-shaking with defaults
sinwan({ treeShake: true });

// JSX + tree-shaking with custom config
sinwan({
  treeShake: { verbose: true, forceKeep: ["_$createTemplate"] },
});
```

## How it works

### JSX compilation

Runs with `enforce: "pre"` so it executes before any other transform.

- Static DOM elements are hoisted to module-level template objects.
- Dynamic expressions are replaced with `_$createTemplate` calls.
- Component calls (capitalised tags) are left untouched for the runtime.

### Tree-shaking (when enabled)

1. **Detection** — During the `transform` phase every user source file is
   scanned for:
   - Named / namespace / aliased imports from `sinwan`
   - JSX tags (`<Show>`, `<For>`, etc.)
   - Direct function calls (`signal()`, `mount()`, etc.)

2. **Dependency resolution** — The set of directly-used identifiers is
   expanded with a hand-maintained dependency graph that covers:
   - Transitive export dependencies (e.g. `mount` needs `renderNodeToDOM`)
   - Always-keep core primitives (`signal`, `effect`, `Fragment`, …)
   - Renderer helpers required by any rendering function

3. **AST filtering** — In `generateBundle` the plugin locates the
   Sinwan chunk, parses it with Babel, builds a reference graph between
   top-level bindings, computes the reachable set, and removes:
   - Unused export specifiers
   - Unused top-level declarations
   - Orphaned import statements

4. **Reporting** — When `verbose: true` the plugin prints the original
   and optimised chunk size, plus counts of kept / removed exports and
   bindings.

## Advanced: standalone tree-shake plugin

The separate `sinwanTreeShake()` export is still available if you need
it as an independent plugin (e.g. when using a different JSX transform):

```ts
import { sinwanTreeShake } from "vite-plugin-sinwan";
```

## Type-check & test

```bash
# Type-check the plugin source
npx tsc --noEmit

# Run the test suite
bun test
```
