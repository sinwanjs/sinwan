/** @jsxImportSource sinwan */
import { createComponent, inject, signal, effect } from "sinwan";
import { CurrentPageKey } from "../App";
import { marked } from "marked";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
// Add some common languages
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";

// Import all markdown files as raw strings
const docs = import.meta.glob("../../../docs/v1/*.md", {
  query: "?raw",
  eager: true,
});

export const DocViewer = createComponent(() => {
  const currentPage = inject(CurrentPageKey)!;
  const content = signal("");
  const isLoading = signal(false);

  // Load content when currentPage changes
  effect(() => {
    isLoading.value = true;
    const loadDoc = async () => {
      const docToLoad = currentPage.value;
      console.log("[DocViewer] Loading doc:", docToLoad);
      
      try {
        // Try serverless function first (SSR support)
        if (typeof window !== "undefined") {
          try {
            console.log("[DocViewer] Attempting SSR from serverless function...");
            const response = await fetch(
              `/.netlify/functions/render?doc=${docToLoad}`,
              { signal: AbortSignal.timeout(3000) },
            );
            console.log("[DocViewer] Response status:", response.status);
            
            if (response.ok) {
              const data = await response.json();
              console.log("[DocViewer] SSR successful, rendering...");
              if (data.content) {
                content.value = marked.parse(data.content) as string;
                isLoading.value = false;
                window.scrollTo(0, 0);
                return;
              }
            }
          } catch (fetchErr) {
            console.warn(
              "[DocViewer] Serverless function error, using client-side:",
              fetchErr,
            );
          }
        }
      } catch (err) {
        console.warn("[DocViewer] SSR unavailable, falling back to client-side:", err);
      }

      // Fallback to client-side rendering
      console.log("[DocViewer] Using client-side rendering for:", docToLoad);
      const path = `../../../docs/v1/${docToLoad}`;
      const mod = docs[path] as { default: string } | undefined;
      
      if (mod) {
        console.log("[DocViewer] Found in client-side docs, rendering...");
        content.value = marked.parse(mod.default) as string;
      } else {
        console.error("[DocViewer] Document not found:", docToLoad, "Path tried:", path);
        content.value = `<h1>404</h1><p>Document not found: ${docToLoad}</p><p>Tried: ${path}</p>`;
      }
      isLoading.value = false;
      window.scrollTo(0, 0);
    };

    loadDoc();
  });

  return (
    <div class="content-viewer">
      {() => isLoading.value && <div class="loading-indicator">Loading...</div>}
      <div
        class="doc-body"
        ref={(el) => {
          effect(() => {
            if (el && content.value) {
              (el as HTMLElement).innerHTML = content.value;
              rewriteInternalDocLinks(el as HTMLElement);
              Prism.highlightAllUnder(el as HTMLElement);
            }
          });
        }}
      />
    </div>
  );
});

const rewriteInternalDocLinks = (root: HTMLElement) => {
  const links = root.querySelectorAll<HTMLAnchorElement>("a[href]");

  for (const link of links) {
    const rawHref = link.getAttribute("href");
    if (!rawHref) continue;

    const href = rawHref.trim();
    if (!href || href.startsWith("#") || href.startsWith("http")) continue;

    const mdMatch = href.match(/(?:\.\/|\.\.\/)?([^/#?]+\.md)(?:[?#].*)?$/i);
    if (!mdMatch) continue;

    const targetDoc = mdMatch[1];
    link.setAttribute("href", `#${targetDoc}`);
  }
};
