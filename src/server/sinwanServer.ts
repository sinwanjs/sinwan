import type { ServerWebSocket } from "bun";
import type { Application } from "../core/application";
import { unsignSessionId } from "../modules/session/session-id";
import type { WebSocketData } from "../modules/websocket/types";
import { debug } from "../utils/debug";

/**
 * Server configuration options
 */
export interface ServeOptions {
  /** Port number */
  port?: number;
  /** Hostname */
  hostname?: string;
  /** Development mode */
  development?: boolean;
  /** TLS configuration */
  tls?: {
    key: string;
    cert: string;
    ca?: string;
    passphrase?: string;
  };
}

/**
 * Start sinwan server with WebSocket support
 *
 * @param app - Application instance
 * @param options - Server configuration options
 * @returns Bun server instance
 *
 * @example
 * ```typescript
 * import sinwan, { serve } from 'sinwan';
 *
 * const app = sinwan();
 *
 * // Add WebSocket support
 * app.plugin(sinwan.ws());
 *
 * // Setup routes
 * app.get('/', (req, res) => {
 *   res.send('Hello World');
 * });
 *
 * // Setup WebSocket
 * const io = app.io();
 * io.on('connection', (socket) => {
 *   socket.emit('welcome', 'Connected!');
 * });
 *
 * // Start server
 * app.listen(3000,()=>{
 *   console.log('Server running on http://localhost:3000');
 * });
 *
 * ```
 */
