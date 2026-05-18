# React Static APIs

> Status: **Phase 5 — complete.** All entries below are imported from `sinwan/react-static`.

Build-time prerendering APIs that emit fully-resolved HTML. Designed for static-site generators, ISR-style edge caches, and offline-page generation. Authored from scratch on top of Sinwan's `streamHydratableNode` — no `react` / `react-dom` dependency.

---

## Postponed State

React prerender / resume protocol uses a `postponed` value to checkpoint a render that paused on a Suspense boundary. **Sinwan's renderer is single-pass and never postpones** — every prerender adapter therefore returns `postponed: undefined` and every `resumeAndPrerender*` call simply re-renders from scratch. The `postponedState` argument is accepted for API compatibility and ignored.

---

## APIs

### `prerender(node, options?)`

**Signature:** `function prerender(node: ReactNode, options?: PrerenderOptions): Promise<PrerenderResult>`

Where `PrerenderResult` is:

```ts
{
  prelude: ReadableStream<Uint8Array>;
  postponed: undefined; // always undefined in Sinwan
}
```

**Description:** Prerenders a React/Sinwan element tree to a fully-resolved HTML stream at build time. Returns a `ReadableStream<Uint8Array>` containing the complete HTML with hydration markers. The stream includes any bootstrap scripts specified in options. The `postponed` field is always `undefined` since Sinwan's renderer never pauses.

**Options:**

| Option                   | Type                                    | Description                                |
| ------------------------ | --------------------------------------- | ------------------------------------------ |
| `bootstrapScriptContent` | `string`                                | Inlined `<script>` after markup            |
| `bootstrapScripts`       | `string \| BootstrapScriptDescriptor[]` | Script URLs to inject                      |
| `bootstrapModules`       | `string \| BootstrapScriptDescriptor[]` | Module script URLs                         |
| `signal`                 | `AbortSignal`                           | Aborts the prerender and propagates reason |
| `onError`                | `(err: unknown) => string \| undefined` | Diagnostic hook; can return error digest   |
| `identifierPrefix`       | `string`                                | Reserved for future use                    |
| `progressiveChunkSize`   | `number`                                | Reserved for future use                    |

**Returns:** `Promise<PrerenderResult>` — stream of HTML bytes.

**Reactivity:** Pass-through to `streamHydratableNode` + bootstrap appender.

**Example:**

```ts
import { prerender } from "sinwan/react-static";

// Basic static site generation
const buildStaticPages = async () => {
  const routes = ["/", "/about", "/contact"];

  for (const route of routes) {
    const page = await import(`./pages${route}.tsx`);
    const { prelude } = await prerender(<page.default />, {
      bootstrapModules: ["/client.js"],
    });

    // Write to dist
    const filename = route === "/" ? "index" : route;
    await Bun.write(`dist/${filename}.html`, prelude);
  }
};

// With error handling and analytics
const prerenderWithDiagnostics = async (Component: ComponentType) => {
  const errors: unknown[] = [];

  const { prelude } = await prerender(<Component />, {
    bootstrapScriptContent: `
      window.__BUILD_TIME__ = ${Date.now()};
      window.__PRERENDERED__ = true;
    `,
    bootstrapModules: ["/client.js"],
    onError: (err) => {
      errors.push(err);
      console.error("Prerender error:", err);
      return `build-error-${errors.length}`;
    },
  });

  if (errors.length > 0) {
    console.warn(`Prerender completed with ${errors.length} errors`);
  }

  return prelude;
};

// With abort signal for timeouts
const prerenderWithTimeout = async (Component: ComponentType, timeoutMs: number) => {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort(new Error(`Prerender exceeded ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const { prelude } = await prerender(<Component />, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return prelude;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
};

// Process stream chunk by chunk
const prerenderWithProgress = async (Component: ComponentType) => {
  const { prelude } = await prerender(<Component />);

  let totalBytes = 0;
  const reader = prelude.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.length;
    process.stdout.write(`\rRendered ${totalBytes} bytes...`);
  }

  console.log(`\nTotal: ${totalBytes} bytes`);
};
```

---

### `prerenderToNodeStream(node, options?)`

**Signature:** `function prerenderToNodeStream(node: ReactNode, options?: PrerenderOptions): Promise<PrerenderToNodeStreamResult>`

Where `PrerenderToNodeStreamResult` is:

```ts
{
  prelude: NodeJS.ReadableStream;
  postponed: undefined;
}
```

**Description:** Same as `prerender`, but returns a Node.js `ReadableStream` instead of a Web API `ReadableStream`. The stream is built via `Readable.fromWeb()` so it works on Bun and Node 18+. Useful when piping to Node.js APIs or writing to files using Node streams.

**Options:** Same as `prerender`.

**Returns:** `Promise<PrerenderToNodeStreamResult>` — Node.js readable stream.

**Reactivity:** Pass-through + `Readable.fromWeb` conversion.

**Example:**

```ts
import { prerenderToNodeStream } from "sinwan/react-static";
import { createWriteStream, createGzip } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createServer } from "node:http";

