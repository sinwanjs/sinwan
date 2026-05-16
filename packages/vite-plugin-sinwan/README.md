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
import { sinwan, sinwanTreeShake } from "vite-plugin-sinwan";

export default defineConfig({
  plugins: [
    sinwan(), // JSX transform (must come first)
    sinwanTreeShake(), // Optional: aggressive tree-shaking
  ],
});
```

## Plugins

### `sinwan()`

Compiles JSX to Sinwan's optimised template format. It runs with
`enforce: "pre"` so it executes before any other transform.

- Static DOM elements are hoisted to module-level template objects.
- Dynamic expressions are replaced with `_$createTemplate` calls.
- Component calls (capitalised tags) are left untouched for the runtime.

### `sinwanTreeShake(options?)`

Scans the entire project to discover which Sinwan exports are actually
used, then removes unused exports (and their internal dependencies) from
the final bundle.

**Options**

| Option               | Type                 | Default                                   | Description                          |
| -------------------- | -------------------- | ----------------------------------------- | ------------------------------------ |
| `include`            | `string \| string[]` | `**/*.{js,jsx,ts,tsx}`                    | Files to scan for Sinwan usage       |
| `exclude`            | `string \| string[]` | `node_modules/**`, `dist/**`, `**/*.d.ts` | Files to skip                        |
| `verbose`            | `boolean`            | `true`                                    | Print a summary after bundling       |
| `rewriteBundle`      | `boolean`            | `true`                                    | Mutate the bundle or only report     |
| `forceKeep`          | `string[]`           | `undefined`                               | Extra export names to preserve       |
| `sinwanChunkPattern` | `RegExp \| string`   | `/sinwan/`                                | Pattern used to locate Sinwan chunks |

**Example with options**

```ts
sinwanTreeShake({
  verbose: true,
  forceKeep: ["_$createTemplate"], // runtime internal accessed by compiled code
});
```

## How the tree-shaker works

1. **Detection** — During the transform phase every user source file is
   scanned for:
   - Named / namespace / aliased imports from `sinwan`
   - JSX tags (`<Show>`, `<For>`, etc.)
   - Direct function calls (`createSignal()`, `mount()`, etc.)

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

## Type-check & test

```bash
# Type-check the plugin source
npx tsc --noEmit

# Run the test suite
bun test
```
