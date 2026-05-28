import { serve } from "bun";
import index from "./index.html";

// =========================
// SERVER
// =========================

const server = serve({
  port: 3001,
  routes: {
    // =========================
    // FRONTEND
    // =========================

    "/*": index,
  },

  development:
    process.env.NODE_ENV !== "production"
      ? {
          hmr: true,
          console: true,
        }
      : false,
});

console.log(`🚀 Server running at ${server.url}`);
