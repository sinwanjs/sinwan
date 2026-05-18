# eslint-plugin-sinwan

ESLint plugin enforcing the Sinwan state-getter standard:

- Outside JSX — call getters explicitly: `count()`
- Inside JSX — pass getters directly: `{count}`

## Install

```
bun add -D eslint-plugin-sinwan
# or: npm i -D eslint-plugin-sinwan
```

## Usage (flat config)

```js
// eslint.config.js
import sinwan from "eslint-plugin-sinwan";

export default [
  {
    plugins: { sinwan },
    rules: {
      "sinwan/state-getter-must-be-called": "error",
      "sinwan/no-state-getter-call-in-jsx": "error",
    },
  },
];
```

## Rules

- sinwan/state-getter-must-be-called — Error when a state getter (from `useState`/`useReducer`) is used outside JSX without being called.
  - Catches: `console.log(count)`, `if (count) {}`, `items.length` (use `items().length`), `count + 1`.

- sinwan/no-state-getter-call-in-jsx — Error when a state getter is called in JSX.
  - Catches: `<div>{count()}</div>`, `<input value={count()} />`, `<For each={items()} />`.

## Options

Both rules accept an optional `sources` array to recognise custom getter-producing hooks:

```json
{
  "sinwan/state-getter-must-be-called": [
    "error",
    { "sources": ["useState", "useReducer", "useSignalState"] }
  ],
  "sinwan/no-state-getter-call-in-jsx": [
    "error",
    { "sources": ["useState", "useReducer", "useSignalState"] }
  ]
}
```

## Build

```
bun run build
```