// Write to file with Node streams
const buildPage = async (route: string) => {
  const { prelude } = await prerenderToNodeStream(<Page route={route} />, {
    bootstrapModules: ["/client.js"],
  });

  const writeStream = createWriteStream(`dist/${route}.html`);
  prelude.pipe(writeStream);

  await new Promise((resolve, reject) => {
    prelude.on("end", resolve);
    prelude.on("error", reject);
  });
};

// Compress during build
const buildCompressed = async () => {
  const { prelude } = await prerenderToNodeStream(<App />);

  const gzip = createGzip();
  const output = createWriteStream("dist/index.html.gz");

  await pipeline(prelude, gzip, output);
};

// Serve with Node HTTP server
createServer(async (req, res) => {
  const { prelude } = await prerenderToNodeStream(<App url={req.url} />);

  res.setHeader("content-type", "text/html");
  prelude.pipe(res);
});

// Transform stream during build
import { Transform } from "node:stream";

const buildWithTransform = async () => {
  const { prelude } = await prerenderToNodeStream(<App />);

  const minifyTransform = new Transform({
    transform(chunk, encoding, callback) {
      // Simple minification: remove extra whitespace
      const minified = chunk.toString().replace(/>\s+</g, "><");
      callback(null, minified);
    },
  });

  const output = createWriteStream("dist/index.html");
  prelude.pipe(minifyTransform).pipe(output);
};
```

---

### `resumeAndPrerender(node, postponedState, options?)`

**Signature:** `function resumeAndPrerender(node: ReactNode, postponedState: unknown, options?: PrerenderOptions): Promise<PrerenderResult>`

**Description:** React uses this to resume a prerender that was previously paused. Since Sinwan's renderer never pauses (single-pass), this adapter simply re-renders `node` from scratch. The `postponedState` argument is accepted for API compatibility and ignored. Returns the same result shape as `prerender`.

**Parameters:**

| Parameter        | Type               | Description                     |
| ---------------- | ------------------ | ------------------------------- |
| `node`           | `ReactNode`        | Element tree to prerender       |
| `postponedState` | `unknown`          | Ignored (for API compatibility) |
| `options`        | `PrerenderOptions` | Same options as `prerender`     |

**Returns:** `Promise<PrerenderResult>` — stream of HTML bytes.

**Reactivity:** Best-effort fresh prerender.

**Example:**

```ts
import { resumeAndPrerender, prerender } from "sinwan/react-static";

// Compatibility with React's two-phase prerender pattern
const twoPhaseBuild = async () => {
  // Phase 1: Initial prerender (Sinwan completes immediately)
  const phase1 = await prerender(<App />);

  // Save postponed state (undefined in Sinwan, but saved for compatibility)
  await savePostponedState(phase1.postponed);

  // Phase 2: Resume (Sinwan re-renders from scratch)
  const phase2 = await resumeAndPrerender(<App />, phase1.postponed, {
    bootstrapModules: ["/client.js"],
  });

  return phase2.prelude;
};

// Migration from React prerender
const migrateFromReact = async () => {
  // Old React code might have saved postponed state
  const savedState = await loadSavedPostponedState();

  // Works in Sinwan (re-renders fresh)
  const { prelude } = await resumeAndPrerender(<App />, savedState);

  return prelude;
};
```

---

### `resumeAndPrerenderToNodeStream(node, postponedState, options?)`

**Signature:** `function resumeAndPrerenderToNodeStream(node: ReactNode, postponedState: unknown, options?: PrerenderOptions): Promise<PrerenderToNodeStreamResult>`

**Description:** Node stream variant of `resumeAndPrerender`. Re-renders `node` from scratch since Sinwan doesn't support postponed state. Returns a Node.js `ReadableStream`.

**Parameters:**

| Parameter        | Type               | Description                     |
| ---------------- | ------------------ | ------------------------------- |
| `node`           | `ReactNode`        | Element tree to prerender       |
| `postponedState` | `unknown`          | Ignored (for API compatibility) |
| `options`        | `PrerenderOptions` | Same options as `prerender`     |

**Returns:** `Promise<PrerenderToNodeStreamResult>` — Node.js readable stream.

**Reactivity:** Best-effort fresh prerender (Node stream).

**Example:**

```ts
import { resumeAndPrerenderToNodeStream } from "sinwan/react-static";
import { createWriteStream } from "node:fs";