export async function serve(
  app: Application,
  options: ServeOptions = {},
): Promise<any> {
  const {
    port = 3000,
    hostname = "0.0.0.0",
    development = false,
    tls,
  } = options;

  // Run application startup hooks
  await app.runStartHooks();

  // Get WebSocket instance if available
  const wsModule = (app as any)._wsInstance;
  const wsPath = app.get("websocket.path") || "/sinwan.io";
  const wsEnabled = app.get("websocket.enabled") === true;

  // Create Bun server with WebSocket support
  const server = Bun.serve<WebSocketData>({
    port,
    hostname,
    development,
    tls,

    /**
     * Handle incoming HTTP requests and WebSocket upgrades
     */
    async fetch(req, server) {
      // Store server reference in app
      app.server = server;

      // Bind WebSocket server to Bun server
      if (wsModule && wsModule.bind) {
        wsModule.bind(server);
      }

      const url = new URL(req.url);

      // Handle WebSocket upgrade requests
      if (wsEnabled && url.pathname === wsPath) {
        // Validate WebSocket upgrade
        const upgradeHeader = req.headers.get("upgrade");
        if (upgradeHeader?.toLowerCase() !== "websocket") {
          return new Response("Expected WebSocket upgrade", {
            status: 426,
            headers: {
              Upgrade: "websocket",
            },
          });
        }

        // Prepare WebSocket data
        const socketData: WebSocketData = {
          id: crypto.randomUUID(),
          handshake: {
            time: new Date().toISOString(),
            url: req.url,
            headers: Object.fromEntries(req.headers.entries()),
            query: Object.fromEntries(url.searchParams.entries()),
            address: server.requestIP(req)?.address || "unknown",
            secure: url.protocol === "wss:",
          },
          rooms: new Set(),
          connected: false,
        };

        // Load session from cookie if session middleware is configured
        const sessionConfig = (app as any)._sessionConfig;
        if (sessionConfig) {
          try {
            const cookieName = sessionConfig.name || "sinwan.sid";
            const secrets = Array.isArray(sessionConfig.secret)
              ? sessionConfig.secret
              : [sessionConfig.secret];
            const store = sessionConfig.store;

            // Parse session cookie from request headers
            const cookieHeader = req.headers.get("cookie") || "";
            // console.log("WS Cookie Header:", cookieHeader);

            const cookies: Record<string, string> = {};
            for (const pair of cookieHeader.split(";")) {
              const [key, ...rest] = pair.trim().split("=");
              if (key) cookies[key.trim()] = decodeURIComponent(rest.join("="));
            }

            const signedSid = cookies[cookieName];
            // console.log("WS Signed SID:", signedSid);

            if (signedSid) {
              const sid = unsignSessionId(signedSid, secrets);
              // console.log("WS Unsigned SID:", sid);

              if (sid !== false) {
                const data = await store.get(sid);
                // console.log("WS Session Data Found:", !!data);

                if (data) {
                  socketData.session = data;
                }
              }
            } else {
              debug.warn("WS No session cookie found for name:", cookieName);
            }
          } catch (e) {
            debug.warn("Failed to load session for WebSocket:", e);
          }
        }

        // Attempt WebSocket upgrade
        const upgraded = server.upgrade(req, {
          data: socketData,
        });

        if (upgraded) {
          // Upgrade successful - return undefined to signal handling complete
          return undefined;
        }

        // Upgrade failed
        return new Response("WebSocket upgrade failed", {
          status: 400,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

      // Handle regular HTTP requests through application
      try {
        return app.fetch(req);
      } catch (error) {
        debug.error("Error handling request:", error);
        return new Response(
          JSON.stringify({
            error: "Internal Server Error",
            message: development ? (error as Error).message : undefined,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    },

    /**
     * WebSocket configuration and handlers
     */
    websocket: {
      /**
       * Handle new WebSocket connection
       */
      open(ws: ServerWebSocket<WebSocketData>) {
        if (!wsModule) {
          debug.warn("WebSocket connection opened but module not initialized");
          ws.close(1011, "WebSocket module not available");
          return;
        }

        try {
          // Reconstruct request for createSocket
          const url = ws.data.handshake.url;
          const headers = new Headers(ws.data.handshake.headers);

          const req = new Request(url, {
            headers,
            method: "GET",
          });

          // Create socket wrapper and register with server
          wsModule.createSocket(ws, req);
        } catch (error) {
          debug.error("Error creating WebSocket:", error);
          ws.close(1011, "Connection initialization failed");
        }
      },

      /**
       * Handle incoming WebSocket message
       */
      message(
        ws: ServerWebSocket<WebSocketData>,
        message: string | ArrayBuffer | Uint8Array,
      ) {
        if (!wsModule) {
          return;
        }

        try {
          // Get socket from registry
          const socket = wsModule.sockets.get(ws.data.id);

          if (!socket) {
            debug.warn(`Socket ${ws.data.id} not found in registry`);
            return;
          }

          // Handle message
          wsModule.handleMessage(socket, message);
        } catch (error) {
          debug.error("Error handling WebSocket message:", error);
        }
      },

      /**
       * Handle WebSocket connection close
       */
      close(ws: ServerWebSocket<WebSocketData>, code: number, reason: string) {
        if (!wsModule) {
          return;
        }

        try {
          const socket = wsModule.sockets.get(ws.data.id);

          if (socket) {
            // Update disconnect reason
            ws.data.disconnectReason = reason || `Code: ${code}`;
            ws.data.connected = false;

            // Remove socket from server
            wsModule.removeSocket(ws.data.id);
          }
        } catch (error) {
          debug.error("Error handling WebSocket close:", error);
        }
      },

      /**
       * Handle backpressure drain
       */
      drain(ws: ServerWebSocket<WebSocketData>) {
        // Called when send buffer has been drained
        // Can be used to resume sending if throttled
        if (wsModule) {
          const socket = wsModule.sockets.get(ws.data.id);
          if (socket) {
            socket.emit("drain");
          }
        }
      },

      // WebSocket configuration from plugin options
      maxPayloadLength: wsModule?._options?.maxPayload || 16 * 1024 * 1024,
      idleTimeout: wsModule?._options?.idleTimeout || 120,
      perMessageDeflate: wsModule?._options?.perMessageDeflate ?? true,
      backpressureLimit: wsModule?._options?.backpressureLimit || 1024 * 1024,
      closeOnBackpressureLimit:
        wsModule?._options?.closeOnBackpressureLimit ?? false,
    },

    /**
     * Handle server errors
     */
    error(error) {
      debug.error("Server error:", error);

      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message: development ? error.message : undefined,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  });

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    debug.info(`${signal} received, shutting down gracefully...`);

    try {
      // Destroy application (this runs stop hooks internally)
      await app.destroy();

      // Stop Bun server
      server.stop();
      debug.success("Server stopped successfully");
      process.exit(0);
    } catch (error) {
      debug.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Log server start
  const protocol = tls ? "https" : "http";
  const wsProtocol = tls ? "wss" : "ws";

  debug.success(
    `sinwan server started on ${protocol}://${server.hostname}:${server.port}`,
  );
  if (wsModule) {
    debug.info(
      `WebSocket: ${wsProtocol}://${server.hostname}:${server.port}${
        wsModule.options?.path || ""
      }`,
    );
  }
  debug.info(
    `Environment: ${development ? "development" : "production"} (PID: ${
      process.pid
    })`,
  );

  return server;
}
