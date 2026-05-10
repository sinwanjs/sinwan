import type { Context } from "@netlify/functions";

const DOCS = [
  { id: "00-philosophy.md", title: "Philosophy" },
  { id: "01-getting-started.md", title: "Getting Started" },
  { id: "02-architecture.md", title: "Architecture" },
  { id: "03-reactivity.md", title: "Reactivity" },
  { id: "04-components.md", title: "Components" },
  { id: "05-lifecycle.md", title: "Lifecycle" },
  { id: "06-provide-inject.md", title: "Provide / Inject" },
  { id: "07-jsx.md", title: "JSX" },
  { id: "08-renderer.md", title: "Renderer" },
  { id: "09-ssr.md", title: "SSR" },
  { id: "10-hydration.md", title: "Hydration" },
  { id: "11-escaping.md", title: "Escaping" },
  { id: "12-runtime-compat.md", title: "Runtime Compatibility" },
  { id: "13-build-and-deploy.md", title: "Build & Deploy" },
  { id: "14-recipes.md", title: "Recipes" },
  { id: "15-api-reference.md", title: "API Reference" },
  { id: "16-types.md", title: "Types" },
  { id: "17-troubleshooting.md", title: "Troubleshooting" },
  { id: "CHANGELOG.md", title: "Changelog" },
];

export default async (req: Request, context: Context) => {
  return new Response(
    JSON.stringify({
      docs: DOCS,
      version: "1.1.2",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
      },
    },
  );
};
