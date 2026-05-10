import { renderToHydratableString } from "sinwan/server";
import type { Context } from "@netlify/functions";

// Map of doc files loaded at build time
const docModules = import.meta.glob("../../docs/v1/*.md", {
  query: "?raw",
  eager: true,
});

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const doc = url.searchParams.get("doc") || "00-philosophy.md";

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
    const docPath = `../../docs/v1/${doc}`;
    const docMod = docModules[docPath] as { default: string } | undefined;

    if (!docMod) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Return just the markdown content as JSON
    // The client will render it with DocViewer
    return new Response(
      JSON.stringify({
        success: true,
        doc,
        content: docMod.default,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        },
      },
    );
  } catch (error) {
    console.error("Error rendering doc:", error);
    return new Response(
      JSON.stringify({ error: "Failed to render document" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
