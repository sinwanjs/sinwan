# HTML Escaping & Security

Sinwan **automatically escapes** every user-supplied value when rendering on the server. The only way to inject raw HTML is to opt in explicitly. This page documents every escape rule and every escape hatch.

```ts
import {
  escapeHtml,
  safeHtml,
  raw,
  HtmlEscapedString,
  isSafeHtml,
} from "sinwan";
```

---

## What gets escaped

When a value reaches the **server renderer** (`renderToString`, `streamPage`, `renderToHydratableString`):

| Source                                             | Escaped?                                 |
| -------------------------------------------------- | ---------------------------------------- |
| Text child (`<div>{userInput}</div>`)              | **Yes**                                  |
| Attribute value (`<a href={url}>`)                 | **Yes**                                  |
| `dangerouslySetInnerHTML.__html`                   | **No — trusted**                         |
| `safeHtml(...)` / `raw(...)` (`HtmlEscapedString`) | **No — trusted**                         |
| Numbers                                            | Not escaped (passed through `String(n)`) |
| Booleans / `null` / `undefined`                    | Become `""`                              |

The five characters that matter inside HTML are escaped:

| Char | Replacement |
| ---- | ----------- |
| `&`  | `&amp;`     |
| `<`  | `&lt;`      |
| `>`  | `&gt;`      |
| `"`  | `&quot;`    |
| `'`  | `&#39;`     |

This is the same set as React, Solid, and the OWASP HTML escape table.

---

## `escapeHtml(value)` — manual escape

```ts
function escapeHtml(value: unknown): string;
```

Use it any time you build HTML strings yourself:

```ts
import { escapeHtml } from "sinwan";

const html = `<div>${escapeHtml(comment.body)}</div>`;
```

Behaviour:

| Input                          | Output                               |
| ------------------------------ | ------------------------------------ |
| `null`, `undefined`, `boolean` | `""`                                 |
| `number`                       | `String(n)` (no escape needed)       |
| `HtmlEscapedString`            | underlying `value` (already trusted) |
| anything else                  | `String(v)` then escaped             |

`escapeHtml` is **runtime-agnostic**:

- On **Bun**, it uses the native `Bun.escapeHTML` (very fast C implementation).
- Everywhere else (Node, Deno, Cloudflare Workers, browsers), it falls back to a portable regex-based implementation that short-circuits when nothing needs escaping.

---

## `safeHtml(html)` / `raw(html)` — opt into trusted HTML

```ts
function safeHtml(html: string): HtmlEscapedString;
function raw(html: string): HtmlEscapedString;
```

`safeHtml` and `raw` are aliases. They wrap a string in an `HtmlEscapedString` instance, which both renderers and `escapeHtml` recognise as **already trusted** and pass through verbatim.

```tsx
import { safeHtml } from "sinwan";

const Card = cc<{ markdown: string }>(({ markdown }) => {
  // Compile markdown server-side; the result is trusted HTML.
  const html = compileMarkdown(markdown);
  return <div class="md">{safeHtml(html)}</div>;
});
```

> **Critical:** `safeHtml`/`raw` mark the string as trusted. **Never** pass user input — only output of trusted compilers (markdown, syntax highlighter, sanitiser).

### `HtmlEscapedString`

```ts
class HtmlEscapedString extends String {
  readonly value: string;
  toString(): string; // returns this.value
}
```

It’s a `String` subclass, so it behaves like a string in template literals and concatenation. The renderer detects it via `instanceof HtmlEscapedString`.

### `isSafeHtml(value)`

```ts
function isSafeHtml(value: unknown): value is HtmlEscapedString;
```

Type guard, useful in conditional rendering or sanitisers:

```ts
if (isSafeHtml(value)) {
  // value is already-trusted HTML
}
```

---

## `dangerouslySetInnerHTML`

The React-compatible escape hatch is also supported:

