/** @jsxImportSource sinwan */
import { cc, inject, signal, effect, onUnmounted } from "sinwan";
import { CurrentPageKey, RawContentKey } from "../App";
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
  const rawContent = inject(RawContentKey)!;
  const content = signal("");
  const isLoading = signal(false);

  // Load content when currentPage changes
  effect(() => {
    isLoading.value = true;
    const loadDoc = async () => {
      const docToLoad = currentPage.value;
      const path = `../../../docs/v1/${docToLoad}`;
      const mod = docs[path] as { default: string } | undefined;

      if (mod) {
        rawContent.value = mod.default;
        content.value = marked.parse(mod.default) as string;
      } else {
        rawContent.value = "";
        console.error(
          "[DocViewer] Document not found:",
          docToLoad,
          "Path tried:",
          path,
        );
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
      <div class="doc-body">
        {() => {
          if (!content.value) return null;

          return (
            <div
              ref={(el) => {
                if (el) {
                  el.innerHTML = content.value;
                  rewriteInternalDocLinks(el as HTMLElement);
                  Prism.highlightAllUnder(el);
                }
              }}
            />
          );
        }}
      </div>
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
