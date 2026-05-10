import { readFile } from "fs/promises";
import { join, resolve } from "path";
import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const doc = url.searchParams.get("doc") || "00-philosophy.md";

  console.log("[render] Fetching doc:", doc);

  // Validate doc parameter to prevent directory traversal
  if (
    !doc.match(/^[0-9a-zA-Z-]+\.md$/) &&
    doc !== "README.md" &&
    doc !== "CHANGELOG.md"
  ) {
    return new Response(
      JSON.stringify({ error: "Invalid document requested" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // Try multiple path strategies for Netlify Functions environment
    const possiblePaths = [
      // Strategy 1: From netlify/functions relative to repo root
      resolve(__dirname, "..", "..", "..", "docs", "v1", doc),
      // Strategy 2: Using LAMBDA_TASK_ROOT env var (if available)
      process.env.LAMBDA_TASK_ROOT
        ? resolve(process.env.LAMBDA_TASK_ROOT, "..", "..", "docs", "v1", doc)
        : null,
      // Strategy 3: Using process.cwd()
      resolve(process.cwd(), "..", "..", "docs", "v1", doc),
    ].filter((p): p is string => p !== null);

    let content: string | null = null;
    let successPath = "";

    for (const docPath of possiblePaths) {
      try {
        console.log("[render] Trying path:", docPath);
        content = await readFile(docPath, "utf-8");
        successPath = docPath;
        console.log("[render] Successfully loaded from:", docPath);
        break;
      } catch (e) {
        console.log("[render] Failed:", docPath);
        continue;
      }
    }

    if (!content) {
      console.error("[render] All paths failed for doc:", doc);
      return new Response(
        JSON.stringify({ error: "Document not found", doc, attempts: possiblePaths }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        doc,
        content,
        loadedFrom: successPath,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  } catch (error) {
    console.error("[render] Error:", error);
    return new Response(
      JSON.stringify({ error: "Server error", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
