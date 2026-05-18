# Build & Deploy

This document is for **Sinwan contributors** and anyone wanting to understand how the published `dist/` is produced and consumed. End users don’t need it — `bun add sinwan` already gives you everything.

---

## TL;DR

```bash
bun run build        # full build: types + dev + prod × esm + cjs + shims
bun run build:types  # tsc only (declarations)
bun run clean        # rm -rf dist
bun run typecheck    # tsc --noEmit
bun run test         # bun test
```

The result is a single `dist/` folder ready to be `npm publish`-ed.

---

## Output layout

```
dist/
├── index.js                          ← CJS shim (NODE_ENV branch)
├── index.mjs                         ← ESM fallback (re-exports prod ESM)
├── index.d.ts                        ← types (from tsc)
├── jsx-runtime.{js,mjs,d.ts}
├── jsx-dev-runtime.{js,mjs,d.ts}
├── server.{js,mjs,d.ts}
├── renderer.{js,mjs,d.ts}
│
├── cjs/
│   ├── package.json                  ← {"type":"commonjs","sideEffects":false}
│   ├── index.development.js
│   ├── index.production.min.js
│   ├── jsx/jsx-runtime.{development,production.min}.js
│   ├── jsx/jsx-dev-runtime.{development,production.min}.js
│   ├── server/index.{development,production.min}.js
│   └── renderer/index.{development,production.min}.js
│
├── esm/
│   ├── package.json                  ← {"type":"module","sideEffects":false}
│   └── (same tree as cjs/)
│
└── (rest of d.ts tree from tsc:
   component/, hydration/, jsx/, reactivity/, renderer/, server/, ...)
```

### Why per-folder `package.json` markers?

`dist/cjs/*.js` are CommonJS, `dist/esm/*.js` are ESM. The root `package.json` declares `"type": "commonjs"` (so root `.js` shims work as CJS, like React). To override the type for the `esm/` subtree without renaming all files to `.mjs`, we drop a `package.json` with `{"type":"module"}` next to them. Node and bundlers respect the **nearest** `package.json` for each file. This is the same trick React 19 uses.

---

## The shims

Each public entry point gets three artefacts at the root of `dist/`:

### CJS shim (`dist/index.js`)

Identical pattern to React:

```js
"use strict";

if (process.env.NODE_ENV === "production") {
  module.exports = require("./cjs/index.production.min.js");
} else {
  module.exports = require("./cjs/index.development.js");
}
```

When a CJS consumer (`require('sinwan/component')`) bundles your app, the bundler inlines `process.env.NODE_ENV` and dead-code-eliminates the wrong branch. The result: only the chosen variant ends up in your bundle.

### ESM fallback (`dist/index.mjs`)

```js
export * from "./esm/index.production.min.js";
```

Modern ESM consumers do **not** go through this file: their bundler resolves the package.json `exports` conditions and reaches `dist/esm/index.{development,production.min}.js` directly. The `.mjs` file is a safe fallback for tools that don’t look at conditional exports.

### Type declarations (`dist/index.d.ts`)

Emitted by `tsc -p tsconfig.build.json`. The build emits the full tree of `.d.ts` files preserving the `src/` layout. For entry points whose name doesn’t match the d.ts location (e.g. `sinwan/jsx-runtime` vs `dist/jsx/jsx-runtime.d.ts`), `make-shims.ts` writes a thin re-export at the dist root:

```ts
export * from "./jsx/jsx-runtime";
```

---

## Conditional exports (in `package.json`)

```jsonc
{
  "type": "commonjs",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",

  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": {
        "development": "./dist/esm/index.development.js",
        "production": "./dist/esm/index.production.min.js",
        "default": "./dist/esm/index.production.min.js",
      },
      "require": {
        "development": "./dist/cjs/index.development.js",
        "production": "./dist/cjs/index.production.min.js",
        "default": "./dist/index.js",
      },
      "default": "./dist/index.js",
    },
    "./jsx-runtime": {
      /* same shape */
    },
    "./jsx-dev-runtime": {
      /* same shape */
    },
    "./server": {
      /* same shape */
    },
    "./renderer": {
      /* same shape */
    },
    "./package.json": "./package.json",
  },
}
```

Resolution order, top to bottom:

1. **`types`**: TypeScript reads this for type checking.
2. **`import` vs `require`**: chosen by the _consumer_’s module system.
3. **`development` vs `production`**: chosen by the _bundler_ (Vite, Webpack, etc.).
4. **`default`**: fallback when no condition matched.

This means a Vite app in production gets `dist/esm/index.production.min.js` _directly_; a Node `require('sinwan/component')` gets `dist/component.js` (the CJS shim that branches at runtime).

---

## The build pipeline

`build.ts` (root) orchestrates:

```text
1. rm -rf dist
2. tsc -p tsconfig.build.json   (emit declarations only)
3. tmp-strip "sideEffects" from package.json
4. for each (format ∈ {esm, cjs}, mode ∈ {development, production}):
     bun run scripts/bundle.ts <format> <mode>      (Bun.build sub-process)
5. restore package.json
6. bun run scripts/make-shims.ts                    (write root .js/.mjs/.d.ts shims)
```

