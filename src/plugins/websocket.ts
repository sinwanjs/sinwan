import type { Application } from "../core/application";
import { createIOServer } from "../modules/websocket";
import type {
  sinwanIOServer,
  WebSocketOptions,
} from "../modules/websocket/types";
import type { Plugin } from "../types";
import { debug } from "../utils/debug";

/**
 * Extend Application interface to include WebSocket methods
 */
declare module "../core/application" {
  interface Application {
    /**
     * Get WebSocket IO server instance
     */
    io: () => sinwanIOServer;

    /**
     * Alias for io()
     */
    websocket: () => sinwanIOServer;

    /**
     * Internal WebSocket instance storage
     * @internal
     */
    _wsInstance?: sinwanIOServer;
  }
}

/**
 * Create WebSocket plugin
 *
 * @param options - WebSocket server configuration
 * @returns Plugin instance
 *
 * @example
 * ```typescript
 * import sinwan from 'sinwan';
 *
 * const app = sinwan();
 *
 * // Add WebSocket support
 * app.use(sinwan.ws({
 *   path: '/socket.io',
 *   compression: true,
 *   maxPayload: 16 * 1024 * 1024,
 *   pingInterval: 25000,
 *   pingTimeout: 20000,
 *   cors: {
 *     origin: '*',
 *     methods: ['GET', 'POST']
 *   }
 * }));
 *
 * // Use WebSocket server
 * const io = app.io();
 *
 * io.on('connection', (socket) => {
 *   console.log('Client connected:', socket.id);
 *
 *   // Join a room
 *   socket.join('chat-room');
 *
 *   // Handle events
 *   socket.on('chat-message', (data) => {
 *     // Broadcast to room
 *     socket.to('chat-room').emit('new-message', data);
 *   });
 *
 *   // Handle with acknowledgment
 *   socket.on('request-data', (data, ack) => {
 *     ack(null, { success: true, data: processedData });
 *   });
 *
 *   socket.on('disconnect', () => {
 *     console.log('Client disconnected');
 *   });
 * });
 *
 * // Namespace support
 * const adminNamespace = io.of('/admin');
 *
 * adminNamespace.on('connection', (socket) => {
 *   socket.emit('admin-connected');
 * });
 *
 * app.listen(3000);
 * ```
 */
export function websocketPlugin(options: WebSocketOptions = {}): Plugin {
  let io: sinwanIOServer | undefined;

  return {
    name: "websocket",
    version: "1.0.0",

    install(app: Application) {
      // Validate options
      if (options.maxPayload && options.maxPayload < 1024) {
        throw new Error("maxPayload must be at least 1024 bytes");
      }

      if (options.idleTimeout && options.idleTimeout < 1) {
        throw new Error("idleTimeout must be at least 1 second");
      }

      // Set default path if not provided
      const wsPath = options.path || "/sinwan.io";

      // Store WebSocket path in app settings
      app.set("websocket.path", wsPath);
      app.set("websocket.enabled", true);

      // Create WebSocket server instance
      io = createIOServer(options);

      // Add methods to application
      app.extend("application", "io", () => {
        if (!io) {
          throw new Error("WebSocket server not initialized");
        }
        return io;
      });

      app.extend("application", "websocket", () => {
        if (!io) {
          throw new Error("WebSocket server not initialized");
        }
        return io;
      });

      // Ensure methods are accessible
      if (!(app as Application).io) {
        (app as Application).io = () => {
          if (!io) {
            throw new Error("WebSocket server not initialized");
          }
          return io;
        };
      }

      if (!(app as Application).websocket) {
        (app as Application).websocket = () => {
          if (!io) {
            throw new Error("WebSocket server not initialized");
          }
          return io;
        };
      }

      // Store instance for server access
      (app as Application)._wsInstance = io;

      // Handle graceful shutdown
      app.onStop(async () => {
        if (io) {
          try {
            await io.close();
            debug.info("WebSocket server closed gracefully");
          } catch (error) {
            console.error("Error closing WebSocket server:", error);
          } finally {
            io = undefined;
          }
        }
      });

      // Log initialization
      if (process.env.NODE_ENV !== "production") {
        debug.success(`[sinwan] WebSocket server initialized at ${wsPath}`);
      }
    },
  };
}

/**
 * Get WebSocket instance from application
 *
 * @param app - Application instance
 * @returns WebSocket IO server instance
 * @throws Error if WebSocket not initialized
 *
 * @example
 * ```typescript
 * const io = getWebSocketInstance(app);
 * io.emit('broadcast', { message: 'Hello all!' });
 * ```
 */
export function getWebSocketInstance(app: Application): sinwanIOServer {
  const instance = (app as Application)._wsInstance;

  if (!instance) {
    throw new Error("WebSocket not initialized. Use app.plugin(sinwan.ws())");
  }

  return instance;
}

/**
 * WebSocket middleware factory
 * Creates middleware for handling WebSocket connections
 *
 * @example
 * ```typescript
 * // Authentication middleware
 * io.use((socket, next) => {
 *   const token = socket.handshake.query.token;
 *
 *   if (!token) {
 *     return next(new Error('Authentication required'));
 *   }
 *
 *   verifyToken(token, (err, user) => {
 *     if (err) return next(err);
 *     socket.data.userData = user;
 *     next();
 *   });
 * });
 * ```
 */
export function createWebSocketMiddleware(
  fn: (socket: any, next: (err?: any) => void) => void | Promise<void>,
) {
  return fn;
}

/**
 * Get WebSocket statistics
 *
 * @param app - Application instance
 * @returns WebSocket statistics object
 *
 * @example
 * ```typescript
 * const stats = getWebSocketStats(app);
 * console.log('Active connections:', stats.activeConnections);
 * console.log('Total messages:', stats.messagesSent + stats.messagesReceived);
 * ```
 */
export function getWebSocketStats(app: Application) {
  const io = getWebSocketInstance(app);
  return (io as any).stats;
}

// Re-export types for convenience
export type {
  BroadcastOptions,
  sinwanIOServer,
  sinwanSocket,
  WebSocketMiddleware,
  WebSocketOptions,
  WebSocketStats,
} from "../modules/websocket/types";