```tsx
<div dangerouslySetInnerHTML={{ __html: trustedHtml }} />
```

Rules:

- `__html` must be a `string`. Any other type is ignored.
- The string is inserted **as-is**, no escaping. Same trust requirement as `safeHtml`.
- The renderer ignores any **children** of an element that has `dangerouslySetInnerHTML`. Don’t mix the two.

The prefix is intentionally long — let it stay visible in code review.

---

## Attribute escaping

Attribute values are always escaped on the server, regardless of source. Boolean attributes are special:

```tsx
<button disabled={true} />        // → <button disabled>
<button disabled={false} />       // → <button>
<button disabled={null} />        // → <button>
<button data-msg={user.msg} />    // → <button data-msg="escaped value">
```

Attribute names are emitted verbatim except for two aliases:

| JSX         | HTML    |
| ----------- | ------- |
| `className` | `class` |
| `htmlFor`   | `for`   |

Other React aliases (`tabIndex`, `crossOrigin`) are normalised by the **client renderer** but not by the SSR renderer. Either spell them with the JSX form (which TS likes) or with the lowercase HTML form — both work in the browser.

---

## Client-side: no double-escape

The client renderer (`mount`/`hydrate`) does **not** escape on its own — it sets `text.data = String(value)` and passes raw values to `setAttribute`/`setProperty`. The browser handles escaping for you when reading `.textContent` or `setAttribute`.

`escapeHtml` is therefore primarily for the **server** path; calling it on the client just produces an entity-encoded string you can stick into `innerHTML` if you’re building HTML manually.

---

## Recipe: rendering markdown safely

```ts
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { safeHtml } from "sinwan";

function MarkdownView({ source }: { source: string }) {
  const dirty = marked.parse(source) as string;
  const clean = DOMPurify.sanitize(dirty);
  return <div class="md">{safeHtml(clean)}</div>;
}
```

The flow is:

1. `marked` produces HTML (potentially with unsafe content if the source is user-controlled).
2. `DOMPurify.sanitize` strips dangerous tags/attrs.
3. `safeHtml(...)` marks the result as trusted so Sinwan doesn’t double-escape.

---

## Recipe: showing user input as text

Just interpolate it — no escape call needed:

```tsx
const Comment = ({ body }: { body: string }) => <p class="comment">{body}</p>;
```

`body` will be HTML-escaped automatically when this tree is rendered server-side (or set as `textContent` client-side, which is also safe).

---

## Recipe: building HTML strings manually

```ts
import { escapeHtml } from "sinwan";

function listItem(text: string) {
  return `<li>${escapeHtml(text)}</li>`;
}
```

`escapeHtml` is idempotent on `HtmlEscapedString` — wrapping with `safeHtml` then escaping returns the inner trusted string.

---

## Common mistakes

| Mistake                                                | Fix                                                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Concatenating user data into `dangerouslySetInnerHTML` | Use plain text children (auto-escaped)                                                                               |
| Using `safeHtml` on `marked.parse(input)` directly     | Sanitise (`DOMPurify`) before wrapping                                                                               |
| Building URLs by string concat (`href={`/x?q=${q}`}`)  | Use `URL` API + interpolation; values are still escaped, but build them safely                                       |
| Forgetting that numbers aren’t escaped                 | If you embed numbers in HTML, that’s fine; if you embed user-supplied strings parsed as numbers, validate them first |

---

## Performance

- **Bun**: native escape is the fastest option (millions of ops/sec).
- **Node ≥ 22**: V8 short-circuits the regex test; the portable implementation is competitive with React’s.
- **All runtimes**: a no-escape-needed string returns early without allocating a new one.

---

## See also

- [`07-jsx.md`](./07-jsx.md) — `dangerouslySetInnerHTML` in JSX
- [`09-ssr.md`](./09-ssr.md) — full SSR API
- [`12-runtime-compat.md`](./12-runtime-compat.md) — where `escapeHtml` runs and how