### Why a sub-process for the bundling?

Bun’s bundler reads `sideEffects: false` from the package.json **once at process start** and uses it for tree-shaking. With `sideEffects: false` left in place, Bun’s bundler removes the implementations of re-exported symbols from `src/index.ts`, producing files that are valid syntax but `require()`-time `SyntaxError`s. The fix is to:

1. Temporarily delete `sideEffects` from `package.json` on disk.
2. Run the actual bundling in a **fresh** Bun process so it reads the modified file.
3. Restore the original `package.json` afterwards.

`sideEffects: false` is correct for _consumers_ (Webpack/Vite tree-shake unused exports) — we just don’t want Bun’s bundler applying it to _our own_ build.

### `scripts/bundle.ts`

A tiny script that runs `Bun.build` once with the right options for a given (format, mode):

```ts
await Bun.build({
  entrypoints: ENTRYPOINTS, // src/index.ts, src/jsx/jsx-runtime.ts, ...
  root: SRC, // src/
  outdir: `${ROOT}/dist/${format}`,
  target: format === "cjs" ? "node" : "bun",
  format, // "esm" or "cjs"
  splitting: false, // self-contained per-entry bundles
  packages: "external", // peer deps stay external
  sourcemap: isProd ? "external" : "linked",
  minify: isProd
    ? { whitespace: true, syntax: true, identifiers: true }
    : false,
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
    __DEV__: JSON.stringify(!isProd),
  },
  naming: {
    entry: `[dir]/[name].${suffix}.js`,
    chunk: `_chunks/[name]-[hash].js`,
    asset: `_assets/[name]-[hash].[ext]`,
  },
});
```

`define` substitutes `process.env.NODE_ENV` at build time so any future `if (process.env.NODE_ENV === "development") warn(...)` becomes dead code in the production bundle.

### `scripts/make-shims.ts`

Writes the four sets of `<entry>.{js,mjs,d.ts}` shims plus the two `package.json` markers in `dist/cjs/` and `dist/esm/`. The d.ts shim is omitted when the entry name already matches a tsc-emitted file at the dist root.

---

## TypeScript configs

### `tsconfig.json` (base — typecheck only)

- `module: ESNext`, `moduleResolution: Bundler`, `allowImportingTsExtensions: true`
- `noEmit: true` (this config is for IDE / `tsc --noEmit`)
- `paths` map `Sinwan` and `Sinwan/jsx-runtime` to the local source for self-imports
- `strict: true`, `skipLibCheck: true`, `verbatimModuleSyntax: false`

### `tsconfig.build.json` (declarations only)

- `extends: ./tsconfig.json`
- `noEmit: false`, `emitDeclarationOnly: true`
- `declaration: true`, `declarationMap: true`
- `outDir: ./dist`, `rootDir: ./src`
- Inherits `allowImportingTsExtensions` (works fine with `emitDeclarationOnly`)

JS bundling is delegated to Bun’s bundler — `tsc` only produces `.d.ts` files (and `.d.ts.map` source maps for them).

---

## Publishing checklist

```bash
# 1. Make sure tests pass
bun test

# 2. Check the generated build is sane
bun run build

# 3. Inspect dist
ls dist/
node -e "console.log(Object.keys(require('./dist/index.js')).length)"
NODE_ENV=production node -e "console.log(typeof require('./dist/index.js').signal)"

# 4. Bump the version
npm version patch  # or minor / major

# 5. Publish (the prepublishOnly hook reruns build)
npm publish --access public
```

The `files` field in `package.json` already restricts the published tarball to:

```jsonc
{ "files": ["dist", "README.md", "LICENSE"] }
```

---

## Local development

If you want to test Sinwan against another package on your machine:

```bash
# In the sinwan repo:
bun run build

# In the consumer project:
npm install /absolute/path/to/sjs
# or (Bun)
bun add file:/absolute/path/to/sjs
```

Or use `npm link` / `bun link` if you prefer.

---

## Troubleshooting the build

- **Empty `dist/index.development.js` (only re-exports, no impl)** — the `sideEffects` workaround in `build.ts` is missing or incorrect. Confirm that `package.json` is restored after the build.
- **`require()` of dist throws `SyntaxError: Unexpected token 'export'`** — the per-folder `package.json` markers were not written. Re-run `scripts/make-shims.ts`.
- **TypeScript can’t find `sinwan` types** — your `tsconfig.json` needs `moduleResolution: "Bundler"` (or `Node16`/`NodeNext`). Older `Node` resolution doesn’t see `exports`.
- **Vite imports the wrong variant** — check that `process.env.NODE_ENV` is set when you run `vite build` (it is by default; non-default setups may need `--mode production`).

---

## See also

- [`12-runtime-compat.md`](./12-runtime-compat.md) — what runs where
- [`07-jsx.md`](./07-jsx.md) — JSX runtime entries that get bundled
- The `build.ts` and `scripts/` files at the repo root for ground truth
