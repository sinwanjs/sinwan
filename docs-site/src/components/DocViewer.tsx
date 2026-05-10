/** @jsxImportSource sinwan */
import { createComponent, inject, signal, effect, onUnmounted } from "sinwan";
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
  const rawContent = signal("");
  const isLoading = signal(false);
  const copyLabel = signal("Copy page");
  let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

  onUnmounted(() => {
    if (copyResetTimer) clearTimeout(copyResetTimer);
  });

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

  const copyPageContent = async () => {
    const text = rawContent.value.trim();
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      copyLabel.value = "Copied";
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copyLabel.value = "Copy page";
      }, 1500);
    } catch (error) {
      console.error("[DocViewer] Copy failed:", error);
      copyLabel.value = "Copy failed";
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copyLabel.value = "Copy page";
      }, 1500);
    }
  };

  return (
    <div class="content-viewer">
      <div class="doc-toolbar">
        <button
          class="copy-button"
          type="button"
          onClick={copyPageContent}
          disabled={() => !rawContent.value}
          aria-label="Copy the current page content"
        >
          {() => copyLabel.value}
        </button>
      </div>
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