// Build with Node streams using resume pattern
const buildWithResume = async () => {
  const postponedState = await loadPostponedState();

  const { prelude } = await resumeAndPrerenderToNodeStream(
    <App />,
    postponedState,
    {
      bootstrapModules: ["/client.js"],
    }
  );

  const output = createWriteStream("dist/index.html");
  prelude.pipe(output);

  return new Promise((resolve, reject) => {
    prelude.on("end", resolve);
    prelude.on("error", reject);
  });
};
```

---

## BootstrapScriptDescriptor

When specifying `bootstrapScripts` or `bootstrapModules`, you can use either a string URL or a descriptor object:

```ts
type BootstrapScriptDescriptor = {
  src: string;
  integrity?: string;
  crossOrigin?: "anonymous" | "use-credentials";
};
```

**Example:**

```ts
const { prelude } = await prerender(<App />, {
  bootstrapScripts: [
    // Simple string
    "/vendor.js",
    // With integrity for SRI
    {
      src: "/app.js",
      integrity: "sha384-abc123...",
      crossOrigin: "anonymous",
    },
  ],
  bootstrapModules: [
    {
      src: "/entry.js",
      integrity: "sha384-def456...",
    },
  ],
});
```

---

## Complete Static Site Generator Example

```ts
import { prerender } from "sinwan/react-static";
import { readdir, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// Full SSG implementation
class StaticSiteGenerator {
  constructor(
    private pagesDir: string,
    private outputDir: string
  ) {}

  async build() {
    const pages = await this.discoverPages();

    for (const page of pages) {
      await this.buildPage(page);
    }

    console.log(`Built ${pages.length} pages`);
  }

  private async discoverPages(): Promise<string[]> {
    const files = await readdir(this.pagesDir, { recursive: true });
    return files
      .filter(f => f.endsWith(".tsx"))
      .map(f => f.replace(/\.tsx$/, "").replace(/index$/, ""));
  }

  private async buildPage(route: string) {
    const module = await import(`${this.pagesDir}/${route}.tsx`);
    const Component = module.default;

    // Fetch data if getStaticProps exists
    const props = module.getStaticProps
      ? await module.getStaticProps({ params: {} })
      : {};

    const { prelude } = await prerender(<Component {...props} />, {
      bootstrapScriptContent: `
        window.__ROUTE__ = ${JSON.stringify(route)};
        window.__PROPS__ = ${JSON.stringify(props)};
      `,
      bootstrapModules: ["/client.js"],
    });

    const outputPath = `${this.outputDir}/${route || "index"}.html`;
    await mkdir(dirname(outputPath), { recursive: true });
    await Bun.write(outputPath, prelude);

    console.log(`Built: ${route || "index"}.html`);
  }
}

// Usage
const ssg = new StaticSiteGenerator("./pages", "./dist");
await ssg.build();
```

---

## ISR (Incremental Static Regeneration) Pattern

```ts
import { prerender } from "sinwan/react-static";

// ISR implementation
class ISRRenderer {
  private cache = new Map<string, { html: ReadableStream; expires: number }>();

  async render(route: string, ttlSeconds: number = 60) {
    const cached = this.cache.get(route);

    if (cached && cached.expires > Date.now()) {
      return cached.html;
    }

    // Regenerate
    const module = await import(`./pages/${route}.tsx`);
    const { prelude } = await prerender(<module.default />, {
      bootstrapModules: ["/client.js"],
    });

    // Store in cache
    this.cache.set(route, {
      html: prelude,
      expires: Date.now() + ttlSeconds * 1000,
    });

    return prelude;
  }
}
```

---

## Request-Scoped Abort

`prerender` registers `options.signal` (or `null`) as the request-scoped signal exposed by `cacheSignal()`, so any `cacheSignal()` call inside the prerender loaders sees the same `AbortSignal` and bails out when the build cancels.

**Example:**

```ts
import { prerender, cache, cacheSignal } from "sinwan/react-static";

// Data loading with cancellation support
const fetchData = cache(async (endpoint: string) => {
  const res = await fetch(`https://api.example.com/${endpoint}`, {
    signal: cacheSignal(), // Uses the build's AbortSignal
  });
  return res.json();
});

const DataPage = async () => {
  const data = await fetchData("content");
  return <Content data={data} />;
};

// Build with timeout
const buildWithTimeout = async () => {
  const controller = new AbortController();

  // Cancel after 30 seconds
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const { prelude } = await prerender(<DataPage />, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return prelude;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("Build timed out");
    }
    throw err;
  }
};
```

---

## SSR Safety / Reactivity

| API                              | SSR         | Reactivity decision                                         |
| -------------------------------- | ----------- | ----------------------------------------------------------- |
| `prerender`                      | static-only | pass-through to `streamHydratableNode` + bootstrap appender |
| `prerenderToNodeStream`          | static-only | pass-through + `Readable.fromWeb`                           |
| `resumeAndPrerender`             | static-only | best-effort fresh prerender                                 |
| `resumeAndPrerenderToNodeStream` | static-only | best-effort fresh prerender (Node stream)                   |
