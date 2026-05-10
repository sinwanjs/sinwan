import { readFile } from "fs/promises";
import { resolve } from "path";
import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const doc = url.searchParams.get("doc") || "00-philosophy.md";

  console.log("[ssr] Rendering doc:", doc);

  // Validate doc parameter
  if (
    !doc.match(/^[0-9a-zA-Z-]+\.md$/) &&
    doc !== "README.md" &&
    doc !== "CHANGELOG.md"
  ) {
    return new Response("Invalid document requested", { status: 400 });
  }

  try {
    // Try multiple path strategies
    const possiblePaths = [
      resolve(__dirname, "..", "..", "..", "docs", "v1", doc),
      process.env.LAMBDA_TASK_ROOT
        ? resolve(process.env.LAMBDA_TASK_ROOT, "..", "..", "docs", "v1", doc)
        : null,
      resolve(process.cwd(), "..", "..", "docs", "v1", doc),
    ].filter((p): p is string => p !== null);

    let content: string | null = null;

    for (const docPath of possiblePaths) {
      try {
        console.log("[ssr] Trying:", docPath);
        content = await readFile(docPath, "utf-8");
        break;
      } catch {
        continue;
      }
    }

    if (!content) {
      console.error("[ssr] Not found:", doc);
      return new Response("Document not found", { status: 404 });
    }

    // Return SSR data as JSON for client-side rendering
    return new Response(
      JSON.stringify({
        success: true,
        doc,
        content,
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  } catch (error) {
    console.error("[ssr] Error:", error);
    return new Response("Server error", { status: 500 });
  }
};
