import { serve } from "bun";
import index from "./index.html";
import mongoose from "mongoose";

// =========================
// CONNECT MONGODB
// =========================

await main();

async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017", {
    user: "admin",
    pass: "secret123",
  });

  console.log("✅ Connected to MongoDB");
}

// =========================
// HELPERS
// =========================

function getDatabase(name: string) {
  const db = mongoose.connection.useDb(name);

  if (!db.db) {
    throw new Error("Database not initialized");
  }

  return db.db;
}

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

    // =========================
    // GET ALL DATABASES
    // GET /api/dbs
    // =========================

    "/api/dbs": async () => {
      try {
        const admin = mongoose.connection.db!.admin();
        // await Bun.sleep(1000); // Simulate loading
        const result = await admin.listDatabases();
        return Response.json({
          success: true,
          databases: result.databases.map((db) => ({
            name: db.name,
            sizeOnDisk: db.sizeOnDisk,
            empty: db.empty,
          })),
        });
      } catch (err: any) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          { status: 500 },
        );
      }
    },

    // =========================
    // GET COLLECTIONS
    // GET /api/db/:db/collections
    // =========================

    "/api/db/:db/collections": async (req) => {
      try {
        const dbName = req.params.db;

        const database = getDatabase(dbName);

        const collections = await database.listCollections().toArray();

        return Response.json({
          success: true,
          database: dbName,
          collections: collections.map((c) => ({
            name: c.name,
            type: c.type,
          })),
        });
      } catch (err: any) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          { status: 500 },
        );
      }
    },

    // =========================
    // GET DOCUMENTS
    // GET /api/db/:db/collection/:collection
    // =========================

    "/api/db/:db/collection/:collection": async (req) => {
      try {
        const dbName = req.params.db;

        const collectionName = req.params.collection;

        const limit = Number(new URL(req.url).searchParams.get("limit") || 20);

        const database = getDatabase(dbName);

        const collection = database.collection(collectionName);

        const documents = await collection.find({}).limit(limit).toArray();

        return Response.json({
          success: true,
          database: dbName,
          collection: collectionName,
          count: documents.length,
          // documents,
          schema: documents.length
            ? Object.fromEntries(
                Object.entries(documents[0] ?? {}).map(([key, value]) => [
                  key,
                  value === null
                    ? "null"
                    : Array.isArray(value)
                      ? "array"
                      : typeof value,
                ]),
              )
            : {},
        });
      } catch (err: any) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          { status: 500 },
        );
      }
    },

    // =========================
    // GET ONE DOCUMENT
    // GET /api/db/:db/collection/:collection/:id
    // =========================

    "/api/db/:db/collection/:collection/:id": async (req) => {
      try {
        const dbName = req.params.db;

        const collectionName = req.params.collection;

        const id = req.params.id;

        const database = getDatabase(dbName);

        const collection = database.collection(collectionName);

        const document = await collection.findOne({
          _id: new mongoose.Types.ObjectId(id),
        });

        if (!document) {
          return Response.json(
            {
              success: false,
              error: "Document not found",
            },
            { status: 404 },
          );
        }

        // =========================
        // DYNAMIC SCHEMA
        // =========================

        const schema: Record<string, string> = {};

        Object.entries(document).forEach(([key, value]) => {
          schema[key] =
            value === null
              ? "null"
              : Array.isArray(value)
                ? "array"
                : typeof value;
        });

        return Response.json({
          success: true,
          database: dbName,
          collection: collectionName,
          document,
          schema,
        });
      } catch (err: any) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          { status: 500 },
        );
      }
    },

    // =========================
    // GET COLLECTION SCHEMA
    // GET /api/db/:db/schema/:collection
    // =========================

    "/api/db/:db/schema/:collection": async (req) => {
      try {
        const dbName = req.params.db;

        const collectionName = req.params.collection;

        const database = getDatabase(dbName);

        const collection = database.collection(collectionName);

        const docs = await collection.find({}).limit(100).toArray();

        const schema: Record<string, Set<string>> = {};

        docs.forEach((doc) => {
          Object.entries(doc).forEach(([key, value]) => {
            if (!schema[key]) {
              schema[key] = new Set();
            }

            schema[key].add(
              value === null
                ? "null"
                : Array.isArray(value)
                  ? "array"
                  : typeof value,
            );
          });
        });

        const formattedSchema = Object.fromEntries(
          Object.entries(schema).map(([key, types]) => [key, [...types]]),
        );

        return Response.json({
          success: true,
          database: dbName,
          collection: collectionName,
          schema: formattedSchema,
        });
      } catch (err: any) {
        return Response.json(
          {
            success: false,
            error: err.message,
          },
          { status: 500 },
        );
      }
    },
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
