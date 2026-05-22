import { serve } from "bun";
import { renderToHydratableString } from "sinwan/server";
import { App } from "./App.tsx";
import { watch } from "node:fs";
import { resolve } from "node:path";

const isDev = process.env.NODE_ENV !== "production";

const hmrClientScript = `
<script>
(function() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let ws, pingInterval, reconnectDelay = 200;

  let firstConnect = true;

  function connect() {
    ws = new WebSocket(protocol + '//' + location.host + '/__hmr');

    ws.onopen = function() {
      reconnectDelay = 200;
      pingInterval = setInterval(function() {
        if (ws.readyState === 1) ws.send('ping');
      }, 200);
      if (!firstConnect) location.reload();
      firstConnect = false;
    };

    ws.onmessage = function(e) {
      if (e.data === 'reload') location.reload();
    };

    ws.onclose = function() {
      clearInterval(pingInterval);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };

    ws.onerror = function() {
      console.log('[HMR] WS error, will retry...');
    };
  }

  connect();
})();
</script>
`;

// HTML shell
const shell = (content: string, initialPath: string, data: any) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sinwan SPA</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; }
      nav span:hover { opacity: 0.7; }
    </style>
  </head>
  <body>
    <div id="app">${content}</div>
    <script>window.__INITIAL_PATH__ = "${initialPath}"; window.__INITIAL_DATA__ = ${JSON.stringify(data)};</script>
    <script type="module" src="/spa/client.tsx"></script>
    ${isDev ? hmrClientScript : ""}
  </body>
</html>
`;

const mockDatabases = [
  { name: "users", sizeOnDisk: 1024 * 1024 * 45, empty: false },
  { name: "products", sizeOnDisk: 1024 * 1024 * 128, empty: false },
  { name: "logs", sizeOnDisk: 1024 * 1024 * 512, empty: false },
  { name: "test", sizeOnDisk: 0, empty: true },
];

async function renderRoute(path: string) {
  let data = {};
  if (path === "/") {
    data = { databases: mockDatabases };
  }
  const html = await renderToHydratableString(App, {
    initialPath: path,
    initialData: data,
  });
  return { html, data };
}

let clientBundle: string | null = null;

async function buildClient() {
  const clientPath = import.meta.dir + "/client.tsx";
  const result = await Bun.build({
    entrypoints: [clientPath],
    target: "browser",
    format: "esm",
    minify: !isDev,
  });
  if (!result.success || !result.outputs[0]) {
    throw new Error("Client build failed");
  }
  clientBundle = await result.outputs[0].text();
}

// Build client on startup
if (isDev) buildClient();

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // API routes
  if (path === "/api/dbs") {
    return Response.json({
      success: true,
      databases: mockDatabases,
    });
  }

  // Client bundle — serve from memory cache (instant)
  if (path === "/spa/client.tsx") {
    if (!clientBundle) await buildClient();
    return new Response(clientBundle, {
      headers: { "Content-Type": "application/javascript" },
    });
  }

  // Skip static file requests (favicon, etc.)
  if (path.includes(".") && !path.endsWith(".tsx")) {
    return new Response("Not found", { status: 404 });
  }

  // SSR catch-all
  const { html, data } = await renderRoute(path);
  return new Response(shell(html, path, data), {
    headers: { "Content-Type": "text/html" },
  });
}

const hmrClients = new Set<any>();

if (isDev) {
  const spaDir = resolve(import.meta.dir);
  watch(spaDir, { recursive: true }, async (_event, filename) => {
    if (!filename) return;
    if (filename === "server.ts") return; // exclude server file
    if (
      filename.endsWith(".tsx") ||
      filename.endsWith(".ts") ||
      filename.endsWith(".css")
    ) {
      await buildClient();
      for (const ws of hmrClients) {
        if (ws.readyState === 1) ws.send("reload");
      }
    }
  });
  console.log("[HMR] Watching for file changes...");
}

const server = serve({
  port: 3004,
  fetch(req, server) {
    const url = new URL(req.url);
    if (isDev && url.pathname === "/__hmr") {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined as any;
    }
    return handleRequest(req);
  },
  websocket: {
    open(ws) {
      hmrClients.add(ws);
    },
    close(ws) {
      hmrClients.delete(ws);
    },
    message() {},
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 SPA Server running at ${server.url}`);
console.log(`   Routes: /, /about, /counter`);
